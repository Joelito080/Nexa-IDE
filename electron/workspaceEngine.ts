import fsPromises from 'node:fs/promises'
import path from 'node:path'
import log from 'electron-log'
import { existsSync } from 'node:fs'
import simpleGit from 'simple-git'
import { memoryManager, LRUCache } from './memoryManager'

export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  children?: FileTreeNode[]
}

export interface WorkspaceSnapshot {
  rootPath: string | null
  projectRoot: string | null
  cwd: string | null
  fileTree: FileTreeNode[]
  openFiles: string[]
  recentFiles: string[]
  detectedType: string | null
  packageManager: 'npm' | 'pnpm' | 'yarn' | null
  summary: string
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.nexus', 'dist', 'build', 'coverage', '.next',
  'release', 'dist-electron', '.electron-user-data', '__pycache__', '.venv',
  '.cache', 'temp', 'logs',
])

const PROJECT_MARKERS = [
  'package.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'requirements.txt',
  '.git',
]

const YIELD_EVERY = 50
const CONCURRENCY = 8
const TREE_CACHE_TTL = 30_000

interface TreeCacheEntry {
  tree: FileTreeNode[]
}

export class WorkspaceEngine {
  constructor() {
    memoryManager.register('treeCache', this.treeCache)
    memoryManager.register('projectTypeCache', this.projectTypeCache)
  }

  private rootPath: string | null = null
  private cwd: string | null = null
  private openFiles: string[] = []
  private recentFiles: string[] = []
  private fileTree: FileTreeNode[] = []
  private projectRoot: string | null = null
  private activeScanId = 0

  private projectTypeCache = new LRUCache<string, { type: string | null; pm: 'npm' | 'pnpm' | 'yarn' | null }>(20)
  private treeCache = new LRUCache<string, TreeCacheEntry>(10, TREE_CACHE_TTL)

  setRoot(rootPath: string | null): void {
    this.activeScanId++
    this.rootPath = rootPath
    this.cwd = rootPath
    this.projectRoot = null
    this.fileTree = []
    this.treeCache.clear()
    if (rootPath) {
      this.detectProjectRoot(rootPath).then((detected) => {
        if (this.rootPath === rootPath) {
          this.projectRoot = detected
        }
      }).catch(() => { /* ignore */ })
    }
  }

  getRoot(): string | null {
    return this.rootPath
  }

  getCwd(): string | null {
    return this.cwd ?? this.rootPath
  }

  setCwd(cwd: string | null): void {
    if (!cwd) {
      this.cwd = this.rootPath
      return
    }
    if (this.rootPath && !cwd.startsWith(this.rootPath)) {
      log.warn('[Workspace] CWD outside workspace rejected:', cwd)
      return
    }
    this.cwd = cwd
  }

  syncOpenFiles(files: string[]): void {
    this.openFiles = files.slice(0, 100)
    for (const file of files) {
      if (!this.recentFiles.includes(file)) {
        this.recentFiles.unshift(file)
      }
    }
    this.recentFiles = this.recentFiles.slice(0, 50)
  }

  trackRecentFile(filePath: string): void {
    this.recentFiles = [filePath, ...this.recentFiles.filter((f) => f !== filePath)].slice(0, 50)
  }

  invalidateCache(dirPath?: string): void {
    if (dirPath) {
      this.treeCache.delete(dirPath)
    } else {
      this.treeCache.clear()
    }
  }

  async detectProjectRoot(startPath: string): Promise<string | null> {
    let current = path.resolve(startPath)
    const root = path.parse(current).root

    while (current !== root) {
      for (const marker of PROJECT_MARKERS) {
        try {
          await fsPromises.access(path.join(current, marker))
          return current
        } catch {
          // continue
        }
      }
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }

    return startPath
  }

