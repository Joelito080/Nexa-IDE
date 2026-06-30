import { GitBranch, CheckCircle2, Bot, Zap, AlertCircle, Info, Keyboard } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'

export default function StatusBar() {
  // State selectors — fine-grained to prevent cascading re-renders
  const gitBranch = useAppStore((s) => s.gitBranch)
  const selectedFilePath = useAppStore((s) => s.selectedFilePath)
  const rootPath = useAppStore((s) => s.rootPath)
  const updateChannel = useAppStore((s) => s.updateChannel)
  const saveState = useAppStore((s) => s.saveState)
  const cursorPositions = useAppStore((s) => s.cursorPositions)
  const activeCursor = selectedFilePath ? cursorPositions[selectedFilePath] : null
  const cursorText = activeCursor ? `Ln ${activeCursor.line}, Col ${activeCursor.column}` : 'Ln 1, Col 1'
  // Actions — stable references, never trigger re-renders
  const setUpdateChannel = useAppStore((s) => s.setUpdateChannel)
  const setSidebarTab = useAppStore((s) => s.setSidebarTab)
  const [appVersion, setAppVersion] = useState('1.0.0')
  const [latestVersion, setLatestVersion] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    window.electronAPI?.app.getVersion()
      .then((version) => {
        if (active && typeof version === 'string') {
          setAppVersion(version)
        }
      })
      .catch(() => {})

    window.electronAPI?.updater.getChannel()
      .then((result) => {
        if (!active || !result || typeof result !== 'object') return
        const channel = (result as any).channel === 'stable' ? 'stable' : 'beta'
        if (channel !== updateChannel) {
          setUpdateChannel(channel)
        }
      })
      .catch(() => {})

    const removeUpdateAvailable = window.electronAPI?.on('updater:updateAvailable', (info) => {
      if (info && typeof info === 'object' && typeof (info as any).version === 'string') {
        setLatestVersion((info as any).version)
      }
    })

    const removeUpdateNotAvailable = window.electronAPI?.on('updater:updateNotAvailable', () => {
      setLatestVersion(null)
    })

    return () => {
      active = false
      removeUpdateAvailable?.()
      removeUpdateNotAvailable?.()
    }
  }, [updateChannel, setUpdateChannel])

  const fileName = selectedFilePath ? selectedFilePath.split(/[/\\]/).pop() : null
  const licenseStatus = useAppStore((s) => s.licenseStatus)
  const licenseLoading = useAppStore((s) => s.licenseLoading)
  const setLicensePanelOpen = useAppStore((s) => s.setLicensePanelOpen)
  const setShortcutsModalOpen = useAppStore((s) => s.setShortcutsModalOpen)

  return (
    <div
      className="shrink-0 flex items-center justify-between px-3 select-none z-50"
      style={{
        height: 22,
        background: 'linear-gradient(90deg, #7c3aed 0%, #6366f1 45%, #4f46e5 70%, #3b82f6 100%)',
      }}
    >
      {/* ── Left ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Branch */}
        <button
          type="button"
          onClick={() => setSidebarTab('git')}
          className="flex items-center gap-1 text-white/90 hover:bg-white/10 text-[10px] font-medium px-1.5 py-0.5 rounded cursor-pointer transition-colors duration-100"
        >
          <GitBranch size={11} />
          <span>{gitBranch}</span>
          {gitBranch && /^[0-9a-f]{7,40}$/i.test(gitBranch) && (
            <span className="ml-1 text-[8px] bg-amber-500 text-black px-1 rounded font-bold uppercase animate-pulse">
              Detached HEAD
            </span>
          )}
        </button>

        {/* Problems */}
        <div className="flex items-center gap-1 text-white/80 text-[10px] px-1 py-0.5 rounded transition-colors duration-100">
          <AlertCircle size={10} className="opacity-70" />
          <span>0</span>
          <Info size={10} className="opacity-70 ml-0.5" />
          <span>0</span>
        </div>

        {/* Status */}
        <div className="flex items-center gap-1 text-white/80 text-[10px]">
          {fileName && saveState === 'Saving...' ? (
            <div className="w-2.5 h-2.5 rounded-full border border-t-transparent border-white animate-spin shrink-0" />
          ) : fileName && saveState === 'Failed' ? (
            <AlertCircle size={10} className="text-rose-300 animate-bounce" />
          ) : (
            <CheckCircle2 size={10} />
          )}
          <span>
            {fileName 
              ? `Editing ${fileName}${saveState ? ` (${saveState})` : ''}` 
              : rootPath ? 'Ready' : 'Open a folder'}
          </span>
        </div>
      </div>

      {/* ── Center — AI Status ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 text-white/90 text-[10px] font-medium absolute left-1/2 -translate-x-1/2">
        <Bot size={10} />
        <span>NEXUS · Local · llama3</span>
        <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
        <div style={{ width: 8 }} />
        <div className="text-[11px] text-white/90">
          {licenseLoading ? 'Checking license…' : licenseStatus ? `${licenseStatus.plan.toUpperCase()}` : 'No license'}
        </div>
        <button
          type="button"
          onClick={() => setLicensePanelOpen(true)}
          className="ml-2 text-[11px] text-[#cbd5e1] hover:text-white"
        >
          Manage
        </button>
      </div>

      {/* ── Right ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 text-white/70 text-[10px]">
        <button
          type="button"
          onClick={() => setShortcutsModalOpen(true)}
          className="flex items-center gap-1 text-white/80 hover:text-white hover:bg-white/10 text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-colors duration-100"
          title="Keyboard Shortcuts Help (Ctrl+/)"
        >
          <Keyboard size={11} />
          <span>Shortcuts</span>
        </button>
        <div className="flex items-center gap-1 px-1 py-0.5 rounded text-white/80 text-[10px]">
          <Zap size={9} className="text-white/60" />
          <span>v{appVersion} • {updateChannel === 'beta' ? 'Beta Channel' : 'Stable Channel'}</span>
        </div>
        <div className="flex items-center gap-1 px-1 py-0.5 rounded text-white/80 text-[10px]">
          {latestVersion ? `Latest available: ${latestVersion}` : 'Update status current'}
        </div>
        <div className="flex items-center gap-1 px-1 py-0.5 rounded text-white/80 text-[10px]">
          TypeScript
        </div>
        <span>{selectedFilePath ? cursorText : 'No file selected'}</span>
        <div className="flex items-center gap-1 px-1 py-0.5 rounded text-white/80 text-[10px]">
          UTF-8
        </div>
        <div className="flex items-center gap-1 px-1 py-0.5 rounded text-white/80 text-[10px]">
          LF
        </div>
      </div>
    </div>
  )
}
