import { useEffect, useState, memo, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Minus, X, Settings, ChevronDown,
  Maximize2, Minimize2, Command,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
// ✨ Performance: Import sliced selectors to prevent cascade re-renders
import {
  useAppStoreActions,
  useAppStoreRootPath,
} from '../../hooks/useAppStoreSelectors'
import { loadGitStatus } from '../../lib/gitUtils'

// ── NEXUS Hexagon Logo ───────────────────────────────────────────────────────
function NexusLogo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="tbar-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#a78bfa" />
          <stop offset="50%"  stopColor="#818cf8" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
        <filter id="tbar-glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <polygon
        points="50,4 93,27 93,73 50,96 7,73 7,27"
        fill="url(#tbar-grad)"
        filter="url(#tbar-glow)"
      />
      <polygon
        points="50,15 82,33 82,67 50,85 18,67 18,33"
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1.5"
      />
      <text
        x="50" y="64"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight="800"
        fontSize="40"
        fill="white"
        letterSpacing="-2"
      >
        N
      </text>
    </svg>
  )
}

// ── Menu Items ───────────────────────────────────────────────────────────────
const MENU_ITEMS = ['File', 'Edit', 'View', 'Terminal', 'Help'] as const

// ── Window Control Button ────────────────────────────────────────────────────
function WinControl({
  onClick,
  title,
  hoverClass,
  children,
}: {
  onClick: () => void
  title: string
  hoverClass: string
  children: React.ReactNode
}) {
  return (
    <motion.button
      onClick={onClick}
      title={title}
      whileTap={{ scale: 0.9 }}
      className={`no-drag w-11 h-[38px] flex items-center justify-center text-[#475569] transition-all duration-150 ${hoverClass}`}
    >
      {children}
    </motion.button>
  )
}

// ── Restore Icon (two overlapping squares) ───────────────────────────────────
function RestoreIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="2.5" y="0" width="8" height="8" rx="0.8" stroke="currentColor" strokeWidth="1.1" />
      <rect x="0"   y="2.5" width="8" height="8" rx="0.8" stroke="currentColor" strokeWidth="1.1" fill="rgba(13,14,20,0.9)" />
    </svg>
  )
}

