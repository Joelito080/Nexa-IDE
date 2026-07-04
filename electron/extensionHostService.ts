import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { fork, ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'

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
  manifest?: Record<string, any>
}

export interface MarketplaceExtension {
  id: string
  name: string
  description?: string
  version: string
  publisher?: string
  downloadCount?: number
  averageRating?: number
  iconUrl?: string
  tags?: string[]
}

export type ExtensionHostEventHandler = (channel: string, payload: unknown) => void

export class ExtensionHostService {
  private extensionStorageRoot: string
  private builtInMarketplaceRoot: string
  private registryPath: string
  private statePath: string
  private hostProcess: ChildProcess | null = null
  private eventEmitter = new EventEmitter()
  private pending = new Map<string, { resolve: (value: any) => void; reject: (reason: any) => void }>()
  private restarting = false

  constructor(options: { extensionStorageRoot: string; builtInMarketplaceRoot: string; onExtensionEvent?: ExtensionHostEventHandler }) {
    this.extensionStorageRoot = options.extensionStorageRoot
    this.builtInMarketplaceRoot = options.builtInMarketplaceRoot
    this.registryPath = path.join(this.extensionStorageRoot, 'registry.json')
    this.statePath = path.join(this.extensionStorageRoot, 'extensions-state.json')
    if (options.onExtensionEvent) {
      this.eventEmitter.on('extensionHostEvent', (channel, payload) => options.onExtensionEvent?.(channel, payload))
    }
  }

  async initialize(options?: { builtInMarketplaceRoot?: string }) {
    await fsPromises.mkdir(this.extensionStorageRoot, { recursive: true })
    await this.startHost()
    await this.sendRequest('init', {
      extensionStorageRoot: this.extensionStorageRoot,
      registryPath: this.registryPath,
      statePath: this.statePath,
      builtInMarketplaceRoot: options?.builtInMarketplaceRoot,
    })
  }

  private getHostScriptPath() {
    const baseDir = __dirname
    const scriptPath = path.join(baseDir, 'extensionHost.cjs')
    if (fs.existsSync(scriptPath)) {
      return scriptPath
    }
    const fallback = path.join(app.getAppPath(), 'dist-electron', 'extensionHost.cjs')
    return fallback
  }

  private async startHost() {
    if (this.hostProcess) {
      return
    }
    const scriptPath = this.getHostScriptPath()
    if (!scriptPath || !fs.existsSync(scriptPath)) {
      throw new Error(`Extension host script not found: ${scriptPath}`)
    }
    this.hostProcess = fork(scriptPath, [], {
      env: { ...process.env, EXTENSION_STORAGE_ROOT: this.extensionStorageRoot, EXTENSION_REGISTRY_PATH: this.registryPath, EXTENSION_STATE_PATH: this.statePath },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })

    this.hostProcess.on('message', (message: HostResponse | HostEvent) => {
      if ((message as HostEvent).type === 'event') {
        const event = message as HostEvent
        this.eventEmitter.emit('extensionHostEvent', event.channel, event.payload)
        return
      }
      const response = message as HostResponse
      const pending = this.pending.get(response.requestId)
      if (!pending) return
      if (response.success) {
        pending.resolve(response.result)
      } else {
        pending.reject(new Error(response.error || 'Unknown extension host error'))
      }
      this.pending.delete(response.requestId)
    })

    this.hostProcess.on('exit', (code, signal) => {
      const message = `Extension host exited with code=${code} signal=${signal}`
      this.eventEmitter.emit('extensionHostEvent', 'extensionHost:crash', { message, code, signal })
      this.hostProcess = null
      if (!this.restarting) {
        setTimeout(() => this.startHost().catch((err) => console.error('Failed to restart extension host:', err)), 1000)
      }
    })

    this.hostProcess.on('error', (error) => {
      this.eventEmitter.emit('extensionHostEvent', 'extensionHost:error', { error: String(error) })
    })
  }

  private sendRequest(type: string, payload?: any): Promise<any> {
    if (!this.hostProcess) {
      return Promise.reject(new Error('Extension host is not running'))
    }
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const request: HostRequest = { requestId, type, payload }
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject })
      this.hostProcess?.send(request)
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId)
          reject(new Error(`Extension host request timed out: ${type}`))
        }
      }, 15000)
    })
  }

  async listInstalledExtensions(): Promise<InstalledExtension[]> {
    return this.sendRequest('listInstalled')
  }

  async listMarketplace(query?: string): Promise<MarketplaceExtension[]> {
    return this.sendRequest('listMarketplace', { query })
  }

  async listCommands(): Promise<any[]> {
    return this.sendRequest('listCommands')
  }

  async runCommand(commandId: string, ...args: any[]) {
    return this.sendRequest('runCommand', { commandId, args })
  }

  async enableExtension(extensionId: string) {
    return this.sendRequest('enable', { extensionId })
  }

  async disableExtension(extensionId: string) {
    return this.sendRequest('disable', { extensionId })
  }

  async uninstallExtension(extensionId: string) {
    return this.sendRequest('uninstall', { extensionId })
  }

  async installLocalExtension(sourceFolder: string) {
    return this.sendRequest('installLocal', { sourceFolder, source: 'local' })
  }

  async installMarketplaceExtension(extensionId: string) {
    return this.sendRequest('installMarketplace', { extensionId, source: 'marketplace' })
  }

  async checkForUpdates() {
    return this.sendRequest('checkForUpdates', {})
  }

  async updateExtension(extensionId: string) {
    return this.sendRequest('updateExtension', { extensionId })
  }

  async updateAllExtensions() {
    return this.sendRequest('updateAllExtensions', {})
  }

  async clearExtensionQuarantine(extensionId: string) {
    return this.sendRequest('clearQuarantine', { extensionId })
  }

  async reloadExtensions() {
    return this.sendRequest('reloadExtensions', {})
  }

  async restartExtensionHost() {
    if (!this.hostProcess) {
      await this.startHost()
      return { success: true }
    }
    this.restarting = true
    const result = await this.sendRequest('restartHost', {})
    this.restarting = false
    return result
  }

  async setWorkspaceRoot(rootPath: string | null) {
    return this.sendRequest('setWorkspaceRoot', { root: rootPath })
  }
}
