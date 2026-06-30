import fsPromises from 'node:fs/promises'
import path from 'node:path'
import log from 'electron-log'
import { askAI, type AIRequestOptions } from '../aiService'
import {
  executeTool,
  parseToolCalls,
  type ToolContext,
  type ToolResult,
} from './toolHandlers'
import { buildFileContext } from './fileContextEngine'
import {
  openBrowser,
  takeScreenshot,
  inspectDom,
  getConsoleLogs,
  type BrowserLogEntry,
} from './browserAutomation'

export interface HealingAction {
  type: 'install' | 'edit' | 'run' | 'retry'
  description: string
  command?: string
  filePath?: string
}

export interface VisualVerificationResult {
  previewUrl?: string
  screenshotPath?: string
  dom: string
  logs: BrowserLogEntry[]
  issues: string[]
  summary: string
}

export interface VisualHealingResult {
  detected: boolean
  issue: string
  actions: string[]
  fixed: boolean
  output: string
  toolResults: ToolResult[]
}

export interface HealingResult {
  detected: boolean
  issue: string
  actions: HealingAction[]
  fixed: boolean
  output: string
}

const ERROR_PATTERNS: Array<{
  pattern: RegExp
  issue: string
  heal: (match: RegExpMatchArray, ctx: ToolContext, output: string) => Promise<HealingAction[]>
}> = [
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/i,
    issue: 'Missing import/module',
    heal: async (match, ctx) => {
      const mod = match[1]
      if (mod.startsWith('.') || mod.startsWith('/')) {
        return [{ type: 'edit', description: `Fix import path for ${mod}`, filePath: mod }]
      }
      const pkg = mod.startsWith('@') ? mod.split('/').slice(0, 2).join('/') : mod.split('/')[0]
      return [{ type: 'install', description: `Install missing package ${pkg}`, command: pkg }]
    },
  },
  {
    pattern: /Module not found: Error: Can't resolve ['"]([^'"]+)['"]/i,
    issue: 'Webpack/vite module not found',
    heal: async (match) => {
      const mod = match[1]
      if (mod.startsWith('.')) return [{ type: 'edit', description: `Fix resolve path ${mod}` }]
      return [{ type: 'install', description: `Install ${mod}`, command: mod }]
    },
  },
  {
    pattern: /npm ERR! code ERESOLVE|peer dep/i,
    issue: 'npm dependency conflict',
    heal: async () => [{ type: 'run', description: 'Retry with legacy peer deps', command: 'npm install --legacy-peer-deps' }],
  },
  {
    pattern: /npm ERR!|pnpm ERR!|yarn ERR!/i,
    issue: 'Package manager install failed',
    heal: async () => [{ type: 'retry', description: 'Retry npm install', command: 'npm install' }],
  },
  {
    pattern: /SyntaxError: (.+)/i,
    issue: 'JavaScript syntax error',
    heal: async (match) => [{ type: 'edit', description: `Fix syntax error: ${match[1]}` }],
  },
  {
    pattern: /TS(\d+):/i,
    issue: 'TypeScript compilation error',
    heal: async () => [{ type: 'run', description: 'Run TypeScript check for details', command: 'npx tsc --noEmit' }],
  },
  {
    pattern: /error TS(\d+)/i,
    issue: 'TypeScript error',
    heal: async () => [{ type: 'run', description: 'Run tsc for error details', command: 'npx tsc --noEmit 2>&1 | head -20' }],
  },
  {
    pattern: /command not found|is not recognized/i,
    issue: 'Command not found',
    heal: async (_m, _ctx, output) => {
      if (output.includes('tsc')) return [{ type: 'install', description: 'Install typescript', command: 'typescript' }]
      if (output.includes('vite')) return [{ type: 'install', description: 'Install vite', command: 'vite' }]
      return [{ type: 'run', description: 'Check PATH and retry' }]
    },
  },
  {
    pattern: /ENOENT.*package\.json/i,
    issue: 'No package.json in cwd',
    heal: async () => [{ type: 'run', description: 'Navigate to project root' }],
  },
]

export function detectIssues(output: string): { issue: string; pattern: RegExp; match: RegExpMatchArray } | null {
  for (const { pattern, issue } of ERROR_PATTERNS) {
    const match = output.match(pattern)
    if (match) return { issue, pattern, match }
  }
  return null
}

