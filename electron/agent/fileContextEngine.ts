import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { memoryManager, LRUCache } from '../memoryManager'

const YIELD_EVERY = 2000

export interface FileContext {
  path: string
  content: string
  language: string
  lineCount: number
  styleHints: StyleHints
  structureSummary: string
}

export interface StyleHints {
  indent: string
  quoteStyle: 'single' | 'double' | 'mixed'
  semicolons: boolean
  usesTypeScript: boolean
  importStyle: string
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript',
    '.jsx': 'javascriptreact', '.py': 'python', '.json': 'json',
    '.css': 'css', '.html': 'html', '.md': 'markdown', '.go': 'go',
    '.rs': 'rust', '.vue': 'vue', '.svelte': 'svelte',
  }
  return map[ext] ?? 'plaintext'
}

interface ParseResult {
  lineCount: number
  tabLines: number
  spaceLines: number
  singleQuotes: number
  doubleQuotes: number
  hasSemicolons: boolean
  hasTypeAnnotation: boolean
  hasTypeImports: boolean
  exports: string[]
  classes: string[]
  fns: string[]
  defs: string[]
}

function singlePassParse(content: string, isPython: boolean): ParseResult {
  let lineCount = 0
  let tabLines = 0
  let spaceLines = 0
  let singleQuotes = 0
  let doubleQuotes = 0
  let hasSemicolons = false
  let hasTypeAnnotation = false
  let hasTypeImports = false
  const exports: string[] = []
  const classes: string[] = []
  const fns: string[] = []
  const defs: string[] = []

  let lineStart = 0
  let i = 0
  for (; i < content.length; i++) {
    const ch = content[i]

    if (ch === '\n') {
      const line = content.slice(lineStart, i)
      analyzeLine(line, lineCount === 0 && lineStart === 0)
      lineStart = i + 1
      lineCount++
    } else if (i === 0 && (ch === '\t' || ch === ' ')) {
      if (ch === '\t') tabLines++
      else spaceLines++
    }
  }

  // Last line
  if (lineStart < i) {
    const line = content.slice(lineStart)
    analyzeLine(line, false)
    lineCount++
  }

  function analyzeLine(line: string, isFirstLine: boolean) {
    if (!line) return

    if (isFirstLine) {
      if (line.startsWith('\t')) tabLines++
      else if (/^ {2}/.test(line)) spaceLines++
    } else {
      if (line.startsWith('\t')) tabLines++
      else if (/^ {2}/.test(line)) spaceLines++
    }

    for (let j = 0; j < line.length; j++) {
      const c = line[j]
      if (c === "'") singleQuotes++
      else if (c === '"') doubleQuotes++
    }

    if (!hasSemicolons) {
      const trimmed = line.trimEnd()
      if (trimmed.endsWith(';')) hasSemicolons = true
    }
    if (!hasTypeAnnotation && /:\s*\w+/.test(line)) hasTypeAnnotation = true
    if (!hasTypeImports && line.includes('import type')) hasTypeImports = true

    if (!line.trim()) return

    const exportMatch = line.match(/export\s+(?:default\s+)?(?:function|class|const|interface|type)\s+(\w+)/)
    if (exportMatch && exports.length < 8) {
      exports.push(exportMatch[1])
      return
    }

    const classMatch = line.match(/class\s+(\w+)/)
    if (classMatch && classes.length < 5) {
      classes.push(classMatch[1])
      return
    }

    const fnMatch = line.match(/(?:function|const|let|async function)\s+(\w+)/)
    if (fnMatch && fns.length < 8) {
      fns.push(fnMatch[1])
      return
    }

    if (isPython) {
      const defMatch = line.match(/^def\s+(\w+)/)
      if (defMatch && defs.length < 8) {
        defs.push(defMatch[1])
      }
    }
  }

  return {
    lineCount, tabLines, spaceLines, singleQuotes, doubleQuotes,
    hasSemicolons, hasTypeAnnotation, hasTypeImports,
    exports, classes, fns, defs,
  }
}

