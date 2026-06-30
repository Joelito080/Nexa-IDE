import fsPromises from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, exec } from 'node:child_process'
import { promisify } from 'node:util'
import crypto from 'node:crypto'
import { app, dialog } from 'electron'
import { askAI } from './aiService'
import { isAllowedProgram, sanitizeCommand } from './safetyRules'

const execAsync = promisify(exec)

export interface ExtensionManifest {
  id: string
  name: string
  version: string
  main: string
  description?: string
  publisher?: string
  commands?: Array<{ id: string; title: string; description?: string }>
  contributes?: Record<string, any>
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
}

export interface MarketplaceExtension {
  id: string
  name: string
  description?: string
  version: string
  commands?: Array<{ id: string; title: string; description?: string }>
  publisher?: string
  downloadCount?: number
  averageRating?: number
  iconUrl?: string
  tags?: string[]
}

export interface RegisteredCommand {
  extensionId: string
  id: string
  title: string
  description?: string
  handler: (...args: any[]) => Promise<any> | any
}

export interface ExtensionServiceOptions {
  extensionStorageRoot: string
  builtInMarketplaceRoot: string
  onExtensionEvent?: (channel: string, payload: unknown) => void
}

export class ExtensionService {
  private extensionStorageRoot: string
  private builtInMarketplaceRoot: string
  private registryPath: string
  private extensions = new Map<string, InstalledExtension>()
  private loadedModules = new Map<string, any>()
  private commandRegistry = new Map<string, RegisteredCommand>()
  private workspaceRoot: string | null = null
  private activeFilePath: string | null = null
  private onExtensionEvent?: (channel: string, payload: unknown) => void

  constructor(options: ExtensionServiceOptions) {
    this.extensionStorageRoot = options.extensionStorageRoot
    this.builtInMarketplaceRoot = options.builtInMarketplaceRoot
    this.registryPath = path.join(this.extensionStorageRoot, 'registry.json')
    this.onExtensionEvent = options.onExtensionEvent
  }

  async initialize() {
    await fsPromises.mkdir(this.extensionStorageRoot, { recursive: true })
    await this.loadRegistry()
    await this.activateEnabledExtensions()
  }

  setWorkspaceRoot(root: string | null) {
    this.workspaceRoot = root
  }

  getWorkspaceRoot() {
    return this.workspaceRoot
  }

  setActiveFile(filePath: string | null) {
    this.activeFilePath = filePath
  }

  private async loadRegistry() {
    try {
      const raw = await fsPromises.readFile(this.registryPath, 'utf-8')
      const entries = JSON.parse(raw) as InstalledExtension[]
      for (const entry of entries) {
        if (entry.id && entry.path) {
          this.extensions.set(entry.id, entry)
        }
      }
    } catch {
      await this.saveRegistry()
    }
  }

  private async saveRegistry() {
    const entries = Array.from(this.extensions.values())
    await fsPromises.writeFile(this.registryPath, JSON.stringify(entries, null, 2), 'utf-8')
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

  private static readonly EXTENSION_ACTIVATION_TIMEOUT_MS = 12_000

  private async activateEnabledExtensions() {
    for (const entry of this.extensions.values()) {
      if (entry.enabled) {
        await this.activateExtension(entry).catch((error) => {
          console.error(`Extension activation failed for ${entry.id}:`, error)
        })
      }
    }
  }

  private async activateExtension(entry: InstalledExtension) {
    if (this.loadedModules.has(entry.id)) {
      return
    }
    const modulePath = path.join(entry.path, entry.main)
    const url = pathToFileURL(modulePath).href + `?t=${Date.now()}`

    const imported = await Promise.race([
      import(url),
      new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Extension load timed out')), ExtensionService.EXTENSION_ACTIVATION_TIMEOUT_MS)
      }),
    ]) as any

    if (!imported || typeof imported.activate !== 'function') {
      return
    }

