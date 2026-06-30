import { motion } from 'framer-motion'
import { Suspense, useEffect, useState, lazy, useRef, useCallback, memo } from 'react'
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
import { invalidateDirCache, saveAllDirtyFiles, closeAllTabs, updateFileContentDebounced } from '../../lib/fileSystem'
import OnboardingScreen from './OnboardingScreen'
import ShortcutsHelpModal from '../ui/ShortcutsHelpModal'
import { addRecentProject } from '../../lib/recentProjects'

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
  const firstRunComplete = useAppStore((s) => s.firstRunComplete)
  
  // Only subscribe to layout state — AppShell must not re-render on file/explorer/git/search changes
  const layout = useAppStoreLayout()
  const actions = useAppStoreActions()

  const getPathSeparator = (value: string) => (value.includes('\\') ? '\\' : '/')

  const clearExplorerState = () => {
    useAppStore.getState().setExpandedFolders({})
    useWorkspaceStore.getState().reset()
  }

  const loadDirectory = useCallback(async (folderPath: string) => {
    // ── Step 1: Immediately clear old state in both renderer AND main process ──
    // This must happen synchronously before any await so no IPC call can slip
    // through with the stale workspace root still set on the main process.
    actions.setRootPath(null)
    clearExplorerState()
    invalidateDirCache()
    closeAllTabs()
    clearFileCache()

    // Clear the root on the main process immediately — this is the fix for the
    // race condition where readDir/readFile calls were validated against the OLD
    // workspace root because workspace.mount() was called too late.
    await window.electronAPI?.workspace.setRoot(null)

    useWorkspaceStore.getState().setLoading(true)

    try {
      // ── Step 2: Allow path + set NEW root BEFORE any filesystem call ──────
      // workspace.setRoot sets workspaceEngine root + clears main-process cache
      // so the safety validator sees the correct root on the very first readDir.
      if (window.electronAPI?.app?.allowPath) {
        window.electronAPI.app.allowPath(folderPath)
      }
      await window.electronAPI?.workspace.setRoot(folderPath)

      // ── Step 3: Now safely read filesystem — root is already correct ───────
      const response = await window.electronAPI?.fs.readDir(folderPath)
      if (!response || (response as any).error) {
        // If readDir fails, clear root again so we don't sit on a broken state
        await window.electronAPI?.workspace.setRoot(null)
        useWorkspaceStore.getState().setLoading(false)
        return false
      }

      const separator = getPathSeparator(folderPath)
      const entries = (response as any[]).map((entry) => ({
        name: entry.name,
        path: `${folderPath}${folderPath.endsWith(separator) ? '' : separator}${entry.name}`,
        isDirectory: entry.isDirectory,
        isFile: entry.isFile,
      }))

      // ── Step 4: Update renderer store state ───────────────────────────────
      actions.setRootPath(folderPath)
      actions.setCurrentFolder(folderPath)
      actions.setExplorerEntries(entries)
      actions.setSelectedFilePath(null)
      actions.setSidebarOpen(true)
      actions.setSidebarTab('explorer')

      // ── Step 5: Full workspace mount (file tree, watcher, memory) ─────────
      // This is intentionally after the UI is already showing the new folder,
      // so the explorer feels instant while the heavier setup happens in bg.
      const snapshot = await window.electronAPI?.workspace.mount(folderPath)
      if (snapshot && !(snapshot as any).error) {
        useWorkspaceStore.getState().setSnapshot(snapshot as any)
      }

      addRecentProject(folderPath)
      await loadGitStatus(folderPath)
      return true
    } catch (err) {
      console.error('[loadDirectory] Workspace loading failed:', err)
      // Ensure root is never left in a half-set state on error
      await window.electronAPI?.workspace.setRoot(null).catch(() => {})
      return false
    } finally {
      useWorkspaceStore.getState().setLoading(false)
    }
  // actions is a stable Zustand slice — safe in deps
  }, [actions]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a ref to the latest loadDirectory so stale-closure event handlers
  // (registered with [] deps) always call the current version.
  const loadDirectoryRef = useRef(loadDirectory)
  useEffect(() => { loadDirectoryRef.current = loadDirectory }, [loadDirectory])

  useEffect(() => {
    // Always expose the latest version so external callers (TitleBar, test runner)
    // get the current closure — not the one from the first render.
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
        const response = await window.electronAPI?.settings.load()
        const settings = (response as any)?.settings ?? null
        
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

        if (settings?.terminalHistory) store.setTerminalHistory(settings.terminalHistory)
        if (settings?.aiChatHistory) store.setAiChatHistory(settings.aiChatHistory)
        if (settings?.cursorPositions) store.setCursorPositions(settings.cursorPositions)
        if (settings?.expandedFolders) store.setExpandedFolders(settings.expandedFolders)

        const wasCleanShutdown = settings?.cleanShutdown !== false
        if (!wasCleanShutdown && settings?.unsavedChanges && Object.keys(settings.unsavedChanges).length > 0) {
          // Recovery prompt on relaunch
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
        if (restoreWorkspace && settings?.rootPath && typeof settings.rootPath === 'string') {
          if (window.electronAPI?.app.allowPath) {
            window.electronAPI.app.allowPath(settings.rootPath)
          }
          const dirLoaded = await loadDirectory(settings.rootPath)
          
          if (dirLoaded) {
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
    const unsub = window.electronAPI?.on('workspace:changed', (event: any) => {
      console.log('[Watcher] Workspace changed, invalidating cache:', event)
      invalidateDirCache(rootPath)
    })
    return () => {
      unsub?.()
    }
  }, [rootPath])


  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: '#080909' }}
    >
      {/* ── Custom Title Bar ─────────────────────────────────────────────── */}
      <MemoTitleBar />

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
                      <ComponentErrorBoundary title="AI panel error" message="NEXUS AI failed to load.">
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
                  style={{ transformOrigin: 'top' }}
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
      <MemoModalDialog />
      <MemoLicensePanel />
      <ShortcutsHelpModal />
    </div>
  )
}