  async loadFileTree(dirPath?: string, maxDepth = 6): Promise<FileTreeNode[]> {
    const target = dirPath ?? this.rootPath
    if (!target) {
      this.fileTree = []
      return []
    }

    const scanId = this.activeScanId

    const cached = this.treeCache.get(target)
    if (cached) {
      if (!dirPath && this.rootPath === target) {
        this.fileTree = cached.tree
      }
      return cached.tree
    }

    let buildCount = 0

    const buildTree = async (dir: string, depth: number): Promise<FileTreeNode[]> => {
      if (scanId !== this.activeScanId) return []
      if (depth > maxDepth) return []

      let entries
      try {
        entries = await fsPromises.readdir(dir, { withFileTypes: true })
      } catch {
        return []
      }

      const filtered = entries.filter((e) => {
        if (e.name.startsWith('.') && e.name !== '.env.example') return false
        if (e.isDirectory() && IGNORED_DIRS.has(e.name)) return false
        return true
      })

      filtered.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

      const nodes: FileTreeNode[] = []

      for (let i = 0; i < filtered.length; i += CONCURRENCY) {
        if (scanId !== this.activeScanId) return []
        const batch = filtered.slice(i, i + CONCURRENCY)

        const batchResults = await Promise.all(
          batch.map(async (entry) => {
            if (scanId !== this.activeScanId) return { name: '', path: '', isDirectory: false, isFile: false }
            const fullPath = path.join(dir, entry.name)
            const node: FileTreeNode = {
              name: entry.name,
              path: fullPath,
              isDirectory: entry.isDirectory(),
              isFile: entry.isFile(),
            }

            if (entry.isDirectory()) {
              try {
                node.children = await buildTree(fullPath, depth + 1)
              } catch {
                node.children = []
              }
            }

            buildCount++
            return node
          }),
        )

        if (scanId !== this.activeScanId) return []
        nodes.push(...batchResults)

        if (buildCount >= YIELD_EVERY) {
          await new Promise((resolve) => setImmediate(resolve))
          buildCount = 0
        }
      }

      return nodes
    }

    try {
      const tree = await buildTree(target, 0)
      if (!dirPath && this.rootPath === target) {
        this.fileTree = tree
      }
      this.treeCache.set(target, { tree })

      if (!this.projectRoot && this.rootPath === target) {
        const detected = await this.detectProjectRoot(target)
        if (this.rootPath === target) {
          this.projectRoot = detected
        }
      }

      return !dirPath && this.rootPath === target ? this.fileTree : tree
    } catch (err) {
      log.error('[Workspace] Failed to load file tree:', err)
      return []
    }
  }

  async detectPackageManager(projectRoot: string): Promise<'npm' | 'pnpm' | 'yarn' | null> {
    const cached = this.projectTypeCache.get(projectRoot)
    if (cached?.pm !== undefined) return cached.pm

    let pm: 'npm' | 'pnpm' | 'yarn' | null = null
    try {
      await fsPromises.access(path.join(projectRoot, 'pnpm-lock.yaml'))
      pm = 'pnpm'
    } catch { /* continue */ }
    if (!pm) try {
      await fsPromises.access(path.join(projectRoot, 'yarn.lock'))
      pm = 'yarn'
    } catch { /* continue */ }
    if (!pm) try {
      await fsPromises.access(path.join(projectRoot, 'package.json'))
      pm = 'npm'
    } catch { /* continue */ }

    const existing = this.projectTypeCache.get(projectRoot)
    this.projectTypeCache.set(projectRoot, { type: existing?.type ?? null, pm })
    return pm
  }

  async detectProjectType(projectRoot: string): Promise<string | null> {
    const cached = this.projectTypeCache.get(projectRoot)
    if (cached?.type !== undefined) return cached.type

    let type: string | null = null
    try {
      const pkgPath = path.join(projectRoot, 'package.json')
      const raw = await fsPromises.readFile(pkgPath, 'utf-8')
      const pkg = JSON.parse(raw)
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps.next) type = 'nextjs'
      else if (deps.electron) type = 'electron'
      else if (deps.express) type = 'express'
      else if (deps.react) type = 'react'
      else if (deps.vite) type = 'vite'
      else type = 'node'
    } catch { /* continue */ }
    if (!type) try {
      await fsPromises.access(path.join(projectRoot, 'requirements.txt'))
      type = 'python'
    } catch { /* continue */ }

