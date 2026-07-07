import { motion } from 'framer-motion'
import { Suspense, useEffect, useState, lazy, useRef, useCallback, memo } from 'react'
import type { CSSProperties } from 'react'
import TitleBar from '../titlebar/TitleBar'
import ActivityBar from './ActivityBar'
import Sidebar from './Sidebar'
import EditorArea from './EditorArea'
const AIPanel = lazy(() => import('../ai/NexusAssistant'))
const TerminalPanel = lazy(() => import('./TerminalPanel'))
import StatusBar from './StatusBar'
import CommandPalette from './CommandPalette'
import NotificationCenter from '../ui/NotificationCenter'
import ModalDialog from '../ui/ModalDialog'
import LicensePanel from '../ui/LicensePanel'
import ComponentErrorBoundary from '../ui/ComponentErrorBoundary'
import { useAppStore } from '../../store/appStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { loadGitStatus } from '../../lib/gitUtils'
import { getFileContent, clearFileCache } from '../../lib/fileCache'
import { getLatestSnapshot, clearLatestSnapshot } from '../../lib/sessionSnapshots'
import { invalidateDirCache, saveAllDirtyFiles, closeAllTabs, updateFileContentDebounced } from '../../lib/fileSystem'
import OnboardingScreen from './OnboardingScreen'
import ShortcutsHelpModal from '../ui/ShortcutsHelpModal'
import { addRecentProject } from '../../lib/recentProjects'
import CrashRecoveryModal from '../crash/CrashRecoveryModal'

// Memoized wrappers — children read state via Zustand, not props,
// so they never need to re-render from parent cascades.
const MemoTitleBar = memo(TitleBar)
const MemoActivityBar = memo(ActivityBar)
const MemoStatusBar = memo(StatusBar)
const MemoCommandPalette = memo(CommandPalette)
const MemoNotificationCenter = memo(NotificationCenter)
const MemoModalDialog = memo(ModalDialog)
const MemoLicensePanel = memo(LicensePanel)
const MemoSidebar = memo(Sidebar)
const MemoTerminalPanel = memo(TerminalPanel)
// ✨ Performance optimization: Use sliced selectors instead of destructuring entire store
import {
  useAppStoreLayout,
  useAppStoreActions,
} from '../../hooks/useAppStoreSelectors'

const SIDEBAR_W  = 240
const AIPANEL_W  = 320

const panelTransition = {
  duration: 0.22,
  ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
}