// ── TitleBar ─────────────────────────────────────────────────────────────────
export default memo(function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  
  // ✨ Performance: Use sliced selectors instead of 14+ independent subscriptions
  const {
    setRootPath, setCurrentFolder, setExplorerEntries, setSelectedFilePath,
    setSidebarOpen, setSidebarTab, setMaximized: setMaximizedStore,
    setCommandPaletteOpen, toggleSidebar, setBottomPanelOpen, requestTerminalFocus,
  } = useAppStoreActions()
  const rootPath = useAppStoreRootPath()
  const addNotification = useAppStore((s) => s.addNotification)

  const loadDirectory = async (folderPath: string) => {
    // Set root on main process BEFORE any fs call — prevents stale-root reads
    if (window.electronAPI?.app?.allowPath) {
      window.electronAPI.app.allowPath(folderPath)
    }
    await window.electronAPI?.workspace.setRoot(folderPath)

    const response = await window.electronAPI?.fs.readDir(folderPath)
    if (!response || (response as any).error) {
      addNotification(`Unable to read folder: ${(response as any).error ?? 'Unknown error'}`, 'error')
      await window.electronAPI?.workspace.setRoot(null).catch(() => {})
      return
    }

    const separator = folderPath.includes('\\') ? '\\' : '/'
    const entries = (response as any[]).map((entry) => ({
      name: entry.name,
      path: `${folderPath}${folderPath.endsWith(separator) ? '' : separator}${entry.name}`,
      isDirectory: entry.isDirectory,
      isFile: entry.isFile,
    }))

    setRootPath(folderPath)
    setCurrentFolder(folderPath)
    setExplorerEntries(entries)
    setSelectedFilePath(null)
    setSidebarOpen(true)
    setSidebarTab('explorer')

    await loadGitStatus(folderPath)
  }

  useEffect(() => {
    if (window.electronAPI) {
      // Query initial state
      window.electronAPI.window.isMaximized().then((val: boolean) => {
        setIsMaximized(val)
        setMaximizedStore(val)
      })

      // Subscribe to future changes
      const unsub = window.electronAPI.window.onMaximizedChange((val: boolean) => {
        setIsMaximized(val)
        setMaximizedStore(val)
      })

      return () => unsub?.()
    } else {
      const handleFullscreenChange = () => {
        const isFullscreen = !!document.fullscreenElement
        setIsMaximized(isFullscreen)
        setMaximizedStore(isFullscreen)
      }
      document.addEventListener('fullscreenchange', handleFullscreenChange)
      return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [setMaximizedStore])

  return (
    <div
      className="drag-region flex items-center h-[38px] select-none shrink-0 relative z-50"
      style={{
        background: 'rgba(6, 7, 11, 0.97)',
        borderBottom: '1px solid rgba(139, 92, 246, 0.1)',
      }}
    >
      {/* ── Brand ─────────────────────────────────────────────────────────── */}
      <div className="no-drag flex items-center gap-2 px-3 shrink-0">
        <NexusLogo />
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold tracking-[0.18em] text-white/80 uppercase">
            NEXUS
          </span>
          <span className="text-[11px] font-bold tracking-[0.18em] gradient-text uppercase">
            IDE
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-white/[0.07] mx-1 shrink-0" />

      {/* ── Menu Bar ──────────────────────────────────────────────────────── */}
      <nav className="no-drag flex items-center shrink-0">
        {MENU_ITEMS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              if (item === 'File') {
                window.electronAPI?.dialog.openFolder().then((folderPath) => {
                  if (folderPath) {
                    if ((window as any).loadDirectory) {
                      (window as any).loadDirectory(folderPath)
                    } else {
                      loadDirectory(folderPath)
                    }
                  }
                })
                return
              }
              if (item === 'Edit') {
                setCommandPaletteOpen(true)
                return
              }
              if (item === 'View') {
                toggleSidebar()
                return
              }
              if (item === 'Terminal') {
                setBottomPanelOpen(true)
                requestTerminalFocus()
                return
              }
              if (item === 'Help') {
                const url = 'https://id-preview--6f13a148-826f-4dac-9293-32ae108cad18.lovable.app/#'
                const openPromise = window.electronAPI?.external.open(url)
                if (openPromise) {
                  openPromise.catch(() => window.open(url, '_blank'))
                } else {
                  window.open(url, '_blank')
                }
                return
              }
            }}
            className="flex items-center gap-1 px-3 h-[38px] text-[11.5px] text-[#475569] hover:text-white hover:bg-white/[0.05] transition-all duration-150 font-medium"
          >
            {item}
            {item === 'File' && (
              <ChevronDown size={10} className="opacity-40" />
            )}
          </button>
        ))}
      </nav>

      {/* ── Spacer (draggable) ────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0" />

      {/* ── Center Label ─────────────────────────────────────────────────── */}
      <div className="no-drag flex items-center gap-1.5 text-[10.5px] text-[#cbd5e1] absolute left-1/2 -translate-x-1/2 pointer-events-none">
        <Command size={10} className="text-[#8b5cf6]/60" />
        <span>Current workspace path: {rootPath || 'None'}</span>
      </div>

      {/* ── Spacer ────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0" />

      {/* ── AI Status Pill ────────────────────────────────────────────────── */}
      <div className="no-drag flex items-center gap-1.5 mr-3 px-2.5 py-1 rounded-full text-[10px] font-medium text-[#8b5cf6] shrink-0"
        style={{
          background: 'rgba(139, 92, 246, 0.1)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
        }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse shrink-0" />
        <span>NEXUS · Local</span>
      </div>

      {/* ── Settings ──────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        className="no-drag w-9 h-[38px] flex items-center justify-center text-[#2d3748] hover:text-[#94a3b8] hover:bg-white/[0.04] transition-all duration-150"
      >
        <Settings size={13} />
      </button>

      {/* ── Window Controls ───────────────────────────────────────────────── */}
      {window.electronAPI && (
        <WinControl
          onClick={() => window.electronAPI?.window.minimize()}
          title="Minimize"
          hoverClass="hover:text-[#f1f5f9] hover:bg-white/[0.07]"
        >
          <Minus size={13} />
        </WinControl>
      )}

      <WinControl
        onClick={() => {
          if (window.electronAPI) {
            window.electronAPI.window.maximize()
          } else {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen().catch(() => {})
            } else {
              document.exitFullscreen().catch(() => {})
            }
          }
        }}
        title={isMaximized ? 'Restore' : 'Maximize'}
        hoverClass="hover:text-[#f1f5f9] hover:bg-white/[0.07]"
      >
        {isMaximized ? <RestoreIcon /> : <Maximize2 size={11} />}
      </WinControl>

      <WinControl
        onClick={() => {
          if (window.electronAPI) {
            window.electronAPI.window.close()
          } else {
            window.close()
          }
        }}
        title="Close"
        hoverClass="hover:text-white hover:bg-[#c42b1c]"
      >
        <X size={13} />
      </WinControl>
    </div>
  )
})