    const existing = this.projectTypeCache.get(projectRoot)
    this.projectTypeCache.set(projectRoot, { type, pm: existing?.pm ?? null })
    return type
  }

  invalidateProjectCache(projectRoot: string): void {
    this.projectTypeCache.delete(projectRoot)
  }

  async getSnapshot(): Promise<WorkspaceSnapshot> {
    const root = this.rootPath
    const projectRoot = this.projectRoot ?? root
    let detectedType: string | null = null
    let packageManager: 'npm' | 'pnpm' | 'yarn' | null = null

    if (projectRoot) {
      detectedType = await this.detectProjectType(projectRoot)
      packageManager = await this.detectPackageManager(projectRoot)
    }

    const fileCount = this.countFiles(this.fileTree)
    return {
      rootPath: root,
      projectRoot,
      cwd: this.getCwd(),
      fileTree: this.fileTree,
      openFiles: [...this.openFiles],
      recentFiles: [...this.recentFiles],
      detectedType,
      packageManager,
      summary: root
        ? `${fileCount} files · ${detectedType ?? 'unknown'} · ${packageManager ?? 'no pkg manager'}`
        : 'No workspace open',
    }
  }

  async listFiles(): Promise<string[]> {
    if (!this.rootPath) return []
    if (this.fileTree.length === 0) {
      await this.loadFileTree()
    }
    const list: string[] = []
    const walk = (nodes: FileTreeNode[]) => {
      for (const node of nodes) {
        if (node.isFile) {
          list.push(node.path)
        }
        if (node.children) {
          walk(node.children)
        }
      }
    }
    walk(this.fileTree)
    return list
  }

  private countFiles(nodes: FileTreeNode[]): number {
    let count = 0
    for (const node of nodes) {
      if (node.isFile) count++
      if (node.children) count += this.countFiles(node.children)
    }
    return count
  }
}

export const workspaceEngine = new WorkspaceEngine()

// STEP 1 & 2: Automatic workspace detection
export const workspace = {
  getRoot: () => workspaceEngine.getRoot(),
  readWorkspace: async () => {
    const root = workspaceEngine.getRoot()
    if (root) {
      await workspaceEngine.loadFileTree(root)
    }
  },
  listFiles: async () => workspaceEngine.listFiles(),
  detectFramework: async (): Promise<string[]> => {
    const root = workspaceEngine.getRoot()
    if (!root) return []
    const files = await workspaceEngine.listFiles()
    return detectProjectTypeComprehensive(root, files)
  },
  detectPackageManager: async () => {
    const root = workspaceEngine.getRoot()
    if (!root) return null
    return workspaceEngine.detectPackageManager(root)
  },
  detectGit: async () => {
    const root = workspaceEngine.getRoot()
    if (!root) return { isRepo: false, branch: '', statusSummary: 'No workspace', recentCommits: [] }
    try {
      const git = simpleGit(root)
      const isRepo = await git.checkIsRepo()
      if (!isRepo) return { isRepo: false, branch: '', statusSummary: 'Not a git repo', recentCommits: [] }
      const status = await git.status()
      const branch = (await git.branch()).current
      const changes = status.modified.length + status.created.length + status.deleted.length
      const recentLog = await git.log({ maxCount: 3 })
      const recentCommits = recentLog.all.map(c => `${c.hash.slice(0, 7)}: ${c.message}`)
      return {
        isRepo: true,
        branch,
        statusSummary: changes > 0 ? `${changes} changed files` : 'Working tree clean',
        recentCommits,
      }
    } catch {
      return { isRepo: false, branch: '', statusSummary: 'Git not available', recentCommits: [] }
    }
  },
  detectLanguages: async () => {
    const files = await workspaceEngine.listFiles()
    const counts: Record<string, number> = {}
    const extToLang: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.py': 'Python',
      '.rs': 'Rust',
      '.go': 'Go',
      '.html': 'HTML',
      '.css': 'CSS',
      '.cpp': 'C++',
      '.c': 'C',
      '.sh': 'Shell',
      '.bat': 'Batch',
      '.ps1': 'PowerShell',
    }
    for (const f of files) {
      const ext = path.extname(f).toLowerCase()
      const lang = extToLang[ext]
      if (lang) {
        counts[lang] = (counts[lang] ?? 0) + 1
      }
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return sorted.map(([lang]) => lang).slice(0, 3).join(', ') || 'Unknown'
  },
  detectBuildSystem: async () => {
    const root = workspaceEngine.getRoot()
    if (!root) return null
    try {
      const files = await fsPromises.readdir(root)
      if (files.includes('vite.config.ts') || files.includes('vite.config.js')) return 'Vite'
      if (files.includes('next.config.js') || files.includes('next.config.mjs')) return 'NextJS Build'
      if (files.includes('webpack.config.js')) return 'Webpack'
      if (files.includes('Cargo.toml')) return 'Cargo'
      if (files.includes('package.json')) {
        const pkg = JSON.parse(await fsPromises.readFile(path.join(root, 'package.json'), 'utf-8'))
        const scripts = pkg.scripts || {}
        if (scripts.build) {
          if (scripts.build.includes('vite')) return 'Vite'
          if (scripts.build.includes('next')) return 'NextJS Build'
          if (scripts.build.includes('webpack')) return 'Webpack'
        }
      }
    } catch {}
    return 'npm scripts'
  }
}

