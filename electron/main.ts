import './shim'
import dotenv from 'dotenv'
dotenv.config()
import { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import path from 'node:path'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ignore from 'ignore'
import simpleGit from 'simple-git'
import {
  askAI,
  askAIStream,
  abortStream,
  abortAllStreams,
  fetchOpenRouterModels,
  setOpenRouterKey,
  getOpenRouterKey,
  checkOpenRouterConnection,
  getBudgetStatus,
  isOpenRouterKeyConfigured,
} from './aiService'
import { AgentExecutor } from '../src/ai/agent/freeAgentMode'
import {
  createTerminalSession,
  writeToTerminal,
  resizeTerminal,
  killTerminalSession,
  killAllSessions,
  runCommandInSession,
  getPlatformInfo,
  warmUpTerminal,
} from './terminalService'
import { workspaceEngine } from './workspaceEngine'
import { runAgentLoop } from './agent/agentLoop'
import { memoryService } from './agent/memoryService'
import { executeTool } from './agent/toolHandlers'
import * as dbService from './dbService'
import { searchFiles } from './search/searchEngine'
import { memoryManager, LRUCache } from './memoryManager'
import { isPathInsideWorkspace, allowPath } from './safetyRules'
import { createSplashWindow, closeSplashWindow } from './splash'
import {
  saveAuthSession,
  loadAuthSession,
  clearAuthSession,
  isEncryptionAvailable,
} from './authStorage'
import { handleGoogleOAuth } from './oauth'
import { ExtensionService } from './extensionService'
import {
  listProjectTemplates,
  findTemplateByPrompt,
  createProject,
  installDependencies,
  analyzeWorkspace,
  createDeployConfig,
} from './projectTemplates'
import { PromptHistoryService, SnippetVaultService } from './premiumService'
import {
  activateLicense,
  deactivateLicense,
  getLicenseStatus,
  refreshLicenseStatus,
  canUseAI,
  canCreateTemplate,
  canInstallExtension,
  recordAIRequest,
  recordTemplateUsage,
  recordExtensionInstall,
  LicenseStatus,
} from './licenseService'

// ESM-compatible __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url))
console.log('[Electron] __dirname:', __dirname)

try {
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    setOpenRouterKey(process.env.OPENROUTER_API_KEY.trim())
  }
  console.log('[Electron] Loaded env:', {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? '***' : undefined,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? '***' : undefined,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ? '***' : undefined,
  })
} catch (err) {
  console.warn('[Electron] Env setup warning:', err)
}

function writeLogEntrySync(projectPath: string | null, type: 'info' | 'error' | 'warn', category: string, message: string) {
  const timestamp = new Date().toISOString()
  const logDir = projectPath 
    ? path.join(projectPath, '.nexus', 'logs')
    : path.join(app.getPath('userData'), '.nexus', 'logs')
  
  try {
    fs.mkdirSync(logDir, { recursive: true })
    const dateStr = new Date().toISOString().slice(0, 10)
    const logFile = path.join(logDir, `nexus-${dateStr}.log`)
    const line = `[${timestamp}] [${type.toUpperCase()}] [${category}] ${message}\n`
    fs.appendFileSync(logFile, line, 'utf-8')
  } catch (err) {
    console.error('Failed to write log entry:', err)
  }
}

// ─── Path Setup ────────────────────────────────────────────────────────────────
// dist/         → renderer build output (Vite)
// dist-electron/ → main process / preload build output
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public')

const userDataPath = app.isPackaged
  ? app.getPath('userData')
  : path.join(__dirname, '../.electron-user-data')
app.setPath('userData', userDataPath)
log.info('[Electron] userData path set to:', userDataPath)

const supportLogsPath = path.join(app.getPath('userData'), 'NEXUS', 'logs')
fs.mkdirSync(supportLogsPath, { recursive: true })
log.transports.file.resolvePath = () => path.join(supportLogsPath, 'main.log')
log.transports.console.level = false
log.transports.file.level = 'info'
log.info('[Electron] Logs will be written to', supportLogsPath)

const applyUpdateChannelToAutoUpdater = (channel: string) => {
  const normalizedChannel = channel === 'beta' ? 'beta' : 'stable'
  const updater = autoUpdater as any
  updater.allowPrerelease = normalizedChannel === 'beta'
  try {
    updater.channel = normalizedChannel === 'beta' ? 'beta' : 'latest'
  } catch {
    // Some updater providers may not use the channel field, allow prerelease behavior instead.
  }
  log.info('AutoUpdater: configured update channel', {
    activeChannel: normalizedChannel,
    allowPrerelease: updater.allowPrerelease,
    channel: updater.channel,
  })
}

try {
  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.allowDowngrade = true
  autoUpdater.autoInstallOnAppQuit = true
  applyUpdateChannelToAutoUpdater('beta')
} catch (err) {
  log.warn('AutoUpdater initialization failed', err)
}

let extensionStorageRoot = app.isPackaged
  ? path.join(app.getPath('userData'), 'extensions')
  : path.join(__dirname, '../extensions')
const marketplaceRoot = path.join(__dirname, '../extensions', 'marketplace')
log.info('[Electron] initial extensionStorageRoot:', extensionStorageRoot)

if (app.isPackaged) {
  const extensionDirParent = path.dirname(extensionStorageRoot)
  try {
    fs.mkdirSync(extensionDirParent, { recursive: true })
  } catch (err) {
    log.warn('Could not create extension storage parent directory:', extensionDirParent, err)
  }

  try {
    if (fs.existsSync(extensionStorageRoot) && !fs.statSync(extensionStorageRoot).isDirectory()) {
      throw new Error('extensionStorageRoot exists and is not a directory')
    }
    fs.mkdirSync(extensionStorageRoot, { recursive: true })
  } catch (err) {
    log.warn('Failed to create extensionStorageRoot, falling back to userData root:', extensionStorageRoot, err)
    extensionStorageRoot = app.getPath('userData')
    try {
      fs.mkdirSync(extensionStorageRoot, { recursive: true })
    } catch (innerErr) {
      log.error('Failed to create fallback extensionStorageRoot:', extensionStorageRoot, innerErr)
    }
  }
}

log.info('[Electron] extensionStorageRoot resolved to:', extensionStorageRoot)
const extensionService = new ExtensionService({
  extensionStorageRoot,
  builtInMarketplaceRoot: marketplaceRoot,
  onExtensionEvent: (channel, payload) => {
    mainWindow?.webContents.send(channel, payload)
  },
})
const promptHistoryService = new PromptHistoryService(userDataPath)
const snippetVaultService = new SnippetVaultService(userDataPath)

app.on('ready', () => {
  log.info('[Electron] app ready event fired')
})

app.on('window-all-closed', () => {
  console.log('WINDOW CLOSED')
  if (process.platform !== 'darwin') {
    app.quit()
    mainWindow = null
  }
})

app.on('before-quit', () => {
  log.info('APP QUITTING')
  killAllSessions()
  abortAllStreams() // Cancel any active AI streams on quit
  stopWorkspaceWatcher()
})

process.on('uncaughtException', (err) => {
  log.error('UNCAUGHT EXCEPTION:', err)
  try {
    writeLogEntrySync(null, 'error', 'System', `Uncaught Exception: ${err.message}\nStack: ${err.stack}`)
  } catch {}
  killAllSessions()
  try {
    dialog.showErrorBox('Fatal Error', `An unrecoverable error occurred:\n\n${err.message}\n\nThe application will now exit.`)
  } catch { /* dialog may fail during shutdown */ }
  app.exit(1)
})

process.on('unhandledRejection', (reason) => {
  log.error('UNHANDLED PROMISE REJECTION:', reason)
  const message = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : ''
  try {
    writeLogEntrySync(null, 'error', 'System', `Unhandled Rejection: ${message}\nStack: ${stack}`)
  } catch {}
  killAllSessions()
  try {
    dialog.showErrorBox('Fatal Promise Error', `An unrecoverable promise error occurred:\n\n${message}\n\nThe application will now exit.`)
  } catch { /* dialog may fail during shutdown */ }
  app.exit(1)
})

// Injected by vite-plugin-electron in dev mode, or fallback to default dev server
// When using the standalone dev workflow, keep the Vite port fixed so Electron can load it reliably.
let VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
if (!VITE_DEV_SERVER_URL && !app.isPackaged) {
  VITE_DEV_SERVER_URL = 'http://localhost:5174/'
}
const isDevelopment = Boolean(VITE_DEV_SERVER_URL)
console.log('[Electron] VITE_DEV_SERVER_URL:', VITE_DEV_SERVER_URL)
console.log('[Electron] isDevelopment:', isDevelopment)