function detectVisualIssues(dom: string, logs: BrowserLogEntry[]): string[] {
  const issues: string[] = []
  const lowerDom = dom.toLowerCase()
  const bodyContent = lowerDom.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').trim()

  if (!bodyContent || bodyContent.length < 20 || /<body[^>]*>\s*(<script|<\/body>)/.test(lowerDom)) {
    issues.push('blank page')
  }

  const logText = logs.map((entry) => `${entry.type}:${entry.text}`).join('\n').toLowerCase()
  if (logs.some((entry) => entry.type === 'error' || entry.type === 'pageerror' || /error/.test(entry.text))) {
    issues.push('console errors')
  }
  if (/cannot find module|module not found|failed to load module|Uncaught ReferenceError|Uncaught SyntaxError/.test(logText)) {
    issues.push('missing module errors')
  }
  if (/hydration|hydration failed|warning.*hydration/.test(logText)) {
    issues.push('hydration warnings')
  }
  if (/failed to load resource|404 .*\.(js|css|png|jpg|jpeg|svg|webp|gif)|net::err_failed|net::err_aborted/.test(logText)) {
    issues.push('broken asset links')
  }
  if (!lowerDom.includes('id="root"') && !lowerDom.includes('id="app"') && /<body[^>]*>/.test(lowerDom) && bodyContent.length < 50) {
    issues.push('missing expected root element')
  }

  return [...new Set(issues)]
}

async function captureVisualState(ctx: ToolContext): Promise<VisualVerificationResult> {
  const previewUrl = ctx.activePreviewUrl
  if (!previewUrl) {
    return {
      dom: '',
      logs: [],
      issues: [],
      summary: 'No preview URL available for visual verification',
    }
  }

  const screenshotPath = path.join(ctx.workspaceRoot, '.nexus', 'visual-debug', `screenshot-${Date.now()}.png`)
  try {
    await openBrowser(previewUrl, true)
    await fsPromises.mkdir(path.dirname(screenshotPath), { recursive: true })
    await takeScreenshot(screenshotPath)
    const dom = await inspectDom('html')
    const logs = await getConsoleLogs()
    const issues = detectVisualIssues(dom, logs)
    const summary = `Detected ${issues.length} issue(s): ${issues.join(', ') || 'none'}`

    return {
      previewUrl,
      screenshotPath,
      dom,
      logs,
      issues,
      summary,
    }
  } catch (err) {
    return {
      previewUrl,
      screenshotPath,
      dom: '',
      logs: [],
      issues: ['visual verification failure'],
      summary: `Visual verification failed: ${(err as Error).message}`,
    }
  }
}