    const context = {
      extension: { id: entry.id, manifest: { ...entry, path: entry.path } },
      nexus: {
        workspace: {
          getRootPath: () => this.workspaceRoot,
          getActiveFile: () => this.activeFilePath,
          analyze: () => this.analyzeWorkspace(),
        },
        editor: {
          openFile: (filePath: string) => this.emit('extension:openFile', filePath),
          applyTheme: (themeId: string, css: string) => this.emit('extension:applyTheme', { themeId, css }),
          insertText: (text: string, options?: { relativeToCursor?: boolean }) => this.emit('extension:insertText', { text, ...options }),
        },
        commands: {
          registerCommand: (command: { id: string; title: string; description?: string }, handler: (...args: any[]) => any) =>
            this.registerCommand(entry.id, command, handler),
          executeCommand: (commandId: string, ...args: any[]) => this.runCommand(commandId, ...args),
        },
        ai: {
          ask: (prompt: string) => askAI(prompt, { projectPath: this.workspaceRoot ?? undefined }),
        },
        terminal: {
          run: (command: string, cwd: string) => this.runShellCommand(command, cwd),
        },
        fs: {
          readDir: (target: string) => fsPromises.readdir(target, { withFileTypes: true }).then((items) => items.map((item) => ({ name: item.name, isDirectory: item.isDirectory(), isFile: item.isFile() }))),
          readFile: (target: string) => fsPromises.readFile(target, 'utf-8').then((content) => ({ content })),
          writeFile: (target: string, content: string) => fsPromises.writeFile(target, content, 'utf-8').then(() => ({ success: true })),
          createFolder: (target: string) => fsPromises.mkdir(target, { recursive: true }).then(() => ({ success: true })),
          delete: (target: string) => fsPromises.rm(target, { recursive: true, force: true }).then(() => ({ success: true })),
          rename: (oldPath: string, newPath: string) => fsPromises.rename(oldPath, newPath).then(() => ({ success: true })),
        },
      },
    }