let mainWindow: BrowserWindow | null = null
let isReadyToQuit = false
let workspaceWatcher: fs.FSWatcher | null = null
let watcherDebounceTimer: ReturnType<typeof setTimeout> | null = null

function stopWorkspaceWatcher() {
  if (workspaceWatcher) {
    try {
      workspaceWatcher.close()
    } catch (err) {
      log.error('[Watcher] Error closing watcher:', err)
    }
    workspaceWatcher = null
  }
  if (watcherDebounceTimer) {
    clearTimeout(watcherDebounceTimer)
    watcherDebounceTimer = null
  }
}

function setupWorkspaceWatcher(rootPath: string) {
  stopWorkspaceWatcher()

  log.info(`[Watcher] Setting up workspace watcher for: ${rootPath}`)

  let ig: any = null
  const gitignorePath = path.join(rootPath, '.gitignore')
  try {
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8')
      ig = ignore().add(gitignoreContent)
      log.info('[Watcher] Loaded rules from .gitignore')
    }
  } catch (err) {
    log.warn('[Watcher] Failed to read .gitignore:', err)
  }

  // Base ignore rules
  const baseIgnores = new Set([
    'node_modules', '.git', '.nexus', 'dist', 'build', 'coverage', '.next',
    'release', 'dist-electron', '.electron-user-data', '__pycache__', '.venv',
    '.cache', 'temp', 'logs'
  ])

  try {
    workspaceWatcher = fs.watch(rootPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return

      // Normalize filename path separators
      const relPath = filename.replace(/\\/g, '/')
      const pathParts = relPath.split('/')

      // 1. Check if any parent folder of the changed path matches the base ignore list
      const isBaseIgnored = pathParts.some(part => baseIgnores.has(part))
      if (isBaseIgnored) return

      // 2. Check against .gitignore rules if loaded
      if (ig) {
        try {
          if (ig.ignores(relPath)) return
        } catch { /* ignore errors from empty/invalid paths */ }
      }

      // Debounce notifying the renderer to avoid event storm during rapid changes (e.g. build/install)
      if (watcherDebounceTimer) clearTimeout(watcherDebounceTimer)
      watcherDebounceTimer = setTimeout(() => {
        log.info(`[Watcher] Workspace changed: ${relPath} (${eventType}). Notifying renderer...`)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('workspace:changed', { eventType, filename })
        }
      }, 300)
    })
  } catch (err) {
    log.error(`[Watcher] Failed to start fs.watch on ${rootPath}:`, err)
  }
}


// Domains allowed for Firebase / Google OAuth popup windows
const AUTH_HOSTS = [
  'accounts.google.com',
  'firebaseapp.com',
  'google.com',
]

function isAuthUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return AUTH_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))
  } catch {
    return false
  }
}

// ─── Create Main Window ─────────────────────────────────────────────────────
async function createWindow() {
  // Prefer `preload.cjs` (CommonJS) output from Vite build.
  // Production MUST use `preload.cjs` to avoid ESM/CJS module mismatches when
  // `package.json` sets "type": "module". In dev we also prefer the same
  // filename and wait briefly for Vite to write it.
  const desiredPreload = path.resolve(__dirname, 'preload.cjs')
  let preloadPath: string | undefined

  if (app.isPackaged) {
    // In packaged builds, fail fast if preload.cjs is missing (log an error).
    if (fs.existsSync(desiredPreload)) {
      preloadPath = desiredPreload
    } else {
      log.error('[Electron] preload.cjs missing in packaged app at', desiredPreload)
    }
  } else {
    // Dev: wait up to a short timeout for Vite to emit preload.cjs
    const maxWaitMs = 5000
    const pollMs = 100
    const started = Date.now()
    while (Date.now() - started < maxWaitMs) {
      if (fs.existsSync(desiredPreload)) {
        preloadPath = desiredPreload
        break
      }
      await new Promise((r) => setTimeout(r, pollMs))
    }
    if (!preloadPath) {
      log.error('[Electron] preload.cjs not found in dev after waiting; starting without preload', desiredPreload)
    }
  }

  console.log('[Electron] using preload path:', preloadPath ?? 'none')
  log.info('[Electron] using preload path:', preloadPath ?? 'none')

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth:  960,
    minHeight: 640,

    // Custom title bar — we draw our own in React
    frame: false,
    titleBarStyle: 'hidden',

    // Prevents white flash before content loads
    backgroundColor: '#080909',
    show: false,

    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      // sandbox: true is required for production security, but can interfere
      // with contextBridge preload delivery during dev HMR reloads in Electron 29.
      sandbox: app.isPackaged,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  // Deny all privileged permission requests in the renderer process.
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  mainWindow.webContents.session.setPermissionCheckHandler(() => false)

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  // Show only when renderer is fully ready (no FOUC)
  mainWindow.once('ready-to-show', () => {
    closeSplashWindow(mainWindow!)
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => log.warn('AutoUpdater check failed', err))
    }
  })

  mainWindow.on('close', (e) => {
    if (isReadyToQuit) return
    e.preventDefault()
    mainWindow?.webContents.send('app:quit-request')
    setTimeout(() => {
      if (!isReadyToQuit) {
        isReadyToQuit = true
        app.quit()
      }
    }, 3000)
  })

  // Notify renderer when window maximize state changes
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false)
  })
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window:maximized', true)
  })
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('window:maximized', false)
  })

  // Firebase Google OAuth opens in a child window; other links go to system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAuthUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500,
          height: 700,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        },
      }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDevelopment) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAuthUrl(navigationUrl)) {
      event.preventDefault()
      shell.openExternal(navigationUrl)
    }
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details)
    if (details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload()
    }
  })

  // ── Load URL (dev server may not be ready yet) ──────────────────────────────
  if (VITE_DEV_SERVER_URL) {
    log.info('[Electron] Loading dev server:', VITE_DEV_SERVER_URL)
    // Try to connect to the dev server for up to ~10s before falling back
    const tryConnect = async (url: string, attempts = 20, delayMs = 500) => {
      const { hostname, port } = new URL(url)
      // dynamic import to remain ESM-compatible in compiled output
      const net = await import('node:net')
      return new Promise<boolean>((resolve) => {
        let tries = 0
        const attempt = () => {
          tries += 1
          const socket = net.createConnection({ host: hostname, port: Number(port) }, () => {
            socket.destroy()
            resolve(true)
          })
          socket.on('error', () => {
            socket.destroy()
            if (tries >= attempts) resolve(false)
            else setTimeout(attempt, delayMs)
          })
        }
        attempt()
      })
    }

    const ok = await tryConnect(VITE_DEV_SERVER_URL)
    if (ok) {
      log.info('[Electron] Dev server is ready, loading:', VITE_DEV_SERVER_URL)
      mainWindow.loadURL(VITE_DEV_SERVER_URL)
    } else {
      log.warn('[Electron] Dev server not ready, falling back to dist')
      const indexPath = path.join(process.env.DIST!, 'index.html')
      if (fs.existsSync(indexPath)) {
        mainWindow.loadFile(indexPath)
      } else {
        // As a last resort load a blank page so the app doesn't crash
        mainWindow.loadURL('about:blank')
      }
    }
  } else {
    log.info('[Electron] Not in dev mode, loading from dist')
    const indexPath = path.join(process.env.DIST!, 'index.html')
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath)
    } else {
      log.error('[Electron] dist/index.html not found, loading blank page')
      mainWindow.loadURL('about:blank')
    }
  }
}

// ─── IPC: Window Controls ───────────────────────────────────────────────────
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.on('window:close', () => {
  mainWindow?.close()
})

ipcMain.on('app:ready-to-quit', () => {
  isReadyToQuit = true
  app.quit()
})

ipcMain.handle('window:isMaximized', () => {
  return mainWindow?.isMaximized() ?? false
})

ipcMain.on('app:allowPath', (_event, dirPath: string) => {
  allowPath(dirPath)
})

// ─── IPC: Auth Session Storage (Phase 2) ────────────────────────────────────
ipcMain.handle('auth:saveSession', async (_event, data: string) => {
  await saveAuthSession(data)
})

ipcMain.handle('auth:loadSession', async () => {
  return loadAuthSession()
})

ipcMain.handle('auth:clearSession', async () => {
  await clearAuthSession()
})

ipcMain.handle('auth:isEncryptionAvailable', () => {
  return isEncryptionAvailable()
})

function encryptKey(key: string): string {
  if (!key) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(key)
      return `enc:${encrypted.toString('base64')}`
    }
  } catch (err) {
    console.error('[Encryption] safeStorage key encrypt failed:', err)
  }
  return `b64:${Buffer.from(key, 'utf-8').toString('base64')}`
}