export async function runVisualSelfHeal(
  ctx: ToolContext,
  aiOptions: AIRequestOptions = {},
  maxRetries = 3,
): Promise<VisualHealingResult> {
  const toolResults: ToolResult[] = []
  if (!ctx.activePreviewUrl) {
    return {
      detected: false,
      issue: 'No preview URL detected from terminal output',
      actions: [],
      fixed: false,
      output: 'Visual verification skipped because no localhost preview URL is known.',
      toolResults,
    }
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const verification = await captureVisualState(ctx)
    if (verification.issues.length === 0) {
      return {
        detected: true,
        issue: 'No visual issues detected',
        actions: [],
        fixed: true,
        output: `Visual verification passed on attempt ${attempt}. Screenshot: ${verification.screenshotPath}`,
        toolResults,
      }
    }

    const prompt = `You are a NEXA IDE visual repair assistant.
The app is available at ${verification.previewUrl}.
Detected issues: ${verification.issues.join(', ')}.
DOM snapshot:
${verification.dom.slice(0, 2000)}

Console logs:
${verification.logs.map((logEntry) => `${logEntry.type}: ${logEntry.text}`).join('\n').slice(0, 4000)}

Using only workspace-safe tools, propose a set of fixes that directly patch the code or install missing packages.
Respond only with valid tool blocks, no extra explanation.
If you cannot produce a clear fix, respond with no tool blocks.
`;

    const aiResult = await askAI(prompt, aiOptions)
    const calls = parseToolCalls(aiResult.response)
    if (!calls.length) {
      return {
        detected: true,
        issue: verification.summary,
        actions: [aiResult.response],
        fixed: false,
        output: `No actionable tool blocks generated by AI on attempt ${attempt}.`,
        toolResults,
      }
    }

    for (const call of calls) {
      const result = await executeTool(call.tool, call.args, ctx)
      toolResults.push(result)
    }

    const buildHeal = await runBuildWithHeal(ctx)
    if (buildHeal.detected && !buildHeal.fixed) {
      toolResults.push({ success: false, output: buildHeal.output, error: `Build retry failed: ${buildHeal.issue}` })
      return {
        detected: true,
        issue: `Build failed after code patches: ${buildHeal.issue}`,
        actions: calls.map((call) => `${call.tool}:${JSON.stringify(call.args)}`),
        fixed: false,
        output: `Build failed after visual patch cycle ${attempt}. ${buildHeal.output}`,
        toolResults,
      }
    }

    const verificationAfter = await captureVisualState(ctx)
    if (verificationAfter.issues.length === 0) {
      return {
        detected: true,
        issue: verification.summary,
        actions: calls.map((call) => `${call.tool}:${JSON.stringify(call.args)}`),
        fixed: true,
        output: `Visual issues resolved after attempt ${attempt}. Screenshot: ${verificationAfter.screenshotPath}`,
        toolResults,
      }
    }

    if (attempt === maxRetries) {
      return {
        detected: true,
        issue: verificationAfter.summary,
        actions: calls.map((call) => `${call.tool}:${JSON.stringify(call.args)}`),
        fixed: false,
        output: `Visual issues still present after ${maxRetries} attempts: ${verificationAfter.summary}`,
        toolResults,
      }
    }
  }

  return {
    detected: true,
    issue: 'Unknown visual healing result',
    actions: [],
    fixed: false,
    output: 'Visual healing exited without resolution.',
    toolResults,
  }
}

export async function attemptSelfHeal(
  output: string,
  ctx: ToolContext,
  maxAttempts = 3,
): Promise<HealingResult> {
  const detected = detectIssues(output)
  if (!detected) {
    return { detected: false, issue: '', actions: [], fixed: false, output }
  }

  const entry = ERROR_PATTERNS.find((p) => p.pattern.source === detected.pattern.source || p.issue === detected.issue)
  const actions = entry ? await entry.heal(detected.match, ctx, output) : []

  log.info(`[SelfHeal] Detected: ${detected.issue}, actions: ${actions.length}`)
  const results: string[] = []
  let fixed = false

  for (const action of actions.slice(0, maxAttempts)) {
    results.push(`→ ${action.description}`)

    if (action.type === 'install' && action.command) {
      const result = await executeTool('install_package', { package: action.command }, ctx)
      results.push(result.output || result.error || '')
      if (result.success) fixed = true
    } else if (action.type === 'run' && action.command) {
      const result = await executeTool('run_terminal', { command: action.command }, ctx)
      results.push(result.output || result.error || '')
      if (result.success) fixed = true
    } else if (action.type === 'retry' && action.command) {
      const result = await executeTool('run_terminal', { command: action.command }, ctx)
      results.push(result.output || result.error || '')
      if (result.success) fixed = true
    } else if (action.type === 'edit' && action.filePath) {
      const resolved = path.isAbsolute(action.filePath)
        ? action.filePath
        : path.join(ctx.cwd, action.filePath)
      const fileCtx = await buildFileContext(resolved)
      if (fileCtx) {
        results.push(`File context loaded for ${resolved} — manual edit may be needed`)
      }
    }
  }

  return {
    detected: true,
    issue: detected.issue,
    actions,
    fixed,
    output: results.join('\n'),
  }
}

export async function runBuildWithHeal(ctx: ToolContext, buildCommand = 'npm run build'): Promise<HealingResult> {
  let result = await executeTool('run_terminal', { command: buildCommand }, ctx)
  let healResult = await attemptSelfHeal(result.output + (result.error ?? ''), ctx)

  if (healResult.fixed) {
    result = await executeTool('run_terminal', { command: buildCommand }, ctx)
    healResult = {
      ...healResult,
      fixed: result.success,
      output: healResult.output + '\n--- Retry build ---\n' + (result.output || result.error || ''),
    }
  }

  return healResult
}