// STEP 2: Detect project type comprehensively
export async function detectProjectTypeComprehensive(root: string, fileList: string[]): Promise<string[]> {
  const detected: string[] = []
  const fileNames = fileList.map(f => path.basename(f).toLowerCase())
  const relPaths = fileList.map(f => path.relative(root, f).replace(/\\/g, '/').toLowerCase())
  
  let deps: Record<string, string> = {}
  try {
    const pkg = JSON.parse(await fsPromises.readFile(path.join(root, 'package.json'), 'utf-8'))
    deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
  } catch {}

  if (deps.next) detected.push('Next.js')
  if (deps.react) detected.push('React')
  if (deps['react-native']) detected.push('React Native')
  if (deps.vue) detected.push('Vue')
  if (deps.nuxt) detected.push('Nuxt')
  if (deps['@angular/core']) detected.push('Angular')
  if (deps.svelte || deps['@sveltejs/kit']) detected.push('Svelte')
  if (deps.vite) detected.push('Vite')
  if (deps.astro) detected.push('Astro')
  if (deps.remix || deps['@remix-run/react']) detected.push('Remix')
  if (deps.express) detected.push('Express')
  if (deps['@nestjs/core']) detected.push('NestJS')
  if (deps.fastify) detected.push('Fastify')
  if (deps.electron || deps['electron-builder']) detected.push('Electron')
  if (deps.tailwindcss) detected.push('Tailwind')
  if (deps.bootstrap) detected.push('Bootstrap')
  if (deps.firebase || deps['firebase-admin']) detected.push('Firebase')
  if (deps['@supabase/supabase-js']) detected.push('Supabase')
  if (deps.mongodb || deps.mongoose) detected.push('MongoDB')
  if (deps.pg || deps.postgres) detected.push('Postgres')
  if (deps.sqlite3 || deps['better-sqlite3']) detected.push('SQLite')

  if (fileNames.includes('composer.json')) {
    detected.push('PHP')
    try {
      const comp = JSON.parse(await fsPromises.readFile(path.join(root, 'composer.json'), 'utf-8'))
      const compDeps = { ...(comp.require || {}), ...(comp['require-dev'] || {}) }
      if (compDeps['laravel/framework']) detected.push('Laravel')
    } catch {}
  }
  if (fileNames.includes('manage.py')) detected.push('Python', 'Django')
  if (relPaths.some(p => p.includes('wsgi.py') || p.includes('asgi.py')) && !detected.includes('Django')) detected.push('Django')
  if (fileNames.some(n => n === 'app.py' || n === 'wsgi.py' || n === 'application.py')) {
    detected.push('Python')
    try {
      const appContent = await fsPromises.readFile(path.join(root, fileNames.includes('app.py') ? 'app.py' : 'application.py'), 'utf-8')
      if (appContent.includes('Flask')) detected.push('Flask')
    } catch {}
  }
  if (fileNames.includes('cargo.toml')) detected.push('Rust')
  if (fileNames.includes('go.mod')) detected.push('Go')
  if (fileNames.includes('pom.xml') || fileNames.includes('build.gradle')) detected.push('Java')
  if (fileNames.some(n => n.endsWith('.csproj') || n.endsWith('.sln'))) detected.push('C#', 'ASP.NET')
  if (fileNames.some(n => n.endsWith('.cpp') || n.endsWith('.hpp') || n.endsWith('.h') || n.endsWith('.cc'))) detected.push('C++')
  if (fileNames.includes('wp-config.php')) detected.push('WordPress', 'PHP')
  if (fileNames.includes('pubspec.yaml')) detected.push('Flutter')
  if (fileNames.includes('projectsettings.asset') || relPaths.some(p => p.includes('projectsettings/'))) detected.push('Unity')
  if (fileNames.includes('project.godot')) detected.push('Godot')
  if (fileNames.includes('dockerfile') || fileNames.some(n => n.startsWith('docker-compose'))) detected.push('Docker')
  if (relPaths.some(p => p.includes('k8s/') || p.includes('kubernetes/') || p.endsWith('deployment.yaml') || p.endsWith('service.yaml'))) detected.push('Kubernetes')
  if (fileNames.some(n => n.includes('shopify') || n.endsWith('.liquid'))) detected.push('Shopify')

  if (detected.length === 0) {
    if (fileNames.some(n => n.endsWith('.ts') || n.endsWith('.tsx'))) detected.push('TypeScript')
    else if (fileNames.some(n => n.endsWith('.js') || n.endsWith('.jsx'))) detected.push('JavaScript')
    else if (fileNames.some(n => n.endsWith('.py'))) detected.push('Python')
    else if (fileNames.some(n => n.endsWith('.rs'))) detected.push('Rust')
    else if (fileNames.some(n => n.endsWith('.go'))) detected.push('Go')
    else if (fileNames.some(n => n.endsWith('.php'))) detected.push('PHP')
  }

  return [...new Set(detected)]
}