function decryptKey(val: string): string {
  if (!val) return ''
  if (val.startsWith('enc:')) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const buf = Buffer.from(val.slice(4), 'base64')
        return safeStorage.decryptString(buf)
      }
    } catch (err) {
      console.error('[Encryption] safeStorage key decrypt failed:', err)
    }
    return '' // fail-closed
  }
  if (val.startsWith('b64:')) {
    try {
      return Buffer.from(val.slice(4), 'base64').toString('utf-8')
    } catch {
      return ''
    }
  }
  return val // fallback for old plaintext settings
}

ipcMain.handle('settings:load', async () => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'nexus-settings.json')
    const raw = await fsPromises.readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(raw)
    
    if (typeof settings.openrouterApiKey === 'string') {
      const decrypted = decryptKey(settings.openrouterApiKey)
      setOpenRouterKey(decrypted)
      settings.openrouterKeyConfigured = Boolean(decrypted)
      delete settings.openrouterApiKey
    } else {
      settings.openrouterKeyConfigured = isOpenRouterKeyConfigured()
    }

    settings.aiProvider = 'openrouter'
    delete settings.geminiApiKey
    delete settings.ollamaEndpoint
    
    return { settings }
  } catch {
    return { settings: null }
  }
})

ipcMain.handle('settings:save', async (_event, settings: Record<string, unknown>) => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'nexus-settings.json')
    
    // Read current settings to check if key was masked
    let currentKeyEncrypted = ''
    try {
      const raw = await fsPromises.readFile(settingsPath, 'utf-8')
      const current = JSON.parse(raw)
      currentKeyEncrypted = current.openrouterApiKey || ''
    } catch {
      // ignore
    }

    const settingsCopy = { ...settings }
    delete settingsCopy.geminiApiKey
    delete settingsCopy.ollamaEndpoint

    if (settingsCopy.openrouterApiKey === undefined) {
      // Preserve the existing encrypted key when the renderer saves settings
      // without including the raw key. The renderer only tracks whether the key
      // is configured, not the secret itself.
      if (currentKeyEncrypted) {
        settingsCopy.openrouterApiKey = currentKeyEncrypted
        settingsCopy.openrouterKeyConfigured = true
      } else if (process.env.OPENROUTER_API_KEY?.trim()) {
        const rawKey = process.env.OPENROUTER_API_KEY.trim()
        setOpenRouterKey(rawKey)
        settingsCopy.openrouterApiKey = encryptKey(rawKey)
        settingsCopy.openrouterKeyConfigured = true
      }
    } else if (typeof settingsCopy.openrouterApiKey === 'string') {
      if (settingsCopy.openrouterApiKey === '********') {
        settingsCopy.openrouterApiKey = currentKeyEncrypted
        settingsCopy.openrouterKeyConfigured = Boolean(currentKeyEncrypted)
      } else if (settingsCopy.openrouterApiKey.trim() === '') {
        settingsCopy.openrouterApiKey = ''
        settingsCopy.openrouterKeyConfigured = false
        setOpenRouterKey('')
      } else {
        const rawKey = settingsCopy.openrouterApiKey.trim()
        setOpenRouterKey(rawKey)
        settingsCopy.openrouterApiKey = encryptKey(rawKey)
        settingsCopy.openrouterKeyConfigured = true
      }
    }

    settingsCopy.aiProvider = 'openrouter'
    delete settingsCopy.geminiApiKey
    delete settingsCopy.ollamaEndpoint
    
    await fsPromises.writeFile(settingsPath, JSON.stringify(settingsCopy, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

async function checkGitHealth(projectPath: string | null): Promise<{
  installed: boolean
  isRepo: boolean
  currentBranch: string | null
  username: string | null
  email: string | null
  error: string | null
}> {
  try {
    execSync('git --version', { stdio: 'ignore', timeout: 2000 })
  } catch {
    return { installed: false, isRepo: false, currentBranch: null, username: null, email: null, error: 'Git CLI not found in PATH' }
  }

  if (!projectPath) {
    return { installed: true, isRepo: false, currentBranch: null, username: null, email: null, error: 'No workspace open' }
  }

  try {
    const git = simpleGit(projectPath)
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      return { installed: true, isRepo: false, currentBranch: null, username: null, email: null, error: 'Workspace is not a git repository' }
    }
    const [branch, nameRes, emailRes] = await Promise.all([
      git.revparse(['--abbrev-ref', 'HEAD']).catch(() => 'detached HEAD'),
      git.getConfig('user.name').catch(() => ({ value: null })),
      git.getConfig('user.email').catch(() => ({ value: null }))
    ])
    return {
      installed: true,
      isRepo: true,
      currentBranch: branch.trim(),
      username: typeof nameRes === 'string' ? nameRes : (nameRes as any).value || null,
      email: typeof emailRes === 'string' ? emailRes : (emailRes as any).value || null,
      error: null
    }
  } catch (err) {
    return { installed: true, isRepo: false, currentBranch: null, username: null, email: null, error: (err as Error).message }
  }
}

async function scanWorkspaceSize(dirPath: string | null): Promise<{ fileCount: number; totalSize: number }> {
  if (!dirPath) return { fileCount: 0, totalSize: 0 }
  let fileCount = 0
  let totalSize = 0
  const ignored = new Set([
    'node_modules', '.git', '.nexus', '.next', 'dist', 'build', 'coverage',
    '.cache', 'temp', 'logs', 'release', '.electron-user-data'
  ])

  async function walk(currentDir: string) {
    try {
      const entries = await fsPromises.readdir(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        if (ignored.has(entry.name)) continue
        const fullPath = path.join(currentDir, entry.name)
        if (entry.isDirectory()) {
          await walk(fullPath)
        } else if (entry.isFile()) {
          fileCount++
          try {
            const stats = await fsPromises.stat(fullPath)
            totalSize += stats.size
          } catch {}
        }
      }
    } catch {}
  }

  await walk(dirPath)
  return { fileCount, totalSize }
}

ipcMain.handle('app:getDiagnostics', async (_event, payload: { projectPath: string | null }) => {
  try {
    const { detectOpenCode } = await import('./opencodeService')
    const opencode = await detectOpenCode().catch(() => ({ installed: false, path: null, version: null }))
    const openrouter = await checkOpenRouterConnection()
    const budget = await getBudgetStatus()
    const git = await checkGitHealth(payload.projectPath)
    const workspace = await scanWorkspaceSize(payload.projectPath)

    const memoryUsage = process.memoryUsage()
    const performance = {
      heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      systemTotalMemoryGB: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10,
      systemFreeMemoryGB: Math.round(os.freemem() / 1024 / 1024 / 1024 * 10) / 10,
      cpuLoadAverage: os.loadavg(),
    }

    return {
      opencode,
      openrouter,
      budget,
      git,
      workspace,
      performance,
      appVersion: app.getVersion(),
    }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('updater:check', async () => {
  try {
    if (!app.isPackaged) {
      return { status: 'update-not-available', version: app.getVersion() }
    }
    const result = await autoUpdater.checkForUpdates()
    return { status: result ? 'checking' : 'update-not-available', version: app.getVersion() }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('app:getVersion', () => {
  try {
    return app.getVersion()
  } catch (err) {
    log.error('App version lookup failed', err)
    return 'unknown'
  }
})

ipcMain.handle('app:logRendererError', async (_event, payload: { projectPath: string | null; error: string; stack?: string }) => {
  let msg = payload.stack ? `${payload.error}\nStack: ${payload.stack}` : payload.error
  const key = getOpenRouterKey()
  if (key && key.length >= 8) {
    msg = msg.split(key).join('[REDACTED]')
  }
  writeLogEntrySync(payload.projectPath, 'error', 'Renderer', msg)
  return { success: true }
})

ipcMain.handle('logs:openFolder', async (_event, projectPath: string | null) => {
  const logDir = projectPath 
    ? path.join(projectPath, '.nexus', 'logs')
    : path.join(app.getPath('userData'), '.nexus', 'logs')
  try {
    fs.mkdirSync(logDir, { recursive: true })
    await shell.openPath(logDir)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('updater:setChannel', async (_event, channel: string) => {
  if (channel !== 'beta' && channel !== 'stable') {
    return { error: 'Unsupported update channel' }
  }

  applyUpdateChannelToAutoUpdater(channel)
  try {
    await autoUpdater.checkForUpdatesAndNotify()
  } catch (err) {
    log.warn('AutoUpdater check failed after channel switch', err)
  }

  return { success: true, channel }
})

ipcMain.handle('updater:getChannel', async () => {
  const channel = autoUpdater.allowPrerelease ? 'beta' : 'stable'
  return {
    channel,
    allowPrerelease: autoUpdater.allowPrerelease,
  }
})

ipcMain.handle('feedback:submit', async (_event, feedback: string) => {
  try {
    const feedbackRoot = path.join(app.getPath('appData'), 'NEXUS', 'feedback')
    await fsPromises.mkdir(feedbackRoot, { recursive: true })

    const licenseStatus = await getLicenseStatus().catch(() => null)
    const logPath = path.join(app.getPath('userData'), 'NEXUS', 'logs', 'main.log')
    let crashLogs: string | null = null

    try {
      const fileContents = await fsPromises.readFile(logPath, 'utf-8')
      crashLogs = fileContents.split('\n').slice(-120).join('\n')
    } catch {
      crashLogs = null
    }

    const entry = {
      timestamp: new Date().toISOString(),
      version: app.getVersion(),
      updateChannel: autoUpdater.allowPrerelease ? 'beta' : 'stable',
      licenseTier: licenseStatus?.plan ?? 'free',
      os: `${process.platform} ${process.arch}`,
      crashLogs,
      feedback,
    }

    const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL || process.env.VITE_FEEDBACK_WEBHOOK_URL
    let webhookSent = false

    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        })
        webhookSent = true
      } catch (err) {
        log.warn('Feedback webhook failed', err)
      }
    }

    const timestamp = new Date().toISOString().slice(0, 16).replace('T', '-')
    const filename = `feedback-${timestamp}.json`
    const filePath = path.join(feedbackRoot, filename)
    await fsPromises.writeFile(filePath, JSON.stringify({ ...entry, webhookSent }, null, 2), 'utf-8')

    return { success: true, webhookSent }
  } catch (err) {
    log.error('Feedback submission failed', err)
    return { error: (err as Error).message }
  }
})

ipcMain.handle('feedback:openFolder', async () => {
  try {
    const feedbackRoot = path.join(app.getPath('appData'), 'NEXUS', 'feedback')
    await fsPromises.mkdir(feedbackRoot, { recursive: true })
    const result = await shell.openPath(feedbackRoot)
    if (result) {
      return { error: result }
    }
    return { success: true, path: feedbackRoot }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

// ─── IPC: OAuth (Google PKCE) ──────────────────────────────────────────────
ipcMain.handle('oauth:login', async () => {
  try {
    const result = await handleGoogleOAuth()
    return result
  } catch (error) {
    log.error('oauth:login IPC handler error:', error)
    throw error
  }
})

ipcMain.handle('oauth:isConfigured', () => {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
})

// Receive preload execution notification (diagnostic)
ipcMain.on('preload:executed', () => {
  // eslint-disable-next-line no-console
  console.log('MAIN: received preload:executed!')
})

// ─── IPC: File System ───────────────────────────────────────────────────────
ipcMain.handle('fs:stat', async (_event, filePath: string) => {
  try {
    if (filePath.includes('..') || filePath.includes('../') || filePath.includes('..\\')) {
      return { error: 'Access denied: path traversal detected' }
    }
    const wsRoot = workspaceEngine.getRoot()
    if (wsRoot && !isPathInsideWorkspace(filePath, wsRoot)) {
      return { error: 'Access denied: path is outside the workspace' }
    }
    const stat = await fsPromises.stat(filePath)
    return {
      size: stat.size,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      mtimeMs: stat.mtimeMs,
      birthtimeMs: stat.birthtimeMs,
    }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
  try {
    if (dirPath.includes('..') || dirPath.includes('../') || dirPath.includes('..\\')) {
      return { error: 'Access denied: path traversal detected' }
    }
    const wsRoot = workspaceEngine.getRoot()
    if (wsRoot && !isPathInsideWorkspace(dirPath, wsRoot)) {
      return { error: 'Access denied: path is outside the workspace' }
    }
    const rawEntries = await fsPromises.readdir(dirPath, { withFileTypes: true })

    const IGNORED_DIRS = new Set([
      'node_modules', '.git', '.nexus', 'dist', 'build', 'coverage', '.next',
      '.cache', 'temp', 'logs'
    ])

    const filteredEntries = rawEntries.filter((entry) => {
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) return false
      if (entry.name.startsWith('.') && entry.name !== '.env.example') return false
      return true
    })

    // Sort once: directories first, then alphabetical
    const sorted = filteredEntries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    const CHUNK = 200
    const result: Array<{ name: string; isDirectory: boolean; isFile: boolean }> = []

    for (let i = 0; i < sorted.length; i += CHUNK) {
      const batch = sorted.slice(i, i + CHUNK)
      for (const entry of batch) {
        result.push({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
        })
      }
      // Yield to event loop between chunks so large directories don't freeze the UI
      if (i + CHUNK < sorted.length) {
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    }

    log.info(`[Workspace] Successfully loaded ${result.length} items from ${dirPath}`)
    return result
  } catch (err) {
    log.error(`[Workspace] Failed to read directory ${dirPath}:`, err)
    return { error: (err as Error).message }
  }
})

// ─── File read cache (LRU, keyed by path) ────────────────────────────────────
const FILE_SIZE_LIMIT = 1 * 1024 * 1024
const CACHE_MAX_ENTRIES = 20
const CACHE_TRUST_MS = 5000 // skip stat() if cache entry is younger than this

interface CacheEntry {
  content: string
  mtimeMs: number
  size: number
  loadedAt: number
}

const fileCache = new LRUCache<string, CacheEntry>(CACHE_MAX_ENTRIES)
memoryManager.register('fs:fileCache', fileCache)

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  console.log("Reading file:", filePath)
  try {
    const normalized = path.normalize(filePath)
    if (normalized.includes('..') || filePath.includes('..') || filePath.includes('../') || filePath.includes('..\\')) {
      return { success: false, error: 'Access denied: path traversal detected' }
    }
    const wsRoot = workspaceEngine.getRoot()
    if (wsRoot && !isPathInsideWorkspace(filePath, wsRoot)) {
      return { success: false, error: 'Access denied: path is outside the workspace' }
    }

    const cached = fileCache.get(normalized)
    // Stale-while-revalidate: trust recent cache entries without stat syscall
    if (cached && Date.now() - cached.loadedAt < CACHE_TRUST_MS) {
      return { success: true, content: cached.content }
    }

    const stat = await fsPromises.stat(normalized)

    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      cached.loadedAt = Date.now()
      return { success: true, content: cached.content }
    }

    if (stat.size > FILE_SIZE_LIMIT) {
      const fd = await fsPromises.open(normalized, 'r')
      const buf = Buffer.alloc(FILE_SIZE_LIMIT)
      const { bytesRead } = await fd.read(buf, 0, FILE_SIZE_LIMIT, 0)
      await fd.close()
      const preview = buf.toString('utf-8', 0, bytesRead)
      return { success: true, content: preview, truncated: true, totalSize: stat.size }
    }

    const content = await fsPromises.readFile(normalized, 'utf-8')

    fileCache.set(normalized, { content, mtimeMs: stat.mtimeMs, size: stat.size, loadedAt: Date.now() })

    return { success: true, content }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('fs:readFileChunk', async (_event, filePath: string, offset: number, length: number) => {
  try {
    const wsRoot = workspaceEngine.getRoot()
    if (wsRoot && !isPathInsideWorkspace(filePath, wsRoot)) {
      return { error: 'Access denied: path is outside the workspace' }
    }
    const stat = await fsPromises.stat(filePath)
    const actualLength = Math.min(length, stat.size - offset)
    if (actualLength <= 0) return { content: '', eof: true }
    const fd = await fsPromises.open(filePath, 'r')
    const buf = Buffer.alloc(actualLength)
    const { bytesRead } = await fd.read(buf, 0, actualLength, offset)
    await fd.close()
    const chunk = buf.toString('utf-8', 0, bytesRead)
    const eof = offset + bytesRead >= stat.size
    return { content: chunk, eof }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  try {
    if (filePath.includes('..') || filePath.includes('../') || filePath.includes('..\\')) {
      return { error: 'Access denied: path traversal detected' }
    }
    const wsRoot = workspaceEngine.getRoot()
    if (wsRoot && !isPathInsideWorkspace(filePath, wsRoot)) {
      return { error: 'Access denied: path is outside the workspace' }
    }
    const tempPath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    try {
      await fsPromises.writeFile(tempPath, content, 'utf-8')
      await fsPromises.rename(tempPath, filePath)
      fileCache.delete(filePath)
      return { success: true }
    } catch (err) {
      try {
        await fsPromises.unlink(tempPath)
      } catch {}
      throw err;
    }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('fs:createFile', async (_event, filePath: string) => {
  try {
    if (filePath.includes('..') || filePath.includes('../') || filePath.includes('..\\')) {
      return { error: 'Access denied: path traversal detected' }
    }
    const wsRoot = workspaceEngine.getRoot()
    if (wsRoot && !isPathInsideWorkspace(filePath, wsRoot)) {
      return { error: 'Access denied: path is outside the workspace' }
    }
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
    await fsPromises.writeFile(filePath, '', 'utf-8')
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('fs:createFolder', async (_event, folderPath: string) => {
  try {
    if (folderPath.includes('..') || folderPath.includes('../') || folderPath.includes('..\\')) {
      return { error: 'Access denied: path traversal detected' }
    }
    const wsRoot = workspaceEngine.getRoot()
    if (wsRoot && !isPathInsideWorkspace(folderPath, wsRoot)) {
      return { error: 'Access denied: path is outside the workspace' }
    }
    await fsPromises.mkdir(folderPath, { recursive: true })
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('dialog:openFolder', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Open Folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths.length) return null
    const folderPath = result.filePaths[0]
    log.info(`[Workspace] User selected folder via dialog: ${folderPath}`)
    allowPath(folderPath)
    return folderPath
  } catch (err) {
    log.error(`[Workspace] Failed to open folder dialog:`, err)
    return { error: (err as Error).message }
  }
})

ipcMain.handle('dialog:createFile', async () => {
  try {
    const result = await dialog.showSaveDialog({
      title: 'Create New File',
      buttonLabel: 'Create',
    })
    if (result.canceled || !result.filePath) return null
    await fsPromises.mkdir(path.dirname(result.filePath), { recursive: true })
    await fsPromises.writeFile(result.filePath, '', 'utf-8')
    return result.filePath
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('external:open', async (_event, url: string) => {
  try {
    await shell.openExternal(url)
    return true
  } catch (err) {
    log.error('Failed to open external URL:', url, err)
    return false
  }
})

ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
  try {
    const wsRoot = workspaceEngine.getRoot()
    if (wsRoot) {
      if (!isPathInsideWorkspace(oldPath, wsRoot) || !isPathInsideWorkspace(newPath, wsRoot)) {
        return { error: 'Access denied: path is outside the workspace' }
      }
    }
    await fsPromises.rename(oldPath, newPath)
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('fs:delete', async (_event, targetPath: string) => {
  try {
    const wsRoot = workspaceEngine.getRoot()
    if (wsRoot && !isPathInsideWorkspace(targetPath, wsRoot)) {
      return { error: 'Access denied: path is outside the workspace' }
    }
    const stat = await fsPromises.stat(targetPath)
    if (stat.isDirectory()) {
      await fsPromises.rm(targetPath, { recursive: true, force: true })
    } else {
      await fsPromises.unlink(targetPath)
    }
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})


// ─── IPC: Terminal (node-pty + xterm.js) ────────────────────────────────────
ipcMain.handle('terminal:create', async (_event, cwd: string) => {
  return createTerminalSession(cwd, mainWindow)
})

ipcMain.handle('terminal:write', async (_event, sessionId: string, data: string) => {
  return writeToTerminal(sessionId, data)
})

ipcMain.handle('terminal:resize', async (_event, sessionId: string, cols: number, rows: number) => {
  return resizeTerminal(sessionId, cols, rows)
})

ipcMain.handle('terminal:killSession', async (_event, sessionId: string) => {
  return killTerminalSession(sessionId)
})

ipcMain.handle('terminal:runCommand', async (_event, sessionId: string, command: string) => {
  return runCommandInSession(sessionId, command, mainWindow)
})

ipcMain.handle('terminal:platform', async () => getPlatformInfo())

// ─── IPC: Workspace Engine ──────────────────────────────────────────────────
ipcMain.handle('workspace:mount', async (_event, rootPath: string | null) => {
  cancelAllActiveSearches()
  workspaceEngine.setRoot(rootPath)
  extensionService.setWorkspaceRoot(rootPath)
  if (rootPath) {
    allowPath(rootPath)
    memoryService.setStoragePath(userDataPath, rootPath)
    await memoryService.load(rootPath)
    await workspaceEngine.loadFileTree()
    setupWorkspaceWatcher(rootPath)
  } else {
    stopWorkspaceWatcher()
  }
  return workspaceEngine.getSnapshot()
})

ipcMain.handle('workspace:snapshot', async () => workspaceEngine.getSnapshot())

ipcMain.handle('workspace:listFiles', async () => workspaceEngine.listFiles())

ipcMain.handle('workspace:loadTree', async (_event, dirPath?: string) => {
  const tree = await workspaceEngine.loadFileTree(dirPath)
  return { tree, snapshot: await workspaceEngine.getSnapshot() }
})

ipcMain.handle('workspace:setCwd', async (_event, cwd: string | null) => {
  workspaceEngine.setCwd(cwd)
  return { cwd: workspaceEngine.getCwd() }
})

ipcMain.handle('workspace:syncOpenFiles', async (_event, files: string[]) => {
  workspaceEngine.syncOpenFiles(files)
  return { success: true }
})

// ─── IPC: Agent System ──────────────────────────────────────────────────────
ipcMain.handle('agent:run', async (event, payload: {
  task: string
  projectPath: string | null
  filePath?: string | null
  fileContent?: string | null
  provider?: string
  model?: string
}) => {
  const sender = event.sender
  return runAgentLoop({
    ...payload,
    userDataPath,
    onProgress: (progress) => {
      sender.send('agent:progress', progress)
    },
  })
})

ipcMain.handle('agent:memory', async (_event, projectPath: string | null) => {
  if (projectPath) {
    memoryService.setStoragePath(userDataPath, projectPath)
    return memoryService.load(projectPath)
  }
  return memoryService.getMemory()
})

ipcMain.handle('agent:tool', async (_event, payload: {
  tool: string
  args: Record<string, string>
  workspaceRoot: string
  cwd?: string
}) => {
  const ctx = {
    workspaceRoot: payload.workspaceRoot,
    cwd: payload.cwd ?? payload.workspaceRoot,
  }
  return executeTool(payload.tool as any, payload.args, ctx)
})

// ─── IPC: OpenCode ─────────────────────────────────────────────────────────
ipcMain.handle('opencode:detect', async () => {
  const { detectOpenCode } = await import('./opencodeService')
  return detectOpenCode()
})

ipcMain.handle('opencode:run', async (event, payload: { prompt: string; projectPath: string }) => {
  const { runOpenCode } = await import('./opencodeService')
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const sender = event.sender

  runOpenCode(
    sessionId,
    payload.prompt,
    payload.projectPath,
    (text) => sender.send('opencode:output', { sessionId, text }),
    (status) => sender.send('opencode:status', { sessionId, status }),
    (error) => {
      writeLogEntrySync(payload.projectPath, 'error', 'OpenCode', `Session ${sessionId} error: ${error}`)
      sender.send('opencode:error', { sessionId, error })
    },
    (exitCode) => sender.send('opencode:done', { sessionId, exitCode }),
  )

  return sessionId
})

ipcMain.handle('opencode:cancel', async (_event, sessionId: string) => {
  const { cancelRun } = await import('./opencodeService')
  return cancelRun(sessionId)
})

// ─── IPC: Diff / Apply / Rollback ──────────────────────────────────────────
ipcMain.handle('diff:compute', async (_event, payload: { filePath: string; newContent: string }) => {
  const { computeDiff } = await import('./diffService')
  return computeDiff(payload.filePath, payload.newContent)
})

ipcMain.handle('diff:apply', async (_event, payload: { filePath: string; newContent: string; sessionId: string; task: string }) => {
  const { applyChange } = await import('./diffService')
  return applyChange(payload.filePath, payload.newContent, payload.sessionId, payload.task)
})

ipcMain.handle('diff:getBackups', async (_event, projectPath: string) => {
  const { getBackups } = await import('./diffService')
  return getBackups(projectPath)
})

ipcMain.handle('diff:rollback', async (_event, backupPath: string) => {
  const { rollbackChange } = await import('./diffService')
  return rollbackChange(backupPath)
})

ipcMain.handle('diff:rollbackLast', async (_event, projectPath: string) => {
  const { rollbackLastChange } = await import('./diffService')
  return rollbackLastChange(projectPath)
})

ipcMain.handle('diff:deleteBackup', async (_event, backupPath: string) => {
  const { deleteBackup } = await import('./diffService')
  return deleteBackup(backupPath)
})

// ─── IPC: Database ──────────────────────────────────────────────────────────
ipcMain.handle('db:connect', async (_event, uri: string) => {
  return await dbService.connect(uri)
})

ipcMain.handle('db:disconnect', async () => {
  return await dbService.disconnect()
})

ipcMain.handle('db:listDatabases', async () => {
  return await dbService.listDatabases()
})

ipcMain.handle('db:listCollections', async (_event, dbName: string) => {
  return await dbService.listCollections(dbName)
})

// ─── IPC: Git ──────────────────────────────────────────────────────────────
// Cache: avoid re-running git for the same folder within 30s
const gitCache = new Map<string, { branch: string; statusSummary: string; ts: number }>()
const GIT_CACHE_TTL = 30_000
const GIT_CACHE_MAX = 100

function pruneGitCache() {
  if (gitCache.size <= GIT_CACHE_MAX) return
  const entries = [...gitCache.entries()].sort(([, a], [, b]) => a.ts - b.ts)
  const excess = gitCache.size - GIT_CACHE_MAX
  for (let i = 0; i < excess; i++) {
    gitCache.delete(entries[i][0])
  }
}

function invalidateGitCache(projectPath: string) {
  gitCache.delete(projectPath)
}

// Single combined handler: returns { branch, statusSummary } in one IPC call
ipcMain.handle('git:status', async (_event, projectPath: string) => {
  try {
    const cached = gitCache.get(projectPath)
    if (cached && Date.now() - cached.ts < GIT_CACHE_TTL) {
      return { branch: cached.branch, statusSummary: cached.statusSummary }
    }

    const git = simpleGit(projectPath)
    const [status, branchResult] = await Promise.all([
      git.status(),
      git.branch(),
    ])

    const changes = [
      status.modified.length,
      status.created.length,
      status.deleted.length,
      status.not_added.length,
      status.renamed.length,
    ].reduce((sum, v) => sum + v, 0)

    const result = {
      branch: branchResult.current,
      statusSummary: changes > 0 ? `${changes} changed files` : 'Working tree clean',
    }

    gitCache.set(projectPath, { ...result, ts: Date.now() })
    pruneGitCache()
    return result
  } catch (err) {
    return { error: (err as Error).message }
  }
})

// Old git:branch handler kept for backwards compat but just delegates
ipcMain.handle('git:branch', async (_event, projectPath: string) => {
  try {
    const result = await new Promise<any>((resolve) => {
      // Re-use the cache+logic from the combined handler
      const git = simpleGit(projectPath)
      git.branch().then((b) => resolve({ branch: b.current })).catch((err) => resolve({ error: err.message }))
    })
    return result
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('git:commit', async (_event, projectPath: string, message: string) => {
  try {
    const git = simpleGit(projectPath)
    await git.add('.')
    await git.commit(message)
    invalidateGitCache(projectPath)
    return { success: true }
  } catch (err) {
    writeLogEntrySync(projectPath, 'error', 'Git:commit', (err as Error).message)
    return { error: (err as Error).message }
  }
})

ipcMain.handle('git:pull', async (_event, projectPath: string) => {
  try {
    const git = simpleGit(projectPath)
    const result = await git.pull()
    invalidateGitCache(projectPath)
    return { result }
  } catch (err) {
    writeLogEntrySync(projectPath, 'error', 'Git:pull', (err as Error).message)
    return { error: (err as Error).message }
  }
})

ipcMain.handle('git:push', async (_event, projectPath: string) => {
  try {
    const git = simpleGit(projectPath)
    const result = await git.push()
    invalidateGitCache(projectPath)
    return { result }
  } catch (err) {
    writeLogEntrySync(projectPath, 'error', 'Git:push', (err as Error).message)
    return { error: (err as Error).message }
  }
})

// ── git:changedFiles — full file-level status ────────────────────────────────
ipcMain.handle('git:changedFiles', async (_event, projectPath: string) => {
  try {
    const git = simpleGit(projectPath)
    const status = await git.status()
    const staged = status.staged.map((f: any) => ({
      path: f,
      status: status.files.find((sf: any) => sf.path === f)?.index ?? 'M',
    }))
    const unstaged = status.files
      .filter((f: any) => f.working_dir !== ' ' && f.working_dir !== '?' && !status.staged.includes(f.path))
      .map((f: any) => ({ path: f.path, status: f.working_dir }))
    const untracked = status.not_added
    invalidateGitCache(projectPath)
    return { staged, unstaged, untracked }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

// ── git:stageFile / git:unstageFile / git:stageAll ───────────────────────────
ipcMain.handle('git:stageFile', async (_event, projectPath: string, filePath: string) => {
  try {
    const git = simpleGit(projectPath)
    await git.add(filePath)
    invalidateGitCache(projectPath)
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('git:unstageFile', async (_event, projectPath: string, filePath: string) => {
  try {
    const git = simpleGit(projectPath)
    await git.reset(['HEAD', '--', filePath])
    invalidateGitCache(projectPath)
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('git:stageAll', async (_event, projectPath: string) => {
  try {
    const git = simpleGit(projectPath)
    await git.add('.')
    invalidateGitCache(projectPath)
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

// ── git:commitStaged — commit only staged files ─────────────────────────────
ipcMain.handle('git:commitStaged', async (_event, projectPath: string, message: string) => {
  try {
    const git = simpleGit(projectPath)
    const result = await git.commit(message)
    invalidateGitCache(projectPath)
    return { success: true, hash: result.commit }
  } catch (err) {
    writeLogEntrySync(projectPath, 'error', 'Git:commitStaged', (err as Error).message)
    return { error: (err as Error).message }
  }
})

// ── git:commitAll — stage everything then commit ────────────────────────────
ipcMain.handle('git:commitAll', async (_event, projectPath: string, message: string) => {
  try {
    const git = simpleGit(projectPath)
    await git.add('.')
    const result = await git.commit(message)
    invalidateGitCache(projectPath)
    return { success: true, hash: result.commit }
  } catch (err) {
    writeLogEntrySync(projectPath, 'error', 'Git:commitAll', (err as Error).message)
    return { error: (err as Error).message }
  }
})

// ── git:fileDiff — unified diff for one file ────────────────────────────────
ipcMain.handle('git:fileDiff', async (_event, projectPath: string, filePath: string, staged: boolean) => {
  try {
    const git = simpleGit(projectPath)
    let diff: string
    if (staged) {
      // Diff staged changes vs HEAD
      diff = await git.diff(['--cached', '--', filePath])
    } else {
      // Diff working tree vs index
      diff = await git.diff(['--', filePath])
    }
    return { diff }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

// ── git:fileContent — get HEAD or staged version of a file ──────────────────
ipcMain.handle('git:fileContent', async (_event, projectPath: string, filePath: string, ref: string) => {
  try {
    const git = simpleGit(projectPath)
    // ref can be 'HEAD', ':0' (staged), or a commit hash
    const content = await git.show([`${ref}:${filePath}`])
    return { content }
  } catch (err) {
    // File might be untracked — return empty
    return { content: '' }
  }
})

// ── git:log — commit history ────────────────────────────────────────────────
ipcMain.handle('git:log', async (_event, projectPath: string, limit: number = 50) => {
  try {
    const git = simpleGit(projectPath)
    const log = await git.log({ maxCount: limit })
    const commits = log.all.map((c: any) => ({
      hash: c.hash,
      shortHash: c.hash.slice(0, 7),
      message: c.message,
      author: c.author_name,
      email: c.author_email,
      date: c.date,
    }))
    return { commits }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

// ── git:listBranches — local + remote ────────────────────────────────────────
ipcMain.handle('git:listBranches', async (_event, projectPath: string) => {
  try {
    const git = simpleGit(projectPath)
    const result = await git.branch(['-a'])
    const branches = result.all
      .map((b: string) => b.trim().replace(/^\* /, ''))
      .filter((b: string) => !b.startsWith('remotes/HEAD'))
    return { branches, current: result.current }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

// ── git:checkoutBranch ────────────────────────────────────────────────────────
ipcMain.handle('git:checkoutBranch', async (_event, projectPath: string, branch: string) => {
  try {
    const git = simpleGit(projectPath)
    // If it's a remote branch, checkout with tracking
    if (branch.startsWith('remotes/')) {
      const localName = branch.replace(/^remotes\/[^/]+\//, '')
      await git.checkout(['-b', localName, '--track', branch])
    } else {
      await git.checkout(branch)
    }
    invalidateGitCache(projectPath)
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

// ── git:createBranch ─────────────────────────────────────────────────────────
ipcMain.handle('git:createBranch', async (_event, projectPath: string, name: string, checkout: boolean) => {
  try {
    const git = simpleGit(projectPath)
    if (checkout) {
      await git.checkoutBranch(name, 'HEAD')
    } else {
      await git.branch([name])
    }
    invalidateGitCache(projectPath)
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

// ── git:deleteBranch ─────────────────────────────────────────────────────────
ipcMain.handle('git:deleteBranch', async (_event, projectPath: string, name: string, force: boolean) => {
  try {
    const git = simpleGit(projectPath)
    await git.branch([force ? '-D' : '-d', name])
    invalidateGitCache(projectPath)
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

// ── git:discardFile — restore to HEAD (tracked) or delete (untracked) ────────
ipcMain.handle('git:discardFile', async (_event, projectPath: string, filePath: string, untracked: boolean) => {
  try {
    const git = simpleGit(projectPath)
    if (untracked) {
      // Remove untracked file/folder safely if it exists
      const fullPath = path.join(projectPath, filePath)
      try {
        const stat = await fsPromises.stat(fullPath)
        if (stat.isDirectory()) {
          await fsPromises.rm(fullPath, { recursive: true, force: true })
        } else {
          await fsPromises.unlink(fullPath)
        }
      } catch (err: any) {
        if (err.code !== 'ENOENT') throw err
      }
    } else {
      // Restore tracked file to HEAD
      await git.checkout(['HEAD', '--', filePath])
    }
    invalidateGitCache(projectPath)
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

// ── git:commitFiles — list files changed in a commit ────────────────────────
ipcMain.handle('git:commitFiles', async (_event, projectPath: string, commitHash: string) => {
  try {
    const git = simpleGit(projectPath)
    const output = await git.show(['--name-status', '--pretty=format:', commitHash])
    const files = output.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const parts = line.split(/\s+/)
        const rawStatus = parts[0] || 'M'
        const status = rawStatus[0] // Get first character, e.g. 'R' from 'R100'
        const filePath = parts[status === 'R' ? 2 : 1] || parts[1] || ''
        return { path: filePath, status }
      })
    return { files }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

// ── git:restoreFile — restore a file to its state at a commit ───────────────
ipcMain.handle('git:restoreFile', async (_event, projectPath: string, commitHash: string, filePath: string) => {
  try {
    const git = simpleGit(projectPath)
    await git.checkout([commitHash, '--', filePath])
    invalidateGitCache(projectPath)
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

// ── git:checkoutCommit — checkout a commit (detached HEAD) ──────────────────
ipcMain.handle('git:checkoutCommit', async (_event, projectPath: string, commitHash: string) => {
  try {
    const git = simpleGit(projectPath)
    await git.checkout(commitHash)
    invalidateGitCache(projectPath)
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('git:getConfig', async (_event, projectPath?: string) => {
  try {
    const gitPath = projectPath || app.getPath('userData')
    const git = simpleGit(gitPath)
    
    let isRepo = false
    try {
      isRepo = await git.checkIsRepo()
    } catch {
      // not a repo
    }

    let name = ''
    let email = ''

    if (isRepo) {
      try {
        const localName = await git.getConfig('user.name', 'local')
        name = localName.value || ''
        const localEmail = await git.getConfig('user.email', 'local')
        email = localEmail.value || ''
      } catch {
        // ignore
      }
    }

    if (!name) {
      try {
        const globalName = await git.getConfig('user.name', 'global')
        name = globalName.value || ''
      } catch {
        // ignore
      }
    }

    if (!email) {
      try {
        const globalEmail = await git.getConfig('user.email', 'global')
        email = globalEmail.value || ''
      } catch {
        // ignore
      }
    }

    if (!name) {
      try {
        const sysName = await git.getConfig('user.name')
        name = sysName.value || ''
      } catch {}
    }
    if (!email) {
      try {
        const sysEmail = await git.getConfig('user.email')
        email = sysEmail.value || ''
      } catch {}
    }

    return { name, email }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('git:setConfig', async (_event, projectPath: string | undefined, name: string, email: string) => {
  try {
    const gitPath = projectPath || app.getPath('userData')
    const git = simpleGit(gitPath)

    let isRepo = false
    try {
      isRepo = await git.checkIsRepo()
    } catch {
      // ignore
    }

    if (isRepo) {
      await git.addConfig('user.name', name, false, 'local')
      await git.addConfig('user.email', email, false, 'local')
    } else {
      await git.addConfig('user.name', name, false, 'global')
      await git.addConfig('user.email', email, false, 'global')
    }
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})


// ─── IPC: Search (streaming via searchEngine) ─────────────────────────────
const activeSearches = new Map<string, AbortController>()

function cancelAllActiveSearches() {
  for (const [id, ac] of activeSearches) {
    ac.abort()
  }
  activeSearches.clear()
}

ipcMain.handle('search:find', async (event, projectPath: string, query: string, isRegex: boolean) => {
  const searchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const ac = new AbortController()
  activeSearches.set(searchId, ac)

  // Fire-and-forget: stream results via IPC events
  ;(async () => {
    try {
      let batch: Array<{ file: string; line: number; text: string }> = []
      const BATCH_SIZE = 50

      const results = await searchFiles({
        projectPath,
        query,
        isRegex,
        signal: ac.signal,
        onResult: (result) => {
          batch.push(result)
          if (batch.length >= BATCH_SIZE) {
            event.sender.send('search:result', searchId, batch)
            batch = []
          }
        },
      })

      // Flush remaining
      if (batch.length > 0) {
        event.sender.send('search:result', searchId, batch)
      }

      event.sender.send('search:done', searchId, results.length)
    } catch (err) {
      if (!ac.signal.aborted) {
        event.sender.send('search:error', searchId, (err as Error).message)
      }
    } finally {
      activeSearches.delete(searchId)
    }
  })()

  return { searchId }
})

ipcMain.on('search:cancel', (_event, searchId: string) => {
  const ac = activeSearches.get(searchId)
  if (ac) {
    ac.abort()
    activeSearches.delete(searchId)
  }
})

// ─── IPC: Workspace / Extension / AI / Premium Services ─────────────────────
ipcMain.handle('workspace:setRoot', async (_event, rootPath: string | null) => {
  cancelAllActiveSearches()
  fileCache.clear()
  workspaceEngine.setRoot(rootPath)
  extensionService.setWorkspaceRoot(rootPath)
  if (rootPath) {
    memoryService.setStoragePath(userDataPath, rootPath)
    await memoryService.load(rootPath)
    await workspaceEngine.loadFileTree()
  }
  return { success: true }
})

ipcMain.handle('workspace:getRoot', async () => {
  return { root: extensionService.getWorkspaceRoot?.() ?? null }
})

ipcMain.handle('extension:listInstalled', async () => {
  return extensionService.listInstalledExtensions()
})

ipcMain.handle('extension:listMarketplace', async (_event, query?: string) => {
  return extensionService.listMarketplaceExtensions(query)
})

ipcMain.handle('extension:installLocal', async () => {
  return extensionService.openExtensionFolderFromDialog()
})

ipcMain.handle('extension:installMarketplace', async (_event, extensionId: string) => {
  return extensionService.installMarketplaceExtension(extensionId)
})

ipcMain.handle('extension:enable', async (_event, extensionId: string) => {
  return extensionService.enableExtension(extensionId)
})

ipcMain.handle('extension:disable', async (_event, extensionId: string) => {
  return extensionService.disableExtension(extensionId)
})

ipcMain.handle('extension:uninstall', async (_event, extensionId: string) => {
  return extensionService.uninstallExtension(extensionId)
})

ipcMain.handle('extension:listCommands', async () => {
  return extensionService.listCommands()
})

ipcMain.handle('extension:runCommand', async (_event, commandId: string, ...args: any[]) => {
  return extensionService.runCommand(commandId, ...args)
})

ipcMain.handle('project:listTemplates', async () => {
  return listProjectTemplates()
})

ipcMain.handle('project:findTemplate', async (_event, prompt: string) => {
  return findTemplateByPrompt(prompt)
})

ipcMain.handle('project:create', async (_event, projectRoot: string, templateId: string, projectName: string) => {
  const result = await createProject(projectRoot, templateId, projectName)
  extensionService.setWorkspaceRoot(result.path)
  return result
})

ipcMain.handle('project:installDependencies', async (_event, projectPath: string) => {
  return installDependencies(projectPath)
})

ipcMain.handle('project:analyzeWorkspace', async (_event, projectPath: string | null) => {
  return analyzeWorkspace(projectPath)
})

ipcMain.handle('project:createDeployConfig', async (_event, projectPath: string, provider: string) => {
  return createDeployConfig(projectPath, provider)
})

ipcMain.handle('license:activate', async (_event, licenseKey: string) => {
  return activateLicense(licenseKey)
})

ipcMain.handle('license:status', async () => {
  return getLicenseStatus()
})

ipcMain.handle('license:refresh', async () => {
  return refreshLicenseStatus()
})

ipcMain.handle('license:deactivate', async () => {
  return deactivateLicense()
})

ipcMain.handle('license:canUseAI', async () => {
  return canUseAI()
})

ipcMain.handle('license:canCreateTemplate', async (_event, templateId: string) => {
  return canCreateTemplate(templateId)
})

ipcMain.handle('license:canInstallExtension', async (_event, manifest: any) => {
  return canInstallExtension(manifest)
})

ipcMain.handle('license:recordAIRequest', async () => {
  return recordAIRequest()
})

ipcMain.handle('license:recordTemplateUsage', async () => {
  return recordTemplateUsage()
})

ipcMain.handle('license:recordExtensionInstall', async () => {
  return recordExtensionInstall()
})

ipcMain.handle('premium:addPromptEntry', async (_event, projectPath: string, prompt: string, response: string) => {
  return promptHistoryService.addEntry(projectPath, prompt, response)
})

ipcMain.handle('premium:getPromptHistory', async (_event, projectPath: string) => {
  return promptHistoryService.getHistory(projectPath)
})

ipcMain.handle('premium:saveSnippet', async (_event, projectPath: string, title: string, content: string) => {
  return snippetVaultService.addSnippet(projectPath, title, content)
})

ipcMain.handle('premium:listSnippets', async (_event, projectPath: string) => {
  return snippetVaultService.listSnippets(projectPath)
})

ipcMain.handle('premium:removeSnippet', async (_event, projectPath: string, snippetId: string) => {
  return snippetVaultService.removeSnippet(projectPath, snippetId)
})

ipcMain.handle('ai:chat', async (_event, payload: any) => {
  try {
    const { prompt, provider, projectPath, filePath, fileContent, model, temperature, maxTokens, topP } = payload

    if (provider === 'free-agent') {
      if (!projectPath) {
        return { success: false, response: 'Agent mode requires an open workspace.' }
      }

      const executor = new AgentExecutor({ projectRoot: projectPath, confirmChanges: true, safeMode: true })
      const fileContext: string[] = []
      if (filePath) fileContext.push(`Path: ${filePath}`)
      if (typeof fileContent === 'string' && fileContent.length > 0) {
        fileContext.push(`Content:
${fileContent.slice(0, 5000)}`)
      }

      const report = await executor.executeMultiAgent(prompt || '', {
        fileContext,
        projectStructure: [],
      })

      const planText = [
        `Goal: ${report.plan.goal}`,
        `Steps:\n${report.plan.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
        `Files to create: ${report.plan.filesToCreate.join(', ') || 'none'}`,
        `Files to modify: ${report.plan.filesToModify.join(', ') || 'none'}`,
        `Summary: ${report.summary}`,
      ].join('\n\n')

      const response = `${report.escalated ? 'Local agent orchestration completed with issues.' : 'Local agent orchestration completed successfully.'}\n\n${planText}`

      if (projectPath) {
        await promptHistoryService.addEntry(projectPath, prompt || '', response)
      }

      return { success: !report.escalated, response }
    }

    const result = await askAI(prompt, { model, temperature, maxTokens, topP })
    if (result.success && projectPath) {
      await promptHistoryService.addEntry(projectPath, prompt, result.response)
    }
    return result
  } catch (err) {
    return { error: (err as Error).message }
  }
})

// ─── AI Streaming IPC ────────────────────────────────────────────────────────
// Session-managed: each stream gets a unique streamId.
// Chunks are relayed to renderer via webContents.send.
// Streams can be cancelled via ai:stream:stop and are auto-cancelled on quit.
ipcMain.handle('ai:stream:start', async (event, payload: any) => {
  const {
    prompt, model, projectPath,
    streamId, systemPrompt, temperature, maxTokens, topP
  } = payload

  if (!streamId) return { error: 'streamId is required' }

  const safeSend = (channel: string, data: any) => {
    try {
      if (!event.sender.isDestroyed()) event.sender.send(channel, data)
    } catch { /* window may close mid-stream */ }
  }

  // Do NOT await — return immediately so IPC doesn't block.
  // The stream pushes events back via safeSend.
  askAIStream(
    prompt,
    { model, systemPrompt, temperature, maxTokens, topP },
    {
      onChunk:  (text: string)     => safeSend('ai:stream:chunk', { streamId, text }),
      onDone:   async (fullText: string, metrics: any) => {
        safeSend('ai:stream:end', { streamId, fullText, metrics })
        if (projectPath && fullText) {
          try { await promptHistoryService.addEntry(projectPath, prompt, fullText) } catch { /* non-critical */ }
        }
      },
      onError:  (error: string)    => safeSend('ai:stream:error', { streamId, error }),
    },
    streamId
  ).catch((err) => safeSend('ai:stream:error', { streamId, error: (err as Error).message }))

  return { started: true, streamId }
})

ipcMain.handle('ai:stream:stop', (_event, streamId: string) => {
  const cancelled = abortStream(streamId)
  return { cancelled, streamId }
})

ipcMain.handle('ai:listModels', async (_event, forceRefresh?: boolean) => {
  try {
    const models = await fetchOpenRouterModels(forceRefresh)
    return { models }
  } catch (err) {
    return { error: (err as Error).message, models: [] }
  }
})

ipcMain.handle('ai:getBudget', async () => {
  try {
    return await getBudgetStatus()
  } catch (err) {
    return { error: (err as Error).message, dailySpend: 0, limit: 5 }
  }
})

ipcMain.handle('ai:isKeyConfigured', () => {
  return { configured: getOpenRouterKey().length > 0, fromEnv: Boolean(process.env.OPENROUTER_API_KEY?.trim()) }
})

// ─── IPC: Project Actions ───────────────────────────────────────────────────
ipcMain.handle('project:new', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Create New Project Folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths.length) return { canceled: true }
    const rootPath = result.filePaths[0]
    allowPath(rootPath)
    extensionService.setWorkspaceRoot(rootPath)
    return { path: rootPath }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('project:clone', async (_event, repoUrl: string) => {
  try {
    const target = await dialog.showOpenDialog({
      title: 'Select clone destination',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (target.canceled || !target.filePaths.length) return { canceled: true }
    const dest = target.filePaths[0]
    allowPath(dest)
    const git = simpleGit()
    await git.clone(repoUrl, dest)
    extensionService.setWorkspaceRoot(dest)
    return { success: true, path: dest }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

// ─── IPC: Settings / Profile ─────────────────────────────────────────────────

ipcMain.handle('session:getUser', async () => {
  try {
    const raw = await loadAuthSession()
    if (!raw) return { user: null }
    const tokens = JSON.parse(raw)
    return { tokens }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('session:logout', async () => {
  try {
    await clearAuthSession()
    return { success: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
})

ipcMain.handle('test:isTestSuiteActive', () => {
  if (process.env.NEXUS_TEST_SUITE) {
    return true
  }
  return false
})

// ─── App Lifecycle ──────────────────────────────────────────────────────────
autoUpdater.on('checking-for-update', () => log.info('AutoUpdater: checking for update'));
autoUpdater.on('update-available', (info) => {
  log.info('AutoUpdater: update available', info)
  mainWindow?.webContents.send('updater:updateAvailable', info)
});
autoUpdater.on('update-not-available', (info) => {
  log.info('AutoUpdater: update not available', info)
  mainWindow?.webContents.send('updater:updateNotAvailable', info)
});
autoUpdater.on('error', (err) => {
  log.error('AutoUpdater error', err)
  mainWindow?.webContents.send('updater:error', err)
});
autoUpdater.on('download-progress', (progress) => log.info('AutoUpdater download progress', progress));
autoUpdater.on('update-downloaded', (info) => {
  log.info('AutoUpdater: update downloaded', info)
  mainWindow?.webContents.send('updater:updateDownloaded', info)
  autoUpdater.quitAndInstall()
});

(app as any).on('before-quit-for-update', () => {
  log.info('AutoUpdater: quitting to install update')
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

const loadSavedUpdateChannel = async (): Promise<'beta' | 'stable'> => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'nexus-settings.json')
    const raw = await fsPromises.readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(raw) as Record<string, unknown>
    if (settings.updateChannel === 'stable') return 'stable'
  } catch {
    // fall back to default beta channel
  }
  return 'beta'
}

app.whenReady().then(async () => {
  try {
    createSplashWindow()
    log.info('[Electron] Starting app initialization...')
    
    log.info('[Electron] Initializing extension service...')
    await extensionService.initialize()
    
    log.info('[Electron] Warming up terminal...')
    await warmUpTerminal()
    
    log.info('[Electron] Loading saved update channel...')
    const channel = await loadSavedUpdateChannel()
    
    log.info('[Electron] Applying update channel to AutoUpdater...')
    applyUpdateChannelToAutoUpdater(channel)
    
    log.info('[Electron] Starting memory manager...')
    memoryManager.startMonitoring(30_000)

    log.info('[Electron] Creating main window...')
    await createWindow()
    
    log.info('[Electron] App initialization complete!')
  } catch (err) {
    log.error('APP INITIALIZATION ERROR:', err)
    console.error('APP INITIALIZATION ERROR:', err)
    app.quit()
  }
}).catch((err) => {
  log.error('APP WHENREADY PROMISE ERROR:', err)
  console.error('APP WHENREADY PROMISE ERROR:', err)
  app.quit()
})
