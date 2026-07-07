import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import simpleGit from 'simple-git'
import { askAI } from './aiService'
import { isAllowedProgram, sanitizeCommand, isPathInsideWorkspace } from './safetyRules'

const __filename = process.argv[1] ?? fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface ExtensionManifest {
  id: string
  name: string
  version: string
  main: string
  description?: string
  publisher?: string
  activationEvents?: string[]
  permissions?: string[]
  contributes?: Record<string, any>
  commands?: Array<{ id: string; title: string; description?: string }>
}

export interface InstalledExtension {
  id: string
  name: string
  description?: string
  version: string
  main: string
  enabled: boolean
  path: string
  source: 'local' | 'marketplace'
  commands: Array<{ id: string; title: string; description?: string }>
  contributes: Record<string, any>
  manifest?: ExtensionManifest
  crashCount?: number
  quarantined?: boolean
  crashTimestamps?: string[]
}

interface MarketplaceRegistryEntry {
  id: string
  name: string
  description?: string
  version: string
  publisher?: string
  tags?: string[]
  iconUrl?: string
  downloadUrl?: string
  localPath?: string
  verified?: boolean
  installs?: number
  rating?: number
  lastUpdated?: string
  sha256?: string
}

interface ExtensionStateEntry {
  enabled: boolean
  lastUpdated?: string
  crashCount?: number
  quarantined?: boolean
  crashTimestamps?: string[]
}

interface HostRequest {
  requestId: string
  type: string
  payload?: any
}

interface HostResponse {
  requestId: string
  success: boolean
  result?: any
  error?: string
}

interface HostEvent {
  type: 'event'
  channel: string
  payload: any
}

interface ExtensionRuntime {
  manifest: ExtensionManifest
  path: string
  enabled: boolean
  module: any
  exports: any
  activated: boolean
}

const ALLOWED_BUILTINS = new Set(['path', 'url', 'crypto', 'assert', 'buffer', 'events'])
const EXTENSION_ACTIVATION_TIMEOUT_MS = 12_000

export class ExtensionHost {
  private extensionStorageRoot: string
  private registryPath: string
  private statePath: string
  private workspaceRoot: string | null = null
  private activeFilePath: string | null = null
  private builtInMarketplaceRoot: string | null = null
  private extensions = new Map<string, InstalledExtension>()
  private runtimes = new Map<string, ExtensionRuntime>()
  private moduleCache = new Map<string, any>()
  private commandRegistry = new Map<string, { extensionId: string; id: string; title?: string; description?: string; handler: (...args: any[]) => Promise<any> | any }>()
  private readonly crashThreshold = 3

  constructor(extensionStorageRoot: string, registryPath: string, statePath: string) {
    this.extensionStorageRoot = extensionStorageRoot
    this.registryPath = registryPath
    this.statePath = statePath
  }

  async initialize(options?: { builtInMarketplaceRoot?: string }) {
    this.builtInMarketplaceRoot = options?.builtInMarketplaceRoot ?? null
    await fsPromises.mkdir(this.extensionStorageRoot, { recursive: true })
    await this.ensureRegistry()
    await this.loadRegistry()
    await this.loadState()
    await this.activateOnStartup()
    this.sendEvent('extensionHost:ready', { installed: Array.from(this.extensions.values()) })
  }

  async setWorkspaceRoot(root: string | null) {
    this.workspaceRoot = root
    this.sendEvent('extensionHost:workspaceChanged', { root })
  }

  async setActiveFile(filePath: string | null) {
    this.activeFilePath = filePath
  }

  private async ensureRegistry() {
    if (!fs.existsSync(this.registryPath)) {
      const initial = await this.scanInstalledExtensions()
      await fsPromises.writeFile(this.registryPath, JSON.stringify(initial, null, 2), 'utf-8')
    }
  }

  private async loadRegistry() {
    try {
      const raw = await fsPromises.readFile(this.registryPath, 'utf-8')
      const entries = JSON.parse(raw) as InstalledExtension[]
      this.extensions.clear()
      for (const entry of entries) {
        if (!entry.id || !entry.path) continue
        const persisted = entry as InstalledExtension & { crashCount?: number; quarantined?: boolean }
        if (persisted.quarantined) {
          entry.enabled = false
        }
        this.extensions.set(entry.id, entry)
      }
    } catch (err) {
      this.extensions.clear()
    }
  }