// STEP 3: Understand the architecture
export function analyzeArchitecture(root: string, fileList: string[]): Record<string, string[]> {
  const arch: Record<string, string[]> = {
    pages: [],
    components: [],
    hooks: [],
    services: [],
    controllers: [],
    routes: [],
    API: [],
    database: [],
    schemas: [],
    config: [],
    middleware: [],
    utilities: [],
    stateManagement: [],
    tests: [],
    assets: [],
    public: [],
    extensions: []
  }

  const categoryPatterns: Record<string, RegExp> = {
    pages: /\b(pages|views|screens)\b/i,
    components: /\b(components|widgets|ui)\b/i,
    hooks: /\b(hooks|use[A-Z][a-zA-Z0-9]+)\b/i,
    services: /\b(services|providers|clients)\b/i,
    controllers: /\b(controllers|handlers)\b/i,
    routes: /\b(routes|routing|router)\b/i,
    API: /\b(api|endpoints|requests)\b/i,
    database: /\b(db|database|models|repositories|query)\b/i,
    schemas: /\b(schemas|validation|dto|types\/[a-zA-Z0-9_-]+\.ts)\b/i,
    config: /\b(config|settings|options|vite\.config|tailwind\.config|next\.config|tsconfig)\b/i,
    middleware: /\b(middleware|interceptors|guards)\b/i,
    utilities: /\b(utils|helpers|utils\/[a-zA-Z0-9_-]+\.ts)\b/i,
    stateManagement: /\b(store|redux|context|zustand|recoil|slice|actions|reducers)\b/i,
    tests: /\b(tests?|__tests__|spec|\.test\.|\.spec\.)\b/i,
    assets: /\b(assets|images|icons|styles|fonts|css|scss)\b/i,
    public: /\b(public|static)\b/i,
    extensions: /\b(extensions|plugins|addons)\b/i
  }

  for (const file of fileList) {
    const rel = path.relative(root, file).replace(/\\/g, '/')
    for (const [category, pattern] of Object.entries(categoryPatterns)) {
      if (pattern.test(rel)) {
        arch[category].push(rel)
      }
    }
  }

  for (const cat of Object.keys(arch)) {
    arch[cat] = [...new Set(arch[cat])].slice(0, 10)
  }

  return arch
}

export interface WorkspaceContextOptions {
  model?: string
  activeFilePath?: string | null
  activeFileContent?: string | null
  selectedCode?: string | null
  cursorLine?: number | null
  cursorColumn?: number | null
  licenseTier?: string
  isSafeMode?: boolean
  extensions?: string[]
  terminalStatus?: string
  aiHealth?: { status: string; errorRate: number; latency: string }
  recentDiagnostics?: string
}

