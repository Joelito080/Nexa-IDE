import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { workspaceEngine } from '../workspaceEngine'
import { WorkspaceSnapshot } from '../workspaceEngine'
import { isPathInsideWorkspace } from '../safetyRules'

export interface DependencyNode {
  filePath: string
  imports: string[]
  dependencies: string[]
  importedBy: string[]
}

export interface ProjectGraph {
  rootPath: string
  files: string[]
  nodes: Record<string, DependencyNode>
  packageDependencies: string[]
}

const IMPORT_SOURCE_PATTERN = /(?:import\s+(?:[\s\S]+?)\s+from\s+|import\s+['"]|require\(\s*['"])([^'"]+)['"]/g
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']

function flattenFileTree(nodes: WorkspaceSnapshot['fileTree']): string[] {
  const result: string[] = []
  const walk = (item: { path: string; isFile: boolean; children?: any[] }) => {
    if (item.isFile) {
      result.push(item.path)
    }
    if (item.children) {
      for (const child of item.children) walk(child)
    }
  }
  for (const node of nodes) walk(node)
  return result
}

function extractImportSources(content: string): string[] {
  const matches: string[] = []
  let match: RegExpExecArray | null
  while ((match = IMPORT_SOURCE_PATTERN.exec(content)) !== null) {
    const source = match[1].trim()
    if (source) matches.push(source)
  }
  return Array.from(new Set(matches))
}

function resolveImportPath(importSource: string, filePath: string, rootPath: string, fileSet: Set<string>): string | null {
  if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
    return null
  }

  let target = path.resolve(path.dirname(filePath), importSource)
  const candidates = new Set<string>()
  if (path.extname(target)) {
    candidates.add(target)
  } else {
    for (const ext of EXTENSIONS) {
      candidates.add(`${target}${ext}`)
      candidates.add(path.join(target, `index${ext}`))
    }
  }

  for (const candidate of candidates) {
    if (!candidate.startsWith(rootPath)) continue
    if (fileSet.has(candidate)) return candidate
  }

  return null
}

async function readPackageDependencies(rootPath: string): Promise<string[]> {
  try {
    const pkgPath = path.join(rootPath, 'package.json')
    const raw = await fsPromises.readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? [])]
  } catch {
    return []
  }
}

export async function buildDependencyGraph(rootPath: string): Promise<ProjectGraph> {
  workspaceEngine.setRoot(rootPath)
  await workspaceEngine.loadFileTree()
  const snapshot = await workspaceEngine.getSnapshot()
  const files = flattenFileTree(snapshot.fileTree).filter((file) => EXTENSIONS.some((ext) => file.endsWith(ext)))
  const fileSet = new Set(files)
  const nodes: Record<string, DependencyNode> = {}

  for (const filePath of files) {
    try {
      const content = await fsPromises.readFile(filePath, 'utf-8')
      const imports = extractImportSources(content)
      const dependencies = imports
        .map((source) => resolveImportPath(source, filePath, rootPath, fileSet))
        .filter((resolved): resolved is string => Boolean(resolved))

      nodes[filePath] = {
        filePath,
        imports,
        dependencies,
        importedBy: [],
      }
    } catch {
      nodes[filePath] = {
        filePath,
        imports: [],
        dependencies: [],
        importedBy: [],
      }
    }
  }

  for (const node of Object.values(nodes)) {
    for (const dep of node.dependencies) {
      if (nodes[dep]) {
        nodes[dep].importedBy.push(node.filePath)
      }
    }
  }

  const packageDependencies = await readPackageDependencies(rootPath)
  return { rootPath, files, nodes, packageDependencies }
}

export function findRelevantFiles(task: string, graph: ProjectGraph, snapshot: WorkspaceSnapshot): string[] {
  const normalizedTask = task.toLowerCase()
  const candidates = new Set<string>()
  const allTokens = Array.from(new Set((normalizedTask.match(/\b[a-z][a-z0-9_.-/]+\b/g) || []).map((t) => t.replace(/[./_-]+/g, ''))))

  for (const filePath of graph.files) {
    const basename = path.basename(filePath).toLowerCase()
    const relative = path.relative(graph.rootPath, filePath).toLowerCase()
    for (const token of allTokens) {
      if (basename.includes(token) || relative.includes(token)) {
        candidates.add(filePath)
      }
    }
  }

  if (normalizedTask.includes('package.json') || normalizedTask.includes('dependency') || normalizedTask.includes('install')) {
    const pkgJson = path.join(graph.rootPath, 'package.json')
    candidates.add(pkgJson)
  }

  const normalizedTaskNoPunctuation = normalizedTask.replace(/[./_-]+/g, '')
  const explicitFiles = ['tsconfig.json', 'jsconfig.json', 'package.json', 'vite.config.ts', 'vite.config.js', 'eslintrc.json', 'eslintrc.js']
  for (const candidateName of explicitFiles) {
    const normalizedCandidateName = candidateName.replace(/[./_-]+/g, '')
    if (normalizedTaskNoPunctuation.includes(normalizedCandidateName)) {
      const rootCandidate = path.join(graph.rootPath, candidateName)
      if (graph.files.includes(rootCandidate)) {
        candidates.add(rootCandidate)
      }
      const candidatePaths = graph.files.filter((file) => path.basename(file).toLowerCase() === candidateName)
      for (const candidatePath of candidatePaths) candidates.add(candidatePath)
    }
  }

  const activeCandidates = snapshot.recentFiles.filter((file) => candidates.has(file) || graph.files.includes(file))
  for (const file of activeCandidates) candidates.add(file)

  if (candidates.size === 0) {
    const topFiles = snapshot.recentFiles.length ? snapshot.recentFiles : graph.files.slice(0, 8)
    for (const file of topFiles) {
      if (file && path.resolve(file) !== path.resolve(graph.rootPath)) {
        candidates.add(file)
      }
    }
  }

  const filteredCandidates = Array.from(candidates).filter((file) => {
    try {
      const stat = fs.statSync(file)
      return stat.isFile()
    } catch {
      return false
    }
  })

  return filteredCandidates.slice(0, 12)
}