  private getRecentCrashTimestamps(timestamps?: string[]) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    return (timestamps ?? [])
      .map((value) => {
        const date = new Date(value)
        return Number.isNaN(date.getTime()) ? null : date
      })
      .filter((date): date is Date => date !== null)
      .filter((date) => date.getTime() >= cutoff)
      .sort((a, b) => a.getTime() - b.getTime())
      .map((date) => date.toISOString())
  }

  private async loadState() {
    const state: Record<string, ExtensionStateEntry> = {}
    try {
      const raw = await fsPromises.readFile(this.statePath, 'utf-8')
      Object.assign(state, JSON.parse(raw))
    } catch {
      // ignore missing state file
    }
    for (const entry of this.extensions.values()) {
      const saved = state[entry.id]
      if (saved) {
        const recentTimestamps = this.getRecentCrashTimestamps(saved.crashTimestamps)
        entry.enabled = saved.enabled
        entry.crashTimestamps = recentTimestamps
        entry.crashCount = recentTimestamps.length
        entry.quarantined = saved.quarantined ?? false
        if (entry.quarantined) {
          entry.enabled = false
        }
      }
    }
    await this.saveRegistry()
  }

  private async saveRegistry() {
    const entries = Array.from(this.extensions.values())
    await fsPromises.writeFile(this.registryPath, JSON.stringify(entries, null, 2), 'utf-8')
    const state: Record<string, ExtensionStateEntry> = {}
    for (const entry of entries) {
      const recentTimestamps = this.getRecentCrashTimestamps(entry.crashTimestamps)
      state[entry.id] = {
        enabled: entry.enabled,
        lastUpdated: new Date().toISOString(),
        crashCount: recentTimestamps.length,
        quarantined: entry.quarantined ?? false,
        crashTimestamps: recentTimestamps,
      }
      entry.crashTimestamps = recentTimestamps
      entry.crashCount = recentTimestamps.length
    }
    await fsPromises.writeFile(this.statePath, JSON.stringify(state, null, 2), 'utf-8')
  }

  async scanInstalledExtensions() {
    const result: InstalledExtension[] = []
    const children = await fsPromises.readdir(this.extensionStorageRoot, { withFileTypes: true })
    for (const child of children) {
      if (!child.isDirectory()) continue
      const folder = path.join(this.extensionStorageRoot, child.name)
      const manifestPath = path.join(folder, 'extension.json')
      if (!fs.existsSync(manifestPath)) continue
      try {
        const raw = await fsPromises.readFile(manifestPath, 'utf-8')
        const manifest = JSON.parse(raw) as ExtensionManifest
        if (!manifest.id || !manifest.main) continue
        result.push({
          id: manifest.id,
          name: manifest.name,
          description: manifest.description,
          version: manifest.version,
          main: manifest.main,
          enabled: true,
          path: folder,
          source: 'local',
          commands: manifest.commands ?? [],
          contributes: manifest.contributes ?? {},
          manifest,
        })
      } catch {
        continue
      }
    }
    return result
  }

  private async activateOnStartup() {
    for (const entry of this.extensions.values()) {
      if (!entry.enabled) continue
      const activations = entry.manifest?.activationEvents ?? ['onStartup']
      if (activations.includes('onStartup') || activations.length === 0) {
        await this.activateExtension(entry.id, 'onStartup').catch(async (err) => {
          this.sendEvent('extensionHost:error', { extensionId: entry.id, error: String(err) })
          await this.markExtensionCrash(entry.id)
        })
      }
    }
  }

  private async activateExtension(extensionId: string, activationEvent: string) {
    const entry = this.extensions.get(extensionId)
    if (!entry || !entry.enabled) {
      throw new Error(`Extension ${extensionId} is not installed or enabled.`)
    }
    if (this.runtimes.has(extensionId)) {
      return
    }
    const runtime = await this.loadExtensionRuntime(entry)
    if (!runtime.module || typeof runtime.module.activate !== 'function') {
      return
    }
    try {
      await Promise.race([
        runtime.module.activate(this.createExtensionContext(entry)),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Extension activation timed out')), EXTENSION_ACTIVATION_TIMEOUT_MS)),
      ])
      runtime.activated = true
    } catch (err) {
      this.sendEvent('extensionHost:error', { extensionId: entry.id, error: String(err) })
      await this.markExtensionCrash(entry.id)
      throw err
    }
  }

  private async loadExtensionRuntime(entry: InstalledExtension) {
    if (this.runtimes.has(entry.id)) {
      return this.runtimes.get(entry.id) as ExtensionRuntime
    }

    const manifest = entry.manifest ?? await this.resolveManifest(entry.path)
    const mainPath = path.resolve(entry.path, manifest.main)
    if (!fs.existsSync(mainPath)) {
      throw new Error(`Extension main entry not found at ${mainPath}`)
    }

    const moduleExports = await this.loadModule(mainPath, entry.path)
    const runtime: ExtensionRuntime = {
      manifest,
      path: entry.path,
      enabled: entry.enabled,
      module: moduleExports,
      exports: moduleExports,
      activated: false,
    }
    this.runtimes.set(entry.id, runtime)
    return runtime
  }

  private async resolveManifest(folder: string) {
    const manifestPath = path.join(folder, 'extension.json')
    const raw = await fsPromises.readFile(manifestPath, 'utf-8')
    return JSON.parse(raw) as ExtensionManifest
  }

  private createSandboxRequire(extensionFolder: string, parentDir: string) {
    return (specifier: string) => {
      if (specifier.startsWith('.') || specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')) {
        const resolved = path.resolve(parentDir, specifier)
        if (!resolved.startsWith(extensionFolder)) {
          throw new Error('Extension require outside of extension folder is not allowed')
        }
        if (!fs.existsSync(resolved)) {
          const withJs = `${resolved}.js`
          if (fs.existsSync(withJs)) {
            return this.loadModule(withJs, extensionFolder)
          }
          throw new Error(`Cannot resolve module: ${specifier}`)
        }
        return this.loadModule(resolved, extensionFolder)
      }
      if (ALLOWED_BUILTINS.has(specifier)) {
        return require(specifier)
      }
      throw new Error(`Module '${specifier}' is not allowed in the extension sandbox`)
    }
  }

  private async loadModule(modulePath: string, extensionFolder: string) {
    const resolved = path.resolve(modulePath)
    if (this.moduleCache.has(resolved)) {
      return this.moduleCache.get(resolved)
    }

    const code = await fsPromises.readFile(resolved, 'utf-8')
    const dirname = path.dirname(resolved)
    const exports: any = {}
    const module: any = { exports, filename: resolved, id: resolved, path: dirname }
    const sandbox: any = {
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Buffer,
      process: {
        env: { ...process.env },
        platform: process.platform,
        versions: process.versions,
      },
      __filename: resolved,
      __dirname: dirname,
      exports,
      module,
      require: this.createSandboxRequire(extensionFolder, dirname),
      global: {},
    }
    sandbox.global = sandbox
    const script = new vm.Script(`(function(exports, require, module, __filename, __dirname) { ${code}\n})`, { filename: resolved })
    const wrapper = script.runInNewContext(sandbox, { timeout: 5000 })
    wrapper(exports, sandbox.require, module, resolved, dirname)
    const result = module.exports
    this.moduleCache.set(resolved, result)
    return result
  }

  private createExtensionContext(entry: InstalledExtension) {
    return {
      extension: {
        id: entry.id,
        manifest: entry.manifest ?? { id: entry.id, name: entry.name, version: entry.version, main: entry.main },
      },
      nexa: {
        commands: {
          registerCommand: (command: { id: string; title: string; description?: string }, handler: (...args: any[]) => any) => this.registerCommand(entry.id, command, handler),
          executeCommand: (commandId: string, ...args: any[]) => this.runCommand(commandId, ...args),
        },
        workspace: {
          getRootPath: () => this.workspaceRoot,
          getActiveFile: () => this.activeFilePath,
          readFile: async (target: string) => {
            const resolved = path.resolve(this.workspaceRoot || '', target)
            if (!this.workspaceRoot || !isPathInsideWorkspace(resolved, this.workspaceRoot)) {
              throw new Error('Access denied: path is outside the workspace')
            }
            return { content: await fsPromises.readFile(resolved, 'utf-8') }
          },
          writeFile: async (target: string, content: string) => {
            const resolved = path.resolve(this.workspaceRoot || '', target)
            if (!this.workspaceRoot || !isPathInsideWorkspace(resolved, this.workspaceRoot)) {
              throw new Error('Access denied: path is outside the workspace')
            }
            await fsPromises.writeFile(resolved, content, 'utf-8')
            return { success: true, target: resolved }
          },
          createFolder: async (target: string) => {
            const resolved = path.resolve(this.workspaceRoot || '', target)
            if (!this.workspaceRoot || !isPathInsideWorkspace(resolved, this.workspaceRoot)) {
              throw new Error('Access denied: path is outside the workspace')
            }
            await fsPromises.mkdir(resolved, { recursive: true })
            return { success: true, target: resolved }
          },
          delete: async (target: string) => {
            const resolved = path.resolve(this.workspaceRoot || '', target)
            if (!this.workspaceRoot || !isPathInsideWorkspace(resolved, this.workspaceRoot)) {
              throw new Error('Access denied: path is outside the workspace')
            }
            await fsPromises.rm(resolved, { recursive: true, force: true })
            return { success: true, target: resolved }
          },
          rename: async (oldPath: string, newPath: string) => {
            const resolvedOld = path.resolve(this.workspaceRoot || '', oldPath)
            const resolvedNew = path.resolve(this.workspaceRoot || '', newPath)
            if (!this.workspaceRoot || !isPathInsideWorkspace(resolvedOld, this.workspaceRoot) || !isPathInsideWorkspace(resolvedNew, this.workspaceRoot)) {
              throw new Error('Access denied: path is outside the workspace')
            }
            await fsPromises.rename(resolvedOld, resolvedNew)
            return { success: true, oldPath: resolvedOld, newPath: resolvedNew }
          },
        },
        window: {
          showNotification: (title: string, message: string, type: 'info' | 'warning' | 'error' = 'info') => {
            this.sendEvent('extensionHost:notification', { extensionId: entry.id, title, message, type })
          },
        },
        editor: {
          insertText: (text: string, options?: { relativeToCursor?: boolean }) => {
            this.sendEvent('extensionHost:insertText', { extensionId: entry.id, text, ...options })
          },
          getSelection: async () => ({ text: null, start: null, end: null }),
        },
        terminal: {
          run: async (command: string, cwd: string) => this.runTerminal(command, cwd),
        },
        git: {
          commit: async (message: string) => this.commitGit(message),
        },
        ai: {
          ask: async (prompt: string) => askAI(prompt, { projectPath: this.workspaceRoot ?? undefined }),
        },
      },
    }
  }

  private async registerCommand(extensionId: string, command: { id: string; title?: string; description?: string }, handler: (...args: any[]) => any) {
    if (this.commandRegistry.has(command.id)) {
      throw new Error(`Command ${command.id} is already registered.`)
    }
    this.commandRegistry.set(command.id, { extensionId, id: command.id, title: command.title, description: command.description, handler })
    this.sendEvent('extensionHost:commandRegistered', { extensionId, command })
  }

  async listInstalled() {
    return Array.from(this.extensions.values())
  }

  async listCommands() {
    return Array.from(this.commandRegistry.values()).map((command) => ({ extensionId: command.extensionId, id: command.id, title: command.title, description: command.description }))
  }

  async runCommand(commandId: string, ...args: any[]) {
    const entry = this.commandRegistry.get(commandId)
    if (!entry) {
      throw new Error(`Command ${commandId} is not registered.`)
    }
    try {
      return await entry.handler(...args)
    } catch (err) {
      throw new Error(`Extension command ${commandId} failed: ${(err as Error).message}`)
    }
  }

  private async markExtensionCrash(extensionId: string) {
    const entry = this.extensions.get(extensionId)
    if (!entry) return

    const recentTimestamps = this.getRecentCrashTimestamps(entry.crashTimestamps)
    recentTimestamps.push(new Date().toISOString())
    entry.crashTimestamps = recentTimestamps
    entry.crashCount = recentTimestamps.length

    if (entry.crashCount >= this.crashThreshold) {
      entry.enabled = false
      entry.quarantined = true
      await this.deactivateExtension(extensionId)
      await this.saveRegistry()
      this.sendEvent('extensionHost:notification', {
        extensionId,
        title: 'Extension disabled',
        message: 'Extension disabled due to repeated crashes',
        type: 'warning',
      })
      return
    }

    await this.saveRegistry()
  }

  async enableExtension(extensionId: string) {
    const entry = this.extensions.get(extensionId)
    if (!entry) throw new Error(`Extension ${extensionId} not found.`)
    if ((entry as InstalledExtension & { quarantined?: boolean }).quarantined) {
      throw new Error(`Extension ${extensionId} is quarantined and cannot be re-enabled.`)
    }
    entry.enabled = true
    await this.saveRegistry()
    await this.activateExtension(extensionId, 'onEnable')
    return entry
  }

  async disableExtension(extensionId: string) {
    const entry = this.extensions.get(extensionId)
    if (!entry) throw new Error(`Extension ${extensionId} not found.`)
    entry.enabled = false
    await this.saveRegistry()
    await this.deactivateExtension(extensionId)
    return entry
  }

  async uninstallExtension(extensionId: string) {
    const entry = this.extensions.get(extensionId)
    if (!entry) throw new Error(`Extension ${extensionId} not found.`)
    await this.deactivateExtension(extensionId)
    await fsPromises.rm(entry.path, { recursive: true, force: true })
    this.extensions.delete(extensionId)
    await this.saveRegistry()
    return { success: true }
  }

  async installLocalExtension(sourceFolder: string, source: 'local' | 'marketplace' = 'local') {
    const { manifest, folder } = await this.resolveExtensionDir(sourceFolder)
    const targetFolder = path.join(this.extensionStorageRoot, manifest.id)
    await this.deactivateExtension(manifest.id)
    await fsPromises.rm(targetFolder, { recursive: true, force: true })
    await fsPromises.cp(folder, targetFolder, { recursive: true })
    const entry: InstalledExtension = {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      main: manifest.main,
      enabled: true,
      path: targetFolder,
      source,
      commands: manifest.commands ?? [],
      contributes: manifest.contributes ?? {},
      manifest,
    }
    this.extensions.set(entry.id, entry)
    await this.saveRegistry()
    await this.activateExtension(entry.id, 'onInstall')
    return entry
  }

  private compareVersions(a: string, b: string) {
    const normalize = (value: string) => value.split(/[^0-9]+/).map((part) => Number(part) || 0)
    const aParts = normalize(a)
    const bParts = normalize(b)
    const length = Math.max(aParts.length, bParts.length)
    for (let i = 0; i < length; i += 1) {
      const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0)
      if (diff !== 0) return diff
    }
    return 0
  }

  private async loadMarketplaceRegistry(): Promise<MarketplaceRegistryEntry[]> {
    // Try remote API
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 4000)
      const response = await fetch('https://marketplace.nexa-ide.com/api/extensions', { signal: controller.signal })
      clearTimeout(timeoutId)
      if (response.ok) {
        const entries = await response.json()
        if (Array.isArray(entries)) {
          const cachePath = path.join(this.extensionStorageRoot, 'marketplace-cache.json')
          await fsPromises.writeFile(cachePath, JSON.stringify(entries, null, 2), 'utf-8')
          return entries
        }
      }
    } catch (err) {
      // Offline or error
    }

    const cachePath = path.join(this.extensionStorageRoot, 'marketplace-cache.json')
    const registryPath = this.builtInMarketplaceRoot
      ? path.join(this.builtInMarketplaceRoot, 'marketplace.json')
      : path.join(this.extensionStorageRoot, 'marketplace.json')

    for (const p of [cachePath, registryPath]) {
      try {
        const raw = await fsPromises.readFile(p, 'utf-8')
        const entries = JSON.parse(raw)
        if (Array.isArray(entries)) return entries
      } catch {}
    }
    return []
  }

  private matchesMarketplaceQuery(entry: MarketplaceRegistryEntry, query?: string) {
    if (!query || !query.trim()) return true
    const normalized = query.toLowerCase().trim()
    const tags = (entry.tags ?? []).join(' ').toLowerCase()
    return (
      entry.id.toLowerCase().includes(normalized) ||
      entry.name.toLowerCase().includes(normalized) ||
      (entry.description?.toLowerCase().includes(normalized) ?? false) ||
      (entry.publisher?.toLowerCase().includes(normalized) ?? false) ||
      tags.includes(normalized)
    )
  }

  private async getMarketplaceEntry(extensionId: string) {
    const registry = await this.loadMarketplaceRegistry()
    return registry.find((entry) => entry.id === extensionId) ?? null
  }

  private async resolveMarketplaceInstallSource(entry: MarketplaceRegistryEntry) {
    if (entry.localPath) {
      const localRoot = this.builtInMarketplaceRoot ?? this.extensionStorageRoot
      return path.resolve(localRoot, entry.localPath)
    }
    if (!entry.downloadUrl) {
      throw new Error(`Marketplace entry ${entry.id} has no download source configured`)
    }
    if (entry.downloadUrl.startsWith('file://')) {
      return fileURLToPath(entry.downloadUrl)
    }
    if (/^https?:\/\//.test(entry.downloadUrl)) {
      return entry.downloadUrl
    }
    const localRoot = this.builtInMarketplaceRoot ?? this.extensionStorageRoot
    return path.resolve(localRoot, entry.downloadUrl)
  }

  async listMarketplaceExtensions(query?: string) {
    try {
      const registry = await this.loadMarketplaceRegistry()
      const filtered = registry.filter((entry) => this.matchesMarketplaceQuery(entry, query))
      if (filtered.length > 0) {
        return filtered.map((entry) => ({
          id: entry.id,
          name: entry.name,
          description: entry.description,
          version: entry.version,
          publisher: entry.publisher,
          downloadCount: entry.installs,
          averageRating: entry.rating,
          iconUrl: entry.iconUrl,
          tags: entry.tags,
        }))
      }

      if (!query || !query.trim()) {
        return []
      }

      const url = `https://open-vsx.org/api/-/search?query=${encodeURIComponent(query)}&sortBy=downloadCount&size=30`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Open VSX search failed with status ${response.status}`)
      }
      const data = await response.json()
      return (data.extensions || []).map((ext: any) => ({
        id: `${ext.namespace}.${ext.name}`,
        name: ext.displayName || ext.name,
        description: ext.description,
        version: ext.version,
        publisher: ext.namespace,
        downloadCount: ext.downloadCount,
        averageRating: ext.averageRating,
        iconUrl: ext.files?.icon,
        tags: ext.tags || [],
      }))
    } catch (err) {
      this.sendEvent('extensionHost:error', { error: String(err), context: 'listMarketplaceExtensions' })
      return []
    }
  }

  async installMarketplaceExtension(extensionId: string) {
    const entry = await this.getMarketplaceEntry(extensionId)
    if (entry) {
      const source = await this.resolveMarketplaceInstallSource(entry)

      if (typeof source === 'string' && source.startsWith('http')) {
        if (entry.verified === false) {
          throw new Error('This marketplace package is not verified and cannot be installed.')
        }

        const tempDir = path.join(this.extensionStorageRoot, '.tmp', crypto.randomBytes(8).toString('hex'))
        await fsPromises.mkdir(tempDir, { recursive: true })
        const vsixPath = path.join(tempDir, 'extension.vsix')

        const response = await fetch(source)
        if (!response.ok) {
          await fsPromises.rm(tempDir, { recursive: true, force: true })
          throw new Error(`Failed to download package: ${response.statusText}`)
        }
        const buffer = Buffer.from(await response.arrayBuffer())

        if (entry.sha256) {
          const hash = crypto.createHash('sha256').update(buffer).digest('hex')
          if (hash !== entry.sha256) {
            await fsPromises.rm(tempDir, { recursive: true, force: true })
            throw new Error('Downloaded package checksum does not match the marketplace registry entry.')
          }
        }

        await fsPromises.writeFile(vsixPath, buffer)
        try {
          await this.extractPackage(vsixPath, tempDir)
          const extractedFolder = path.join(tempDir, 'extension')
          const installed = await this.installLocalExtension(extractedFolder, 'marketplace')
          await fsPromises.rm(tempDir, { recursive: true, force: true })
          return installed
        } catch (err) {
          await fsPromises.rm(tempDir, { recursive: true, force: true })
          throw err
        }
      }

      if (fs.existsSync(source)) {
        const stats = await fsPromises.stat(source)
        if (stats.isDirectory()) {
          return this.installLocalExtension(source, 'marketplace')
        }
        return this.installPackageFile(source, 'marketplace')
      }

      throw new Error(`Marketplace source not found for extension ${extensionId}`)
    }

    const parts = extensionId.split('.')
    if (parts.length < 2) {
      throw new Error(`Invalid extension ID format: ${extensionId}`)
    }
    const [namespace, name] = parts
    const apiUrl = `https://open-vsx.org/api/${namespace}/${name}`
    const metadataResponse = await fetch(apiUrl)
    if (!metadataResponse.ok) {
      throw new Error(`Failed to fetch extension metadata from Open VSX: ${metadataResponse.statusText}`)
    }
    const metadata = await metadataResponse.json()
    const downloadUrl = metadata.files?.download
    if (!downloadUrl) {
      throw new Error(`No download URL found for extension ${extensionId}`)
    }

    const tempDir = path.join(this.extensionStorageRoot, '.tmp', crypto.randomBytes(8).toString('hex'))
    await fsPromises.mkdir(tempDir, { recursive: true })
    const vsixPath = path.join(tempDir, 'extension.vsix')

    const vsixResponse = await fetch(downloadUrl)
    if (!vsixResponse.ok) {
      await fsPromises.rm(tempDir, { recursive: true, force: true })
      throw new Error(`Failed to download VSIX: ${vsixResponse.statusText}`)
    }
    const buffer = Buffer.from(await vsixResponse.arrayBuffer())
    await fsPromises.writeFile(vsixPath, buffer)

    try {
      await this.extractPackage(vsixPath, tempDir)
      const extractedFolder = path.join(tempDir, 'extension')
      const installed = await this.installLocalExtension(extractedFolder, 'marketplace')
      await fsPromises.rm(tempDir, { recursive: true, force: true })
      return installed
    } catch (err) {
      await fsPromises.rm(tempDir, { recursive: true, force: true })
      throw err
    }
  }

  async installPackageFile(filePath: string, source: 'marketplace' | 'local' = 'marketplace') {
    const tempDir = path.join(this.extensionStorageRoot, '.tmp', crypto.randomBytes(8).toString('hex'))
    await fsPromises.mkdir(tempDir, { recursive: true })
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Extension package not found: ${filePath}`)
      }
      await this.extractPackage(filePath, tempDir)
      const extractedFolder = path.join(tempDir, 'extension')
      const installed = await this.installLocalExtension(extractedFolder, source)
      await fsPromises.rm(tempDir, { recursive: true, force: true })
      return installed
    } catch (err) {
      await fsPromises.rm(tempDir, { recursive: true, force: true })
      throw err
    }
  }

  private async extractPackage(packagePath: string, destination: string) {
    if (packagePath.endsWith('.nexa-vsix') || packagePath.endsWith('.vsix') || packagePath.endsWith('.zip')) {
      await this.extractZip(packagePath, destination)
      return
    }
    throw new Error('Unsupported extension package format. Expected .nexa-vsix, .vsix, or .zip')
  }

  private async extractZip(packagePath: string, destination: string) {
    const unzip = await import('extract-zip') as any
    await unzip.default(packagePath, { dir: destination })
  }

  private async resolveExtensionDir(folder: string) {
    const manifestPath = path.join(folder, 'extension.json')
    const raw = await fsPromises.readFile(manifestPath, 'utf-8')
    const manifest = JSON.parse(raw) as ExtensionManifest
    if (!manifest.id || !manifest.main) {
      throw new Error('Extension manifest must define id and main')
    }
    const extPath = path.join(folder, manifest.main)
    if (!fs.existsSync(extPath)) {
      throw new Error(`Extension main file not found: ${manifest.main}`)
    }
    return { manifest, folder }
  }

  async checkForUpdates() {
    const registry = await this.loadMarketplaceRegistry()
    return Array.from(this.extensions.values()).map((installed) => {
      const marketplace = registry.find((entry) => entry.id === installed.id)
      const latestVersion = marketplace?.version ?? installed.version
      const updateAvailable = marketplace ? this.compareVersions(marketplace.version, installed.version) > 0 : false
      return {
        id: installed.id,
        name: installed.name,
        installedVersion: installed.version,
        latestVersion,
        updateAvailable,
        source: installed.source,
        marketplace: marketplace
          ? {
              publisher: marketplace.publisher,
              verified: marketplace.verified,
              rating: marketplace.rating,
              downloadUrl: marketplace.downloadUrl,
            }
          : undefined,
      }
    })
  }

  async updateExtension(extensionId: string) {
    const updates = await this.checkForUpdates()
    const extension = updates.find((item) => item.id === extensionId)
    if (!extension) {
      throw new Error(`Extension not installed: ${extensionId}`)
    }
    if (!extension.updateAvailable) {
      throw new Error(`No update available for extension ${extensionId}`)
    }
    return this.installMarketplaceExtension(extensionId)
  }

  async updateAllExtensions() {
    const updates = await this.checkForUpdates()
    const available = updates.filter((item) => item.updateAvailable)
    const results: Array<{ id: string; success: boolean; error?: string }> = []
    for (const item of available) {
      try {
        await this.installMarketplaceExtension(item.id)
        results.push({ id: item.id, success: true })
      } catch (err) {
        results.push({ id: item.id, success: false, error: String(err) })
      }
    }
    return {
      updated: results,
      summary: `${results.filter((item) => item.success).length} of ${results.length} extensions updated`,
    }
  }

  async clearExtensionQuarantine(extensionId: string) {
    const entry = this.extensions.get(extensionId)
    if (!entry) {
      throw new Error(`Extension ${extensionId} not found.`)
    }
    entry.quarantined = false
    await this.saveRegistry()
    return entry
  }

  async runTerminal(command: string, cwd: string) {
    const trimmed = command.trim()
    if (!trimmed) {
      return { success: false, message: 'Empty command' }
    }
    if (!isAllowedProgram(trimmed)) {
      return { success: false, message: 'Command not allowed by extension security policy' }
    }
    const safe = sanitizeCommand(trimmed)
    if (!safe.safe) {
      return { success: false, message: safe.reason ?? 'Command blocked by safety policy' }
    }
    const unquoted = trimmed.replace(/"[^\"]*"/g, '').replace(/\'[^\']*\'/g, '')
    if (/[;&|`]|&&|\|\||\$\(/.test(unquoted)) {
      return { success: false, message: 'Command contains shell operators' }
    }
    return new Promise((resolve) => {
      const args = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
      const cmd = args.shift()
      if (!cmd) {
        resolve({ success: false, message: 'Command parsing failed' })
        return
      }
      const cleanedArgs = args.map((a) => a.replace(/^['"]|['"]$/g, ''))
      const proc = spawn(cmd, cleanedArgs, { cwd: cwd ?? undefined, shell: false, env: { ...process.env } })
      let output = ''
      proc.stdout?.on('data', (chunk: Buffer | string) => { output += chunk.toString() })
      proc.stderr?.on('data', (chunk: Buffer | string) => { output += chunk.toString() })
      proc.on('close', (code) => resolve({ success: code === 0, message: output || `Process exited with ${code}` }))
      proc.on('error', (error) => resolve({ success: false, message: error.message }))
    })
  }

  private async commitGit(message: string) {
    if (!this.workspaceRoot) {
      return { success: false, message: 'No workspace open' }
    }
    try {
      const git = simpleGit({ baseDir: this.workspaceRoot })
      await git.add('.')
      await git.commit(message)
      return { success: true }
    } catch (err) {
      return { success: false, message: (err as Error).message }
    }
  }

  private deactivateExtension(extensionId: string) {
    const runtime = this.runtimes.get(extensionId)
    if (!runtime) return Promise.resolve()
    if (runtime.module && typeof runtime.module.deactivate === 'function') {
      try {
        return Promise.race([
          runtime.module.deactivate(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Extension deactivate timed out')), EXTENSION_ACTIVATION_TIMEOUT_MS)),
        ])
      } catch (err) {
        this.sendEvent('extensionHost:error', { extensionId, error: String(err) })
      }
    }
    this.moduleCache.delete(path.join(runtime.path, runtime.manifest.main))
    this.runtimes.delete(extensionId)
    for (const key of Array.from(this.commandRegistry.keys())) {
      if (this.commandRegistry.get(key)?.extensionId === extensionId) {
        this.commandRegistry.delete(key)
      }
    }
    return Promise.resolve()
  }

  public sendResponse(requestId: string, result: any) {
    const message: HostResponse = { requestId, success: true, result }
    process.send?.(message)
  }

  public sendError(requestId: string, error: any) {
    const message: HostResponse = { requestId, success: false, error: String(error) }
    process.send?.(message)
  }

  public sendEvent(channel: string, payload: any) {
    const message: HostEvent = { type: 'event', channel, payload }
    process.send?.(message)
  }

  async handleRequest(message: HostRequest) {
    const { requestId, type, payload } = message
    try {
      switch (type) {
        case 'listInstalled':
          return this.sendResponse(requestId, await this.listInstalled())
        case 'listCommands':
          return this.sendResponse(requestId, await this.listCommands())
        case 'runCommand':
          return this.sendResponse(requestId, await this.runCommand(payload.commandId, ...(payload.args ?? [])))
        case 'enable':
          return this.sendResponse(requestId, await this.enableExtension(payload.extensionId))
        case 'disable':
          return this.sendResponse(requestId, await this.disableExtension(payload.extensionId))
        case 'uninstall':
          return this.sendResponse(requestId, await this.uninstallExtension(payload.extensionId))
        case 'installLocal':
          return this.sendResponse(requestId, await this.installLocalExtension(payload.sourceFolder, payload.source ?? 'local'))
        case 'installPackage':
          return this.sendResponse(requestId, await this.installPackageFile(payload.packagePath, payload.source ?? 'marketplace'))
        case 'listMarketplace':
          return this.sendResponse(requestId, await this.listMarketplaceExtensions(payload?.query))
        case 'installMarketplace':
          return this.sendResponse(requestId, await this.installMarketplaceExtension(payload.extensionId))
        case 'checkForUpdates':
          return this.sendResponse(requestId, await this.checkForUpdates())
        case 'updateExtension':
          return this.sendResponse(requestId, await this.updateExtension(payload.extensionId))
        case 'updateAllExtensions':
          return this.sendResponse(requestId, await this.updateAllExtensions())
        case 'clearQuarantine':
          return this.sendResponse(requestId, await this.clearExtensionQuarantine(payload.extensionId))
        case 'setWorkspaceRoot':
          await this.setWorkspaceRoot(payload.root)
          return this.sendResponse(requestId, { success: true })
        case 'setActiveFile':
          await this.setActiveFile(payload.filePath)
          return this.sendResponse(requestId, { success: true })
        case 'reloadExtensions':
          await this.reloadExtensions()
          return this.sendResponse(requestId, { success: true })
        case 'restartHost':
          await this.restartHost()
          return this.sendResponse(requestId, { success: true })
        default:
          throw new Error(`Unknown host request type: ${type}`)
      }
    } catch (err) {
      this.sendError(requestId, err)
    }
  }

  private async reloadExtensions() {
    for (const extensionId of Array.from(this.runtimes.keys())) {
      await this.deactivateExtension(extensionId)
    }
    await this.loadRegistry()
    await this.loadState()
    await this.activateOnStartup()
  }

  private async restartHost() {
    await this.reloadExtensions()
    this.sendEvent('extensionHost:restarted', { timestamp: new Date().toISOString() })
  }
}

const extensionStorageRoot = process.env.EXTENSION_STORAGE_ROOT || path.join(__dirname, '../extensions')
const registryPath = process.env.EXTENSION_REGISTRY_PATH || path.join(extensionStorageRoot, 'registry.json')
const statePath = process.env.EXTENSION_STATE_PATH || path.join(extensionStorageRoot, 'extensions-state.json')

const host = new ExtensionHost(extensionStorageRoot, registryPath, statePath)

process.on('message', async (message: HostRequest) => {
  if (message?.type === 'init') {
    try {
      await host.initialize(message.payload)
      host.sendResponse(message.requestId, { success: true })
      host.sendEvent('extensionHost:initialized', { success: true })
    } catch (err) {
      host.sendError(message.requestId, err)
      host.sendEvent('extensionHost:error', { error: String(err) })
    }
    return
  }
  await host.handleRequest(message).catch((err) => {
    if (message?.requestId) {
      host.sendError(message.requestId, err)
    }
  })
})

process.on('uncaughtException', (error) => {
  process.send?.({ type: 'event', channel: 'extensionHost:crash', payload: { error: String(error), stack: error.stack } })
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  process.send?.({ type: 'event', channel: 'extensionHost:crash', payload: { error: String(reason) } })
})