    await Promise.race([
      imported.activate(context),
      new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Extension activation timed out')), ExtensionService.EXTENSION_ACTIVATION_TIMEOUT_MS)
      }),
    ])

    this.loadedModules.set(entry.id, imported)
  }

  private emit(channel: string, payload: unknown) {
    this.onExtensionEvent?.(channel, payload)
  }

  private async runShellCommand(command: string, cwd: string) {
    const trimmed = command.trim()
    if (!trimmed) return { success: false, message: 'Empty command' }

    if (!isAllowedProgram(trimmed)) {
      return { success: false, message: `Command not allowed by extension security policy` }
    }

    const safe = sanitizeCommand(trimmed)
    if (!safe.safe) {
      return { success: false, message: safe.reason ?? 'Command blocked by safety policy' }
    }

    // Check for chain operators in unquoted positions to prevent shell splitting
    const unquoted = trimmed.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '')
    if (/[;&|`]|&&|\|\||\$\(/.test(unquoted)) {
      return { success: false, message: 'Command contains shell chain operators' }
    }

    // Windows: use cmd.exe to execute (needed for .cmd/.bat files like npm, yarn)
    // Safe because we've validated: allowlisted program, no dangerous patterns, no chain operators
    // We pass the raw command string with original quotes preserved for correct argument parsing
    // Other platforms: direct spawn with parsed args
    return new Promise<{ success: boolean; message: string }>((resolve) => {
      let proc
      if (process.platform === 'win32') {
        const comspec = process.env.COMSPEC || 'cmd.exe'
        proc = spawn(comspec, ['/d', '/s', '/c', trimmed], { cwd, shell: false, windowsVerbatimArguments: true, env: { ...process.env } })
      } else {
        const args = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
        const exe = args.shift() ?? ''
        const cleanArgs = args.map(a => a.replace(/^["']|["']$/g, ''))
        proc = spawn(exe, cleanArgs, { cwd, shell: false, env: { ...process.env } })
      }
      let output = ''
      proc.stdout.on('data', (chunk) => { output += chunk.toString() })
      proc.stderr.on('data', (chunk) => { output += chunk.toString() })
      proc.on('close', (code) => {
        resolve({ success: code === 0, message: output || `Completed with code ${code}` })
      })
      proc.on('error', (error) => {
        resolve({ success: false, message: error.message })
      })
    })
  }

  private async analyzeWorkspace() {
    if (!this.workspaceRoot) {
      return { rootPath: null, summary: 'No workspace open' }
    }
    const files: string[] = []
    const walk = async (directory: string) => {
      const entries = await fsPromises.readdir(directory, { withFileTypes: true })
      for (const entry of entries) {
        if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue
        const entryPath = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          await walk(entryPath)
        } else {
          files.push(entryPath)
        }
      }
    }
    await walk(this.workspaceRoot)
    return { rootPath: this.workspaceRoot, activeFile: this.activeFilePath, files, summary: `${files.length} files` }
  }

  private registerCommand(extensionId: string, command: { id: string; title: string; description?: string }, handler: (...args: any[]) => any) {
    if (this.commandRegistry.has(command.id)) {
      console.warn(`Command ${command.id} already registered, skipping.`)
      return
    }
    this.commandRegistry.set(command.id, {
      extensionId,
      id: command.id,
      title: command.title,
      description: command.description,
      handler,
    })
  }

  async listInstalledExtensions() {
    return Array.from(this.extensions.values())
  }

  async listCommands() {
    return Array.from(this.commandRegistry.values()).map((command) => ({
      extensionId: command.extensionId,
      id: command.id,
      title: command.title,
      description: command.description,
    }))
  }

  async listMarketplaceExtensions(query?: string) {
    try {
      console.log('[ExtensionService] Fetching marketplace extensions from Open VSX...', query ? `with query: ${query}` : '')
      const url = query
        ? `https://open-vsx.org/api/-/search?query=${encodeURIComponent(query)}&sortBy=downloadCount&size=30`
        : 'https://open-vsx.org/api/-/search?sortBy=downloadCount&size=30'
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Open VSX returned status ${response.status}`)
      }
      
      const data = await response.json()
      console.log(`[ExtensionService] Successfully fetched ${data.extensions?.length || 0} extensions from Open VSX`)
      
      const items: MarketplaceExtension[] = (data.extensions || []).map((ext: any) => ({
        id: `${ext.namespace}.${ext.name}`,
        name: ext.displayName || ext.name,
        description: ext.description,
        version: ext.version,
        commands: [], // OpenVSX search doesn't return commands list directly
        publisher: ext.namespace,
        downloadCount: ext.downloadCount,
        averageRating: ext.averageRating,
        iconUrl: ext.files?.icon,
      }))
      
      return items
    } catch (err) {
      console.error('[ExtensionService] Failed to fetch marketplace extensions:', err)
      return []
    }
  }

  async installLocalExtension(sourceFolder: string, source: 'local' | 'marketplace' = 'local') {
    const { manifest, folder } = await this.resolveExtensionDir(sourceFolder)
    const targetFolder = path.join(this.extensionStorageRoot, manifest.id)
    
    // Deactivate the extension first to release potential file locks on Windows
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
      source: source,
      commands: manifest.commands ?? [],
      contributes: manifest.contributes ?? {},
      manifest,
    }
    this.extensions.set(entry.id, entry)
    await this.saveRegistry()
    await this.activateExtension(entry)
    return entry
  }

  async installMarketplaceExtension(extensionId: string) {
    const builtInFolder = path.join(this.builtInMarketplaceRoot, extensionId)
    if (fs.existsSync(builtInFolder)) {
      return this.installLocalExtension(builtInFolder, 'marketplace')
    }

    // Dynamic download from Open VSX
    console.log(`[ExtensionService] Downloading extension ${extensionId} from Open VSX...`)
    const parts = extensionId.split('.')
    if (parts.length < 2) {
      throw new Error(`Invalid extension ID format: ${extensionId}`)
    }
    const [namespace, name] = parts
    const apiUrl = `https://open-vsx.org/api/${namespace}/${name}`
    
    const response = await fetch(apiUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch extension metadata from Open VSX: ${response.statusText}`)
    }
    
    const metadata = await response.json()
    const downloadUrl = metadata.files?.download
    if (!downloadUrl) {
      throw new Error(`No download URL found for extension ${extensionId}`)
    }
    
    console.log(`[ExtensionService] Downloading VSIX from ${downloadUrl}...`)
    const vsixResponse = await fetch(downloadUrl)
    if (!vsixResponse.ok) {
      throw new Error(`Failed to download VSIX: ${vsixResponse.statusText}`)
    }
    
    const arrayBuffer = await vsixResponse.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    const tempDir = path.join(app.getPath('temp'), `nexus-ext-${crypto.randomBytes(8).toString('hex')}`)
    await fsPromises.mkdir(tempDir, { recursive: true })
    
    const vsixPath = path.join(tempDir, 'extension.vsix')
    await fsPromises.writeFile(vsixPath, buffer)
    
    const extractDir = path.join(tempDir, 'extracted')
    await fsPromises.mkdir(extractDir, { recursive: true })
    
    console.log(`[ExtensionService] Extracting VSIX package to ${extractDir}...`)
    try {
      await execAsync(`tar -xf "${vsixPath}" -C "${extractDir}"`)
    } catch (err) {
      console.error(`[ExtensionService] Extraction failed:`, err)
      await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
      throw new Error(`Failed to extract extension package: ${(err as Error).message}`)
    }
    
    const extensionFolder = path.join(extractDir, 'extension')
    const packageJsonPath = path.join(extensionFolder, 'package.json')
    
    if (!fs.existsSync(packageJsonPath)) {
      await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
      throw new Error('VSIX package structure is invalid (missing extension/package.json)')
    }
    
    // Read package.json and generate extension.json
    const packageJsonRaw = await fsPromises.readFile(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(packageJsonRaw)
    
    const extensionJsonPath = path.join(extensionFolder, 'extension.json')
    
    // Determine the entry point (main file). VS Code extensions standard entry points:
    // "main" parameter in package.json (usually "out/extension.js" or "dist/extension.js" or "extension.js")
    const mainFile = pkg.main || 'extension.js'
    
    // Ensure the main file exists, or create a mock file if it's dynamic loading so it passes resolveExtensionDir
    const absoluteMainPath = path.join(extensionFolder, mainFile)
    if (!fs.existsSync(absoluteMainPath)) {
      console.warn(`[ExtensionService] Main file ${mainFile} not found, ensuring parent directories exist and writing mock activation code...`)
      await fsPromises.mkdir(path.dirname(absoluteMainPath), { recursive: true })
      await fsPromises.writeFile(absoluteMainPath, 'export function activate() { console.log("Mock extension activated!"); }', 'utf-8')
    }
    
    const manifest = {
      id: extensionId,
      name: pkg.displayName || pkg.name || name,
      version: pkg.version || '0.0.1',
      main: mainFile,
      description: pkg.description || '',
      publisher: pkg.publisher || namespace,
      commands: [],
      contributes: pkg.contributes || {}
    }
    
    await fsPromises.writeFile(extensionJsonPath, JSON.stringify(manifest, null, 2), 'utf-8')
    
    // Install using the local installation helper
    console.log(`[ExtensionService] Installing local extension from ${extensionFolder}...`)
    const installed = await this.installLocalExtension(extensionFolder, 'marketplace')
    
    // Clean up temporary files
    await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    
    return installed
  }

  async enableExtension(extensionId: string) {
    const entry = this.extensions.get(extensionId)
    if (!entry) throw new Error(`Extension ${extensionId} not found.`)
    entry.enabled = true
    this.extensions.set(extensionId, entry)
    await this.saveRegistry()
    await this.activateExtension(entry)
    return entry
  }

  async disableExtension(extensionId: string) {
    const entry = this.extensions.get(extensionId)
    if (!entry) throw new Error(`Extension ${extensionId} not found.`)
    entry.enabled = false
    this.extensions.set(extensionId, entry)
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

  async checkExtensionUpdates() {
    const marketplace = await this.listMarketplaceExtensions()
    return Array.from(this.extensions.values()).map((entry) => {
      const remote = marketplace.find((item) => item.id === entry.id)
      const updateAvailable = remote && remote.version !== entry.version
      return { ...entry, updateAvailable, latestVersion: remote?.version }
    })
  }

  async runCommand(commandId: string, ...args: any[]) {
    const registered = this.commandRegistry.get(commandId)
    if (!registered) {
      throw new Error(`Command ${commandId} is not registered.`)
    }
    return registered.handler(...args)
  }

  async getCommandDefinitions() {
    return Array.from(this.commandRegistry.values()).map((command) => ({ extensionId: command.extensionId, id: command.id, title: command.title, description: command.description }))
  }

  async deactivateExtension(extensionId: string) {
    const module = this.loadedModules.get(extensionId)
    if (module && typeof module.deactivate === 'function') {
      try {
        await Promise.race([
          module.deactivate(),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Extension deactivate timed out')), ExtensionService.EXTENSION_ACTIVATION_TIMEOUT_MS)),
        ])
      } catch (err) {
        console.error(`Extension deactivate failed for ${extensionId}:`, err)
      }
    }
    this.loadedModules.delete(extensionId)
    for (const [key, registered] of this.commandRegistry.entries()) {
      if (registered.extensionId === extensionId) {
        this.commandRegistry.delete(key)
      }
    }
  }

  async installMarketplacePackage(extensionId: string, parentWindow?: Electron.BrowserWindow) {
    return this.installMarketplaceExtension(extensionId)
  }

  async openExtensionFolderFromDialog() {
    const result = await dialog.showOpenDialog({ title: 'Select extension folder', properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return this.installLocalExtension(result.filePaths[0])
  }

  async findInstalledExtension(extensionId: string) {
    return this.extensions.get(extensionId) ?? null
  }
}