// STEP 1 & STEP 5: Build WorkspaceContext & Auto Workspace Reading
export async function getWorkspaceContextForAI(
  projectPath: string | null,
  options: WorkspaceContextOptions = {}
): Promise<string> {
  const root = workspaceEngine.getRoot() || projectPath
  if (!root) {
    return `=== WORKSPACE CONTEXT (WorkspaceContext) ===
Mode: Project Generator Mode (Workspace is empty)
OS: ${process.platform}
Node version: ${process.version}
Electron version: ${process.versions.electron || 'N/A'}
Safe Mode: ${options.isSafeMode ?? false}
License Tier: ${options.licenseTier ?? 'Free'}
Current Model: ${options.model ?? 'Unknown'}
AI Health: Status: ${options.aiHealth?.status ?? 'Optimal'}, Error Rate: ${options.aiHealth?.errorRate ?? 0}%, Latency: ${options.aiHealth?.latency ?? 'N/A'}
==========================================`
  }

  const fileList = await workspace.listFiles()
  const frameworks = await workspace.detectFramework()
  const packageManager = await workspace.detectPackageManager()
  const gitInfo = await workspace.detectGit()
  const languages = await workspace.detectLanguages()
  const buildSystem = await workspace.detectBuildSystem()

  let projectName = path.basename(root)
  let dependencies: Record<string, string> = {}
  let scripts: Record<string, string> = {}
  try {
    const raw = await fsPromises.readFile(path.join(root, 'package.json'), 'utf-8')
    const pkg = JSON.parse(raw)
    projectName = pkg.name || projectName
    dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
    scripts = pkg.scripts || {}
  } catch {}

  const snapshot = await workspaceEngine.getSnapshot()
  const formatTree = (nodes: FileTreeNode[], depth = 0, maxDepth = 3): string => {
    if (depth > maxDepth) return ''
    let result = ''
    const indent = '  '.repeat(depth)
    for (const node of nodes.slice(0, 100)) {
      if (node.isDirectory) {
        result += `${indent}📁 ${node.name}/\n`
        if (node.children) {
          result += formatTree(node.children, depth + 1, maxDepth)
        }
      } else {
        result += `${indent}📄 ${node.name}\n`
      }
    }
    return result
  }
  const folderTreeText = formatTree(snapshot.fileTree, 0, 3)

  const arch = analyzeArchitecture(root, fileList)
  const archSummary = Object.entries(arch)
    .filter(([, paths]) => paths.length > 0)
    .map(([cat, paths]) => `- ${cat}: ${paths.join(', ')}`)
    .join('\n')

  const contextBlock = `
=== WORKSPACE CONTEXT (WorkspaceContext) ===
Workspace Root: ${root}
Project Name: ${projectName}
Framework / Tech Stack: ${frameworks.join(', ') || 'Vanilla / None'}
Languages: ${languages}
Package Manager: ${packageManager || 'None'}
Build System: ${buildSystem || 'None'}
Safe Mode: ${options.isSafeMode ?? false}
Current Model: ${options.model ?? 'Unknown'}
License Tier: ${options.licenseTier ?? 'Free'}
OS: ${process.platform}
Node version: ${process.version}
Electron version: ${process.versions.electron || 'N/A'}

[Architecture Analysis]
${archSummary || 'No specific architectural components detected.'}

[Project Configurations]
- Dependencies: ${JSON.stringify(dependencies, null, 2)}
- Scripts: ${JSON.stringify(scripts, null, 2)}

[Git Integration]
- Active Branch: ${gitInfo.branch || 'N/A'}
- Status Summary: ${gitInfo.statusSummary || 'N/A'}
- Recent Commits:
${gitInfo.recentCommits?.map(c => `  * ${c}`).join('\n') || '  None'}

[Folder Tree Structure]
${folderTreeText || 'Empty or loading...'}

[Editor State]
- Open Files (Tabs): ${snapshot.openFiles.map(f => path.relative(root, f)).join(', ') || 'None'}
- Active File: ${options.activeFilePath ? path.relative(root, options.activeFilePath) : 'None'}
- Cursor Position: ${options.cursorLine !== undefined ? `Line ${options.cursorLine}, Column ${options.cursorColumn}` : 'Unknown'}
- Selected Code: ${options.selectedCode ? `\n\`\`\`\n${options.selectedCode}\n\`\`\`` : 'None'}

[Diagnostics & Terminal]
- Active Terminals: ${options.terminalStatus ?? 'No active sessions'}
- Recent Diagnostics: ${options.recentDiagnostics ?? 'No errors detected'}

[AI Health & Extensions]
- AI Health: Status: ${options.aiHealth?.status ?? 'Optimal'}, Error Rate: ${options.aiHealth?.errorRate ?? 0}%, Latency: ${options.aiHealth?.latency ?? 'N/A'}
- Installed Extensions: ${options.extensions?.join(', ') || 'None'}
==========================================
`
  return contextBlock
}