export default function AppShell() {
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false)
  const [isSafeMode, setIsSafeMode] = useState(false)
  const [savedRootPath, setSavedRootPath] = useState<string | null>(null)
  const [restoreExtensions, setRestoreExtensions] = useState(true)
  const [restoreAISession, setRestoreAISession] = useState(true)
  const [restoreTerminalSessions, setRestoreTerminalSessions] = useState(true)
  const [restoreProjectState, setRestoreProjectState] = useState(true)
  const [loadedSettings, setLoadedSettings] = useState<Record<string, unknown> | null>(null)
  const [crashMetadata, setCrashMetadata] = useState<{ source: string; reason: string; details?: string; timestamp: string } | null>(null)
  const [lastCrash, setLastCrash] = useState<any | null>(null)
  const [showCrashModal, setShowCrashModal] = useState(false)
  const firstRunComplete = useAppStore((s) => s.firstRunComplete)
  
  // Only subscribe to layout state — AppShell must not re-render on file/explorer/git/search changes
  const layout = useAppStoreLayout()
  const actions = useAppStoreActions()

  const getPathSeparator = (value: string) => (value.includes('\\') ? '\\' : '/')

  const clearExplorerState = () => {
    useAppStore.getState().setExpandedFolders({})
    useWorkspaceStore.getState().reset()
  }

  const loadDirectory = useCallback(async (folderPath: string, recordCrashMetadata = false) => {
    if (isSafeMode) {
      console.warn('[AppShell] Safe Mode active: blocking workspace load for', folderPath)
      return false
    }

    console.log('[Workspace] Folder selected:', folderPath)

    // ── Step 1: Immediately clear old state in both renderer AND main process ──
    // This must happen synchronously before any await so no IPC call can slip
    // through with the stale workspace root still set on the main process.
    actions.setRootPath(null)
    clearExplorerState()
    invalidateDirCache()
    closeAllTabs()
    clearFileCache()
    
    useWorkspaceStore.getState().setError(null)
    useWorkspaceStore.getState().setLoading(true)

    let timeoutId: any
    let attempts = 0
    const maxAttempts = 3
    let success = false
    let lastError: any = null

    while (attempts < maxAttempts && !success) {
      attempts++
      try {
        const api = window.electronAPI
        const workspace = api?.workspace || {
          mount: async () => ({ error: 'Workspace API not available' }),
          snapshot: async () => null,
          listFiles: async () => [],
          loadTree: async () => [],
          setCwd: async () => {},
          syncOpenFiles: async () => {},
          setRoot: async () => {},
          getRoot: async () => null,
          validate: async () => ({ isValid: false, error: 'Workspace API not available' }),
          notifyExplorerRendered: () => {},
        }

        console.log(`[Workspace] setRoot(null) - attempt ${attempts}`)
        await workspace.setRoot(null).catch(() => {})

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('Workspace loading timed out after 10 seconds'))
          }, 10000)
        })

        const loadPromise = (async () => {
          console.log('[Workspace] Validating folder...')
          const validation = await workspace.validate(folderPath)
          if (!validation || !validation.isValid) {
            throw new Error(validation?.error || 'Folder validation failed')
          }

          console.log('[Workspace] setRoot()')
          if (api?.app?.allowPath) {
            api.app.allowPath(folderPath)
          }
          await workspace.setRoot(folderPath)

          console.log('[Workspace] Reading directory')
          if (!api?.fs) {
            throw new Error('window.electronAPI.fs is not defined')
          }
          const response = await api.fs.readDir(folderPath)
          if (!response || (response as any).error) {
            throw new Error((response as any)?.error || 'Failed to read directory')
          }

          const separator = getPathSeparator(folderPath)
          const entries = (response as any[]).map((entry) => ({
            name: entry.name,
            path: `${folderPath}${folderPath.endsWith(separator) ? '' : separator}${entry.name}`,
            isDirectory: entry.isDirectory,
            isFile: entry.isFile,
          }))

          actions.setRootPath(folderPath)
          actions.setCurrentFolder(folderPath)
          actions.setExplorerEntries(entries)
          actions.setSelectedFilePath(null)
          actions.setSidebarOpen(true)
          actions.setSidebarTab('explorer')

          const snapshot = await workspace.mount(folderPath)
          if (!snapshot || (snapshot as any).error) {
            throw new Error((snapshot as any)?.error || 'Failed to mount workspace')
          }

          useWorkspaceStore.getState().setSnapshot(snapshot as any)
          addRecentProject(folderPath)
          await loadGitStatus(folderPath).catch(() => {})
          return true
        })()

        const result = await Promise.race([loadPromise, timeoutPromise])
        success = true
        return result
      } catch (err: any) {
        lastError = err
        console.warn(`[Workspace] Load attempt ${attempts} failed:`, err)
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
      }
    }

    if (!success) {
      console.error('[loadDirectory] All workspace load attempts failed:', lastError)
      const errorMsg = lastError?.message || 'Workspace failed to load.'
      useWorkspaceStore.getState().setError(errorMsg, folderPath)
      if (window.electronAPI?.workspace) {
        await window.electronAPI.workspace.setRoot(null).catch(() => {})
      }
      useWorkspaceStore.getState().setLoading(false)
      return false
    }
    useWorkspaceStore.getState().setLoading(false)
  // actions is a stable Zustand slice — safe in deps
  }, [actions]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a ref to the latest loadDirectory so stale-closure event handlers
  // (registered with [] deps) always call the current version.
  const loadDirectoryRef = useRef(loadDirectory)
  useEffect(() => { loadDirectoryRef.current = loadDirectory }, [loadDirectory])

  useEffect(() => {
    // Respond to main process requests for latest in-memory AI snapshot
    const handler = async (requestId: string) => {
      try {
        const snap = getLatestSnapshot()
        // Send back via the dynamic response channel
        ;(window as any).electronAPI.send(`ai:latestSnapshotResponse:${requestId}`, snap)
      } catch (err) {
        ;(window as any).electronAPI.send(`ai:latestSnapshotResponse:${requestId}`, null)
      }
    }
    const unsub = window.electronAPI?.on('ai:requestLatestSnapshot', handler)
    return () => {
      if (unsub) unsub()
    }
  }, [])

  useEffect(() => {
    // Expose a convenient method on the renderer-side bridge so other UI
    // components can retrieve the live in-memory snapshot synchronously.
    try {
      if ((window as any).electronAPI && (window as any).electronAPI.ai) {
        ;(window as any).electronAPI.ai.getLiveSnapshot = async () => {
          try {
            return getLatestSnapshot()
          } catch {
            return null
          }
        }
      }
    } catch {}
  }, [])

  useEffect(() => {
    const onCollect = () => {
      try {
        useAppStore.getState().addNotification('Collecting live AI snapshot...', 'info')
      } catch {}
    }
    const unsub = window.electronAPI?.on('app:collectingLiveSnapshot', onCollect)
    return () => { if (unsub) unsub() }
  }, [])

  // Always expose the latest version so external callers (TitleBar, test runner)
  // get the current closure — not the one from the first render.
  useEffect(() => {
    ;(window as any).loadDirectory = loadDirectory
    return () => {
      delete (window as any).loadDirectory
    }
  }, [loadDirectory])

  useEffect(() => {
    const runTestSuite = async () => {
      try {
        const isActive = await window.electronAPI?.invoke('test:isTestSuiteActive')
        if (isActive) {
          console.log('[TEST] Runtime Test Suite Active! Exposing stores and loading runner...')
          ;(window as any).appStore = useAppStore
          ;(window as any).workspaceStore = useWorkspaceStore
          ;(window as any).updateFileContentDebounced = updateFileContentDebounced
          
          const runtimeRunnerPath = (window as any).electronAPI?.paths?.runtimeRunner?.()
          if (runtimeRunnerPath) {
            const fileResult = await (window as any).electronAPI?.fs?.readFile(runtimeRunnerPath)
            if (fileResult && fileResult.success && fileResult.content) {
              const script = document.createElement('script')
              script.textContent = fileResult.content
              script.type = 'module'
              document.body.appendChild(script)
            } else {
              console.error('[TEST] Failed to read test runner script:', fileResult)
            }
          } else {
            console.error('[TEST] Runtime runner path was not exposed by the preload bridge.')
          }
        }
      } catch (err) {
        console.error('[TEST] Failed to initiate test suite:', err)
      }
    }
    runTestSuite()
  }, [])

  useEffect(() => {
    const loadSavedSettings = async () => {
      useAppStore.getState().recordTelemetryEvent('appLaunches')
      try {
        const safeMode = await window.electronAPI?.app?.isSafeMode?.()
        setIsSafeMode(Boolean(safeMode))
        const crashInfo = await window.electronAPI?.app.getCrashMetadata()
        if (crashInfo?.crashMetadata) {
          setCrashMetadata(crashInfo.crashMetadata)
        }
        const response = await window.electronAPI?.settings.load()
        const settings = (response as any)?.settings ?? null
        setLoadedSettings(settings)
        
        const store = useAppStore.getState()
        if (settings?.editorTheme) store.setEditorTheme(settings.editorTheme)
        if (settings?.editorFontSize) store.setEditorFontSize(Number(settings.editorFontSize))
        if (settings?.editorTabSize) store.setEditorTabSize(Number(settings.editorTabSize))
        if (settings?.editorWordWrap) store.setEditorWordWrap(settings.editorWordWrap)
        if (settings?.editorMinimap) store.setEditorMinimap(settings.editorMinimap)
        if (settings?.openCodePathOverride !== undefined) store.setOpenCodePathOverride(settings.openCodePathOverride)
        if (settings?.openrouterKeyConfigured) {
          store.setOpenrouterKeyConfigured(true)
        }
        if (settings?.openrouterModel) store.setOpenrouterModel(settings.openrouterModel)
        if (settings?.gitUsername !== undefined) store.setGitUsername(settings.gitUsername)
        if (settings?.gitEmail !== undefined) store.setGitEmail(settings.gitEmail)
        if (settings?.workspaceRestore !== undefined) store.setWorkspaceRestore(Boolean(settings.workspaceRestore))
        if (settings?.telemetryEnabled !== undefined) store.setTelemetryEnabled(Boolean(settings.telemetryEnabled))
        if (settings?.rootPath && typeof settings.rootPath === 'string') {
          setSavedRootPath(settings.rootPath)
        }

        // Load user-customizable AI health settings if present
        try {
          if (settings?.ai && settings.ai.health) {
            useAppStore.getState().setAiHealthSettings(settings.ai.health)
          }
        } catch {}

        setRestoreExtensions(settings?.restoreExtensions !== false)
        setRestoreAISession(settings?.restoreAISession !== false)
        setRestoreTerminalSessions(settings?.restoreTerminalSessions !== false)
        setRestoreProjectState(settings?.restoreProjectState !== false)

        if (settings?.restoreTerminalSessions !== false && settings?.terminalHistory) {
          store.setTerminalHistory(settings.terminalHistory)
        } else {
          store.setTerminalHistory('')
        }

        if (settings?.restoreAISession !== false) {
          if (settings?.aiChatHistory) store.setAiChatHistory(settings.aiChatHistory)
        } else {
          setTimeout(() => {
            clearLatestSnapshot()
          }, 0)
        }

        if (settings?.cursorPositions) store.setCursorPositions(settings.cursorPositions)
        if (settings?.expandedFolders) store.setExpandedFolders(settings.expandedFolders)

        const wasCleanShutdown = settings?.cleanShutdown !== false
        const recoverySnapshot = getLatestSnapshot()
        const hasRecoverySnapshot = !!recoverySnapshot
        const hasUnsavedChanges = settings?.unsavedChanges && Object.keys(settings.unsavedChanges).length > 0

        if (!wasCleanShutdown && hasUnsavedChanges) {
          // Recovery prompt on relaunch for unsaved text edits and AI session
          setTimeout(async () => {
            const keep = await new Promise<boolean>((resolve) => {
              store.openModal({
                id: 'recovery-prompt',
                type: 'confirm',
                title: 'Recover Unsaved Work?',
                message: `We found unsaved changes for ${Object.keys(settings.unsavedChanges).length} file(s) from a previous session. Would you like to restore them?`,
                confirmText: 'Restore Work',
                cancelText: 'Discard Changes',
                resolve
              })
            })
            if (keep) {
              store.setUnsavedChanges(settings.unsavedChanges)
              store.addNotification('Unsaved work has been recovered successfully.', 'success')
            } else {
              store.setUnsavedChanges({})
              try {
                await window.electronAPI?.settings.save({
                  ...settings,
                  unsavedChanges: {},
                  cleanShutdown: true
                })
              } catch {}
              store.addNotification('Previous unsaved edits discarded.', 'info')
            }

            if (hasRecoverySnapshot) {
              const recoverAI = await new Promise<boolean>((resolve) => {
                store.openModal({
                  id: 'ai-recovery-prompt',
                  type: 'confirm',
                  title: 'Recover last AI session?',
                  message: crashMetadata
                    ? `The app did not close cleanly due to: ${crashMetadata.reason}. Restore the last AI session from before the crash?`
                    : 'The app did not close cleanly. Restore the last AI session from before the crash?',
                  confirmText: 'Recover Session',
                  cancelText: 'Discard Session',
                  resolve
                })
              })
              if (recoverAI) {
                store.setAiRecoveryPending(true)
                store.addNotification('AI session recovery enabled. The latest session will be restored.', 'success')
              } else {
                clearLatestSnapshot()
                store.addNotification('Previous AI session discarded.', 'info')
              }
            }
          }, 1000)
        } else if (!wasCleanShutdown && hasRecoverySnapshot) {
          setTimeout(async () => {
            const recoverAI = await new Promise<boolean>((resolve) => {
              store.openModal({
                id: 'ai-recovery-prompt',
                type: 'confirm',
                title: 'Recover last AI session?',
                message: crashMetadata
                  ? `The app did not close cleanly due to: ${crashMetadata.reason}. Restore the last AI session from before the crash?`
                  : 'The app did not close cleanly. Restore the last AI session from before the crash?',
                confirmText: 'Recover Session',
                cancelText: 'Discard Session',
                resolve
              })
            })
            if (recoverAI) {
              store.setAiRecoveryPending(true)
              store.addNotification('AI session recovery enabled. The latest session will be restored.', 'success')
            } else {
              clearLatestSnapshot()
              store.addNotification('Previous AI session discarded.', 'info')
            }
          }, 1000)
        } else if (settings?.unsavedChanges && Object.keys(settings.unsavedChanges).length > 0) {
          store.setUnsavedChanges(settings.unsavedChanges)
        }

        // Mark unclean shutdown immediately on start for crash recovery
        try {
          await window.electronAPI?.settings.save({
            ...settings,
            cleanShutdown: false
          })
        } catch {}

        const restoreWorkspace = settings?.workspaceRestore !== false
        const restoreProjectState = settings?.restoreProjectState !== false

        if (!isSafeMode && restoreWorkspace && settings?.rootPath && typeof settings.rootPath === 'string') {
          if (window.electronAPI?.app.allowPath) {
            window.electronAPI.app.allowPath(settings.rootPath)
          }
          const dirLoaded = await loadDirectory(settings.rootPath, true)
          
          if (dirLoaded && restoreProjectState) {
            // Restore open tabs after workspace is mounted, checking if files exist
            if (Array.isArray(settings.openTabs) && settings.openTabs.length > 0) {
              const checkedTabs: string[] = []
              for (const tabPath of settings.openTabs) {
                if (tabPath.startsWith('gitdiff://') || tabPath === 'nexus://settings') {
                  checkedTabs.push(tabPath)
                  continue
                }
                try {
                  const stat = await window.electronAPI?.fs.stat(tabPath)
                  if (stat && !('error' in stat) && stat.isFile) {
                    checkedTabs.push(tabPath)
                  }
                } catch {
                  // ignore deleted
                }
              }
              useAppStore.getState().setOpenTabs(checkedTabs)
              
              // Restore previously selected file
              if (settings.selectedFilePath && typeof settings.selectedFilePath === 'string') {
                if (checkedTabs.includes(settings.selectedFilePath) || settings.selectedFilePath.startsWith('gitdiff://') || settings.selectedFilePath === 'nexus://settings') {
                  useAppStore.getState().setSelectedFilePath(settings.selectedFilePath)
                } else if (checkedTabs.length > 0) {
                  useAppStore.getState().setSelectedFilePath(checkedTabs[checkedTabs.length - 1])
                }
              }
            }
          }
        }
        if (restoreProjectState) {
          if (settings?.sidebarOpen !== undefined) {
            actions.setSidebarOpen(Boolean(settings.sidebarOpen))
          }
          if (settings?.aiPanelOpen !== undefined) {
            actions.setAIPanelOpen(Boolean(settings.aiPanelOpen))
          }
          if (settings?.activeSidebarTab) {
            actions.setSidebarTab(settings.activeSidebarTab)
          }
          if (settings?.bottomPanelOpen !== undefined) {
            actions.setBottomPanelOpen(Boolean(settings.bottomPanelOpen))
          }
        }
        if (settings?.firstRunComplete !== undefined) {
          useAppStore.getState().setFirstRunComplete(Boolean(settings.firstRunComplete))
        }
        if (settings?.aiProvider) {
          useAppStore.getState().setAIProvider(settings.aiProvider as any)
        }
        if (settings?.updateChannel) {
          useAppStore.getState().setUpdateChannel(settings.updateChannel as any)
        }
        if (settings?.telemetry) {
          const telemetrySettings = settings.telemetry as Partial<Record<string, number>>
          if (typeof telemetrySettings === 'object' && telemetrySettings !== null) {
            if (typeof telemetrySettings.appLaunches === 'number') {
              // preserve existing local counters
            }
          }
        }
      } catch (err) {
        console.error('[AppShell] Settings load failed:', err)
      } finally {
        setIsSettingsLoaded(true)
      }
    }

    loadSavedSettings()

    // Fetch last-crash.json (sanitized) from main process and show modal if not acknowledged
    ;(async () => {
      try {
        const res = await (window as any).electronAPI?.ai?.getLastCrash()
        if (res && !res.error && res.crash) {
          const crash = res.crash
          const ack = localStorage.getItem('nexa:lastCrashAck')
          if (!ack || ack !== crash.timestamp) {
            setLastCrash(crash)
            setShowCrashModal(true)
            try { localStorage.setItem('nexa:lastCrashAck', crash.timestamp) } catch {}
          }
        }
      } catch (err) {
        // ignore
      }
    })()

    const loadLicense = async () => {
      useAppStore.getState().setLicenseLoading(true)
      try {
        const status = await window.electronAPI?.license.status()
        if (status && !(status as any).error) {
          useAppStore.getState().setLicenseStatus(status)
        }
      } finally {
        useAppStore.getState().setLicenseLoading(false)
      }
    }

    loadLicense()

    const handleKeyDown = (event: KeyboardEvent) => {
      const isMod = event.ctrlKey || event.metaKey
      if (!isMod) return
      const key = event.key.toLowerCase()

      // Intercept key combinations even when input is active
      if (key === 'p' && event.shiftKey) {
        event.preventDefault()
        actions.setCommandPaletteMode('command')
        actions.setCommandPaletteOpen(true)
        return
      }
      if (key === 'p' && !event.shiftKey) {
        event.preventDefault()
        actions.setCommandPaletteMode('file')
        actions.setCommandPaletteOpen(true)
        return
      }
      if (key === 'f' && event.shiftKey) {
        event.preventDefault()
        actions.setSidebarOpen(true)
        actions.setSidebarTab('search')
        return
      }
      if (key === '/') {
        event.preventDefault()
        const st = useAppStore.getState()
        st.setShortcutsModalOpen(!st.shortcutsModalOpen)
        return
      }

      const active = document.activeElement
      const isInput = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes((active as HTMLElement).tagName)
      if (isInput) return

      if (key === 'n' && !event.shiftKey) {
        event.preventDefault()
        window.electronAPI?.dialog.createFile().then(async (filePath) => {
          if (!filePath) return
          const folder = filePath.replace(/[/\\][^/\\]+$/, '')
          const response = await window.electronAPI?.fs.readDir(folder)
          if (!response || (response as any).error) return
          const separator = getPathSeparator(folder)
          const entries = (response as any[]).map((entry) => ({
            name: entry.name,
            path: `${folder}${folder.endsWith(separator) ? '' : separator}${entry.name}`,
            isDirectory: entry.isDirectory,
            isFile: entry.isFile,
          }))

          actions.setRootPath(folder)
          actions.setCurrentFolder(folder)
          actions.setExplorerEntries(entries)
          actions.setSelectedFilePath(filePath)
          actions.setSidebarOpen(true)
          actions.setSidebarTab('explorer')
        })
        return
      }
      if (key === 'o' && !event.shiftKey) {
        event.preventDefault()
        window.electronAPI?.dialog.openFolder().then(async (folderPath) => {
          if (!folderPath) return
          // Use the ref to always get the latest loadDirectory regardless of
          // when this handler was registered ([] deps = stale closure fix).
          await loadDirectoryRef.current(folderPath)
        })
        return
      }
      if (key === 's' && !event.shiftKey) {
        event.preventDefault()
        const st = useAppStore.getState()
        if (st.selectedFilePath) {
          const content = getFileContent(st.selectedFilePath) ?? ''
          window.electronAPI?.fs.writeFile(st.selectedFilePath, content)
        }
        return
      }
      if (key === '`') {
        event.preventDefault()
        actions.toggleBottomPanel()
        return
      }
      if (key === 'k' && !event.shiftKey) {
        event.preventDefault()
        actions.setCommandPaletteMode('command')
        actions.setCommandPaletteOpen(true)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const rootPath = useAppStore((s) => s.rootPath)
  const editorTheme = useAppStore((s) => s.editorTheme)
  const editorFontSize = useAppStore((s) => s.editorFontSize)
  const editorTabSize = useAppStore((s) => s.editorTabSize)
  const editorWordWrap = useAppStore((s) => s.editorWordWrap)
  const editorMinimap = useAppStore((s) => s.editorMinimap)
  const openCodePathOverride = useAppStore((s) => s.openCodePathOverride)
  const openrouterKeyConfigured = useAppStore((s) => s.openrouterKeyConfigured)
  const openrouterModel = useAppStore((s) => s.openrouterModel)
  const gitUsername = useAppStore((s) => s.gitUsername)
  const gitEmail = useAppStore((s) => s.gitEmail)
  const workspaceRestore = useAppStore((s) => s.workspaceRestore)
  const setWorkspaceRestore = useAppStore((s) => s.setWorkspaceRestore)
  const telemetryEnabled = useAppStore((s) => s.telemetryEnabled)
  // These are subscribed at the top level to avoid calling hooks inside the
  // useEffect dependency array below (which would violate Rules of Hooks).
  const unsavedChanges = useAppStore((s) => s.unsavedChanges)
  const terminalHistory = useAppStore((s) => s.terminalHistory)
  const aiChatHistory = useAppStore((s) => s.aiChatHistory)
  const cursorPositions = useAppStore((s) => s.cursorPositions)
  const expandedFolders = useAppStore((s) => s.expandedFolders)

  useEffect(() => {
    if (!isSettingsLoaded) return

    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = setTimeout(async () => {
      const st = useAppStore.getState()
      try {
        await window.electronAPI?.settings.save({
          rootPath: st.rootPath,
          sidebarOpen: st.sidebarOpen,
          aiPanelOpen: st.aiPanelOpen,
          bottomPanelOpen: st.bottomPanelOpen,
          activeSidebarTab: st.activeSidebarTab,
          firstRunComplete: st.firstRunComplete,
          aiProvider: st.aiProvider,
          updateChannel: st.updateChannel,
          openTabs: st.openTabs,
          selectedFilePath: st.selectedFilePath,
          editorTheme: st.editorTheme,
          editorFontSize: st.editorFontSize,
          editorTabSize: st.editorTabSize,
          editorWordWrap: st.editorWordWrap,
          editorMinimap: st.editorMinimap,
          openCodePathOverride: st.openCodePathOverride,
          openrouterKeyConfigured: st.openrouterKeyConfigured,
          openrouterModel: st.openrouterModel,
          gitUsername: st.gitUsername,
          gitEmail: st.gitEmail,
          workspaceRestore: st.workspaceRestore,
          telemetryEnabled: st.telemetryEnabled,
          unsavedChanges: st.unsavedChanges,
          terminalHistory: st.terminalHistory,
          aiChatHistory: st.aiChatHistory,
          cursorPositions: st.cursorPositions,
          expandedFolders: st.expandedFolders,
          cleanShutdown: false,
        })
      } catch {
        // best-effort persistence only
      }
      saveTimerRef.current = null
    }, 300)

    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [
    isSettingsLoaded,
    layout.sidebarOpen,
    layout.aiPanelOpen,
    layout.bottomPanelOpen,
    layout.activeSidebarTab,
    editorTheme,
    editorFontSize,
    editorTabSize,
    editorWordWrap,
    editorMinimap,
    openCodePathOverride,
    openrouterKeyConfigured,
    openrouterModel,
    gitUsername,
    gitEmail,
    workspaceRestore,
    telemetryEnabled,
    unsavedChanges,
    terminalHistory,
    aiChatHistory,
    cursorPositions,
    expandedFolders,
  ])

  // 2s checkpoint interval for crash recovery
  useEffect(() => {
    const checkpointInterval = setInterval(async () => {
      const st = useAppStore.getState()
      if (Object.keys(st.unsavedChanges).length > 0) {
        try {
          await window.electronAPI?.settings.save({
            rootPath: st.rootPath,
            sidebarOpen: st.sidebarOpen,
            aiPanelOpen: st.aiPanelOpen,
            bottomPanelOpen: st.bottomPanelOpen,
            activeSidebarTab: st.activeSidebarTab,
            firstRunComplete: st.firstRunComplete,
            aiProvider: st.aiProvider,
            updateChannel: st.updateChannel,
            openTabs: st.openTabs,
            selectedFilePath: st.selectedFilePath,
            editorTheme: st.editorTheme,
            editorFontSize: st.editorFontSize,
            editorTabSize: st.editorTabSize,
            editorWordWrap: st.editorWordWrap,
            editorMinimap: st.editorMinimap,
            openCodePathOverride: st.openCodePathOverride,
            openrouterKeyConfigured: st.openrouterKeyConfigured,
            openrouterModel: st.openrouterModel,
            gitUsername: st.gitUsername,
            gitEmail: st.gitEmail,
            workspaceRestore: st.workspaceRestore,
            telemetryEnabled: st.telemetryEnabled,
            unsavedChanges: st.unsavedChanges,
            terminalHistory: st.terminalHistory,
            aiChatHistory: st.aiChatHistory,
            cursorPositions: st.cursorPositions,
            expandedFolders: st.expandedFolders,
            cleanShutdown: false,
          })
        } catch {
          // ignore
        }
      }
    }, 2000)

    return () => clearInterval(checkpointInterval)
  }, [])

  // Save all on window close/quit request
  useEffect(() => {
    const unsub = window.electronAPI?.window.onQuitRequest(async () => {
      // Save all dirty files
      await saveAllDirtyFiles()
      
      // Save settings with cleanShutdown: true
      const st = useAppStore.getState()
      try {
        await window.electronAPI?.settings.save({
          rootPath: st.rootPath,
          sidebarOpen: st.sidebarOpen,
          aiPanelOpen: st.aiPanelOpen,
          bottomPanelOpen: st.bottomPanelOpen,
          activeSidebarTab: st.activeSidebarTab,
          firstRunComplete: st.firstRunComplete,
          aiProvider: st.aiProvider,
          updateChannel: st.updateChannel,
          openTabs: st.openTabs,
          selectedFilePath: st.selectedFilePath,
          editorTheme: st.editorTheme,
          editorFontSize: st.editorFontSize,
          editorTabSize: st.editorTabSize,
          editorWordWrap: st.editorWordWrap,
          editorMinimap: st.editorMinimap,
          openCodePathOverride: st.openCodePathOverride,
          openrouterKeyConfigured: st.openrouterKeyConfigured,
          openrouterModel: st.openrouterModel,
          gitUsername: st.gitUsername,
          gitEmail: st.gitEmail,
          workspaceRestore: st.workspaceRestore,
          telemetryEnabled: st.telemetryEnabled,
          unsavedChanges: st.unsavedChanges,
          terminalHistory: st.terminalHistory,
          aiChatHistory: st.aiChatHistory,
          cursorPositions: st.cursorPositions,
          expandedFolders: st.expandedFolders,
          cleanShutdown: true, // Clean exit!
        })
      } catch {}
      
      // Notify main process we are ready
      window.electronAPI?.window.readyToQuit()
    })

    return unsub
  }, [])

  // Save all on window blur
  useEffect(() => {
    const handleBlur = () => {
      saveAllDirtyFiles().catch(console.error)
    }
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [])

  // Listen to file system changes from the main process watcher
  useEffect(() => {
    if (!rootPath) return
    const unsub = window.electronAPI?.on('workspace:changed', async (event: any) => {
      console.log('[Watcher] Workspace changed, invalidating cache:', event)
      invalidateDirCache(rootPath)
      try {
        const workspaceApi = window.electronAPI?.workspace
        if (workspaceApi) {
          const snapshot = await workspaceApi.snapshot()
          if (snapshot && !snapshot.error) {
            useWorkspaceStore.getState().setSnapshot(snapshot)
          }
        }
      } catch (err) {
        console.error('[Watcher] Failed to refresh snapshot on workspace:changed:', err)
      }
    })
    return () => {
      unsub?.()
    }
  }, [rootPath])

  useEffect(() => {
    const handler = (payload: any) => {
      try {
        const title = payload?.title ?? 'Extension'
        const message = payload?.message ?? title
        const kind = payload?.type === 'error' ? 'error' : payload?.type === 'warning' ? 'warning' : 'info'
        useAppStore.getState().addNotification(`${title}: ${message}`, kind)
      } catch (err) {
        // ignore
      }
    }
    const unsub = window.electronAPI?.on('extensionHost:notification', handler)
    return () => unsub?.()
  }, [])


  const handleOpenLogs = async () => {
    await window.electronAPI?.logs.openFolder(savedRootPath)
  }

  const handleExitSafeMode = async () => {
    await saveSafeModeRestorePreferences()
    await window.electronAPI?.app.relaunchNormal()
  }

  const handleClearCrashMetadata = async () => {
    await window.electronAPI?.app.clearCrashMetadata()
    setCrashMetadata(null)
  }

  const saveSafeModeRestorePreferences = async () => {
    const baseSettings = loadedSettings ?? {}
    const st = useAppStore.getState()
    try {
      await window.electronAPI?.settings.save({
        ...baseSettings,
        workspaceRestore: st.workspaceRestore,
        restoreExtensions,
        restoreAISession,
        restoreTerminalSessions,
        restoreProjectState,
        cleanShutdown: false,
      })
    } catch {
      // best-effort only
    }
  }

  const handleRestoreLastSession = async () => {
    await saveSafeModeRestorePreferences()
    await window.electronAPI?.app.relaunchNormal()
  }

  const handleRetryNormalLaunch = async () => {
    await window.electronAPI?.app.relaunchNormal()
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: '#080909' }}
    >
      {/* ── Custom Title Bar ──────────────────────────────────────────────── */}
      <MemoTitleBar />
      {isSafeMode && (
        <div className="bg-amber-950 border-b border-amber-700 text-amber-100 px-4 py-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-500/15 p-2">
                <span className="text-amber-300 text-sm font-semibold uppercase tracking-[0.18em]">Safe Mode</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Running in Safe Mode</p>
                <p className="text-xs text-amber-200/80">Only basic chat mode is available until safe mode is exited.</p>
                {crashMetadata && (
                  <div className="mt-2 rounded border border-amber-600 bg-amber-900/10 p-2 text-[11px] text-amber-100">
                    <div className="font-semibold text-amber-200">Previous crash reason</div>
                    <div className="truncate">{crashMetadata.reason}</div>
                    <div className="text-amber-400 text-[10px] mt-1">{crashMetadata.source.replace(/-/g, ' ')}</div>
                  </div>
                )}
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="flex items-start gap-3 rounded-xl border border-amber-600 bg-amber-900/10 px-3 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={workspaceRestore}
                      onChange={(e) => setWorkspaceRestore(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-black/40 accent-[#f59e0b]"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-amber-100">Restore workspace</div>
                      <div className="text-[10px] text-amber-300">Reopen the last project when relaunching.</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 rounded-xl border border-amber-600 bg-amber-900/10 px-3 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={restoreExtensions}
                      onChange={(e) => setRestoreExtensions(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-black/40 accent-[#f59e0b]"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-amber-100">Restore extensions</div>
                      <div className="text-[10px] text-amber-300">Re-enable extension host after relaunch.</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 rounded-xl border border-amber-600 bg-amber-900/10 px-3 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={restoreAISession}
                      onChange={(e) => setRestoreAISession(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-black/40 accent-[#f59e0b]"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-amber-100">Restore AI session</div>
                      <div className="text-[10px] text-amber-300">Keep the last AI crash recovery session available.</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 rounded-xl border border-amber-600 bg-amber-900/10 px-3 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={restoreTerminalSessions}
                      onChange={(e) => setRestoreTerminalSessions(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-black/40 accent-[#f59e0b]"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-amber-100">Restore terminal sessions</div>
                      <div className="text-[10px] text-amber-300">Restore terminal output from the previous session.</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 rounded-xl border border-amber-600 bg-amber-900/10 px-3 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={restoreProjectState}
                      onChange={(e) => setRestoreProjectState(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-black/40 accent-[#f59e0b]"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-amber-100">Restore project state</div>
                      <div className="text-[10px] text-amber-300">Restore file tabs, selection, and layout state.</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-amber-600 bg-amber-800/90 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-700"
                onClick={handleExitSafeMode}
              >
                Exit Safe Mode
              </button>
              <button
                type="button"
                className="rounded border border-amber-600 bg-transparent px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-800"
                onClick={handleOpenLogs}
              >
                Open Logs
              </button>
              <button
                type="button"
                className="rounded border border-amber-600 bg-transparent px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-800"
                onClick={handleRestoreLastSession}
                disabled={!savedRootPath}
              >
                Restore Last Session
              </button>
              <button
                type="button"
                className="rounded border border-amber-600 bg-transparent px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-800"
                onClick={handleClearCrashMetadata}
              >
                Clear Crash Info
              </button>
              <button
                type="button"
                className="rounded border border-amber-600 bg-transparent px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-800"
                onClick={handleRetryNormalLaunch}
              >
                Retry Normal Launch
              </button>
            </div>
          </div>
        </div>
      )}

      {isSettingsLoaded && !firstRunComplete ? (
        <OnboardingScreen />
      ) : (
        <>
          {/* ── Main Content Row ─────────────────────────────────────────────── */}
          <div className="flex flex-1 overflow-hidden min-h-0 flex-col">
            <div className="flex flex-1 overflow-hidden min-h-0">
              {/* Activity Bar (always visible) */}
              <MemoActivityBar />

              {/* File Explorer Sidebar — animated via transform */}
              {layout.sidebarOpen && (
                <div className="shrink-0" style={{ width: SIDEBAR_W, borderRight: '1px solid rgba(139, 92, 246, 0.09)', overflow: 'hidden' }}>
                  <motion.div
                    initial={{ x: -SIDEBAR_W, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -SIDEBAR_W, opacity: 0 }}
                    transition={panelTransition}
                  >
                    <ComponentErrorBoundary title="Sidebar error" message="The explorer panel encountered an issue.">
                      <MemoSidebar />
                    </ComponentErrorBoundary>
                  </motion.div>
                </div>
              )}

              {/* Editor Area — fills remaining space */}
              <div className="flex-1 overflow-hidden min-w-0 relative">
                <ComponentErrorBoundary title="Editor error" message="The editor area encountered an issue.">
                  <EditorArea />
                </ComponentErrorBoundary>
              </div>

              {/* AI Panel — animated via transform */}
              {layout.aiPanelOpen && (
                <div
                  className="shrink-0 flex flex-col h-full min-h-0 self-stretch overflow-hidden"
                  style={{ width: AIPANEL_W, borderLeft: '1px solid rgba(139, 92, 246, 0.09)' }}
                >
                  <motion.div
                    initial={{ x: AIPANEL_W, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: AIPANEL_W, opacity: 0 }}
                    transition={panelTransition}
                    className="flex flex-col flex-1 min-h-0 h-full overflow-hidden"
                  >
                    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">Loading AI panel…</div>}>
                      <ComponentErrorBoundary title="AI panel error" message="NEXA AI failed to load.">
                        <div className="flex flex-col h-full min-h-0 overflow-hidden">
                          <AIPanel />
                        </div>
                      </ComponentErrorBoundary>
                    </Suspense>
                  </motion.div>
                </div>
              )}
            </div>

            {layout.bottomPanelOpen && (
              <div className="overflow-hidden border-t border-white/10" style={{ height: '260px' }}>
                <motion.div
                  initial={{ scaleY: 0, opacity: 0 }}
                  animate={{ scaleY: 1, opacity: 1 }}
                  exit={{ scaleY: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  style={{ transformOrigin: 'top' } as CSSProperties}
                >
                  <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">Loading terminal…</div>}>
                      <ComponentErrorBoundary title="Terminal error" message="The terminal panel failed to load.">
                        <MemoTerminalPanel onClose={actions.toggleBottomPanel} />
                      </ComponentErrorBoundary>
                  </Suspense>
                </motion.div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Status Bar ───────────────────────────────────────────────────── */}
      <MemoStatusBar />
      <MemoCommandPalette />
      <MemoNotificationCenter />
      {showCrashModal && lastCrash && (
        <CrashRecoveryModal crash={{
          timestamp: lastCrash.timestamp,
          component: lastCrash.component || lastCrash.source || 'unknown',
          reason: lastCrash.reason || 'Unknown',
          shortStack: lastCrash.shortStack || (typeof lastCrash.details === 'string' ? (lastCrash.details as string).slice(0, 1024) : ''),
          details: lastCrash.details,
          suggestedSafeMode: lastCrash.suggestedSafeMode || [],
        }} onClose={() => setShowCrashModal(false)} />
      )}
      <MemoModalDialog />
      <MemoLicensePanel />
      <ShortcutsHelpModal />
    </div>
  )
}
