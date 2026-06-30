import fsPromises from 'node:fs/promises'
import path from 'node:path'
import log from 'electron-log'
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

  private projectTypeCache = new LRUCache<string, { type: string | null; pm: 'npm' | 'pnpm' | 'yarn' | null }>(20)
  private treeCache = new LRUCache<string, TreeCacheEntry>(10, TREE_CACHE_TTL)

  setRoot(rootPath: string | null): void {
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

    const cached = this.treeCache.get(target)
    if (cached) {
      if (!dirPath && this.rootPath === target) {
        this.fileTree = cached.tree
      }
      return cached.tree
    }

    let buildCount = 0

    const buildTree = async (dir: string, depth: number): Promise<FileTreeNode[]> => {
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
        const batch = filtered.slice(i, i + CONCURRENCY)

        const batchResults = await Promise.all(
          batch.map(async (entry) => {
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