function analyzeStyle(parsed: ParseResult, language: string): StyleHints {
  const { tabLines, spaceLines, singleQuotes, doubleQuotes, hasSemicolons, hasTypeAnnotation, hasTypeImports } = parsed

  const indent = tabLines > spaceLines ? '\t' : '  '
  let quoteStyle: StyleHints['quoteStyle'] = 'mixed'
  if (singleQuotes > doubleQuotes * 1.5) quoteStyle = 'single'
  else if (doubleQuotes > singleQuotes * 1.5) quoteStyle = 'double'

  const usesTypeScript = language.includes('typescript') || hasTypeAnnotation
  const importStyle = hasTypeImports ? 'type-imports' : 'standard'

  return { indent, quoteStyle, semicolons: hasSemicolons, usesTypeScript, importStyle }
}

function summarizeStructure(parsed: ParseResult, language: string): string {
  const parts: string[] = []
  const { exports, classes, fns, defs } = parsed

  if (exports.length) parts.push(`exports: ${exports.join(', ')}`)
  if (classes.length) parts.push(`classes: ${classes.join(', ')}`)
  if (fns.length) parts.push(`functions: ${fns.join(', ')}`)

  if (language === 'python' && defs.length) {
    parts.push(`defs: ${defs.join(', ')}`)
  }

  return parts.length ? parts.join(' | ') : 'No significant structure detected'
}

// Cache recent FileContext results to avoid re-reading + re-analyzing the same file
const fileContextCache = new LRUCache<string, { mtime: number; context: FileContext }>(50)
memoryManager.register('fileContextCache', fileContextCache)

export async function buildFileContext(filePath: string): Promise<FileContext | null> {
  try {
    const stat = await fsPromises.stat(filePath)
    const cached = fileContextCache.get(filePath)
    if (cached && cached.mtime === stat.mtimeMs) {
      return cached.context
    }

    const content = await fsPromises.readFile(filePath, 'utf-8')
    const language = detectLanguage(filePath)

    // Single-pass parse: merges style analysis + structure detection into one scan
    const isPython = language === 'python'
    const parsed = singlePassParse(content, isPython)

    // For very large files, yield before caching
    if (parsed.lineCount > YIELD_EVERY) {
      await new Promise(resolve => setImmediate(resolve))
    }

    const context: FileContext = {
      path: filePath,
      content,
      language,
      lineCount: parsed.lineCount,
      styleHints: analyzeStyle(parsed, language),
      structureSummary: summarizeStructure(parsed, language),
    }

    fileContextCache.set(filePath, { mtime: stat.mtimeMs, context })

    return context
  } catch {
    return null
  }
}

export function clearFileContextCache(): void {
  fileContextCache.clear()
}

export function buildEditPrompt(context: FileContext, task: string): string {
  return `FILE CONTEXT for ${context.path}:
Language: ${context.language} (${context.lineCount} lines)
Structure: ${context.structureSummary}
Style: indent=${JSON.stringify(context.styleHints.indent)}, quotes=${context.styleHints.quoteStyle}, semicolons=${context.styleHints.semicolons}, ts=${context.styleHints.usesTypeScript}

TASK: ${task}

RULES:
- Preserve existing coding style exactly
- Do NOT overwrite unrelated logic
- Make minimal, targeted changes
- Match indentation and quote style

CURRENT FILE:
\`\`\`${context.language}
${context.content}
\`\`\``
}

export function validateEditPreservesStructure(
  original: string,
  edited: string,
  maxChangeRatio = 0.85,
): { valid: boolean; reason?: string } {
  if (edited.length === 0) return { valid: false, reason: 'Edit would empty the file' }

  const originalLines = original.split('\n').length
  const editedLines = edited.split('\n').length
  const lineDiff = Math.abs(editedLines - originalLines) / Math.max(originalLines, 1)

  if (lineDiff > maxChangeRatio && originalLines > 20) {
    return { valid: false, reason: 'Edit changes too much of the file (>85% line delta)' }
  }

  return { valid: true }
}
