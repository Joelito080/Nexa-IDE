import { motion, AnimatePresence } from 'framer-motion'
import {
  Files, Search, GitBranch, Bug,
  Blocks, Settings2, Bot, Database,
} from 'lucide-react'
import { useAppStore, SidebarTab } from '../../store/appStore'
import clsx from 'clsx'

// ── Tab Definition ────────────────────────────────────────────────────────────
interface Tab {
  id: SidebarTab | 'ai' | 'settings'
  icon: React.ReactNode
  label: string
  position: 'top' | 'bottom'
}

const TABS: Tab[] = [
  { id: 'explorer',   icon: <Files size={19} />,      label: 'Explorer',        position: 'top' },
  { id: 'search',     icon: <Search size={19} />,     label: 'Search',          position: 'top' },
  { id: 'git',        icon: <GitBranch size={19} />,  label: 'Source Control',  position: 'top' },
  { id: 'debug',      icon: <Bug size={19} />,        label: 'Run & Debug',     position: 'top' },
  { id: 'database',   icon: <Database size={19} />,   label: 'Database',        position: 'top' },
  { id: 'extensions', icon: <Blocks size={19} />,     label: 'Extensions',      position: 'top' },
  { id: 'ai',         icon: <Bot size={19} />,        label: 'NEXUS AI',        position: 'bottom' },
  { id: 'settings',   icon: <Settings2 size={19} />,  label: 'Settings',        position: 'bottom' },
]

// ── Single Activity Icon ──────────────────────────────────────────────────────
function ActivityIcon({ tab, isActive, onClick }: {
  tab: Tab
  isActive: boolean
  onClick: () => void
}) {
  return (
    <div className="relative group">
      <motion.button
        onClick={onClick}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        className={clsx(
          'relative w-full h-[48px] flex items-center justify-center transition-colors duration-150',
          isActive ? 'text-[#a78bfa]' : 'text-[#3d4661] hover:text-[#6b7280]'
        )}
      >
        {/* Active left indicator bar */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              layoutId="activity-indicator"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 rounded-r-full"
              style={{ background: 'linear-gradient(180deg, #a78bfa, #818cf8)' }}
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: 1, scaleY: 1 }}
              exit={{ opacity: 0, scaleY: 0 }}
              transition={{ duration: 0.18 }}
            />
          )}
        </AnimatePresence>

        {/* Glow background when active */}
        {isActive && (
          <div
            className="absolute inset-2 rounded-lg"
            style={{ background: 'rgba(139, 92, 246, 0.12)' }}
          />
        )}

        <span className="relative z-10">{tab.icon}</span>
      </motion.button>

      {/* Tooltip */}
      <div
        className="tooltip absolute left-full top-1/2 -translate-y-1/2 ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
        style={{ fontSize: '11px' }}
      >
        {tab.label}
      </div>
    </div>
  )
}

// ── Activity Bar ─────────────────────────────────────────────────────────────
export default function ActivityBar() {
  // State selectors — fine-grained to prevent cascading re-renders
  const activeSidebarTab = useAppStore((s) => s.activeSidebarTab)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  // Actions — stable references, never trigger re-renders
  const setSidebarTab = useAppStore((s) => s.setSidebarTab)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const toggleAIPanel = useAppStore((s) => s.toggleAIPanel)
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen)

  function handleTabClick(tabId: Tab['id']) {
    if (tabId === 'ai') {
      toggleAIPanel()
      return
    }
    if (tabId === 'settings') {
      const state = useAppStore.getState()
      state.setSelectedFilePath('nexus://settings')
      if (!state.openTabs.includes('nexus://settings')) {
        state.setOpenTabs([...state.openTabs, 'nexus://settings'])
      }
      return
    }

    const st = tabId as SidebarTab
    if (activeSidebarTab === st && sidebarOpen) {
      // Clicking active tab collapses sidebar
      toggleSidebar()
    } else {
      setSidebarTab(st)
      setSidebarOpen(true)
    }
  }

  const topTabs    = TABS.filter((t) => t.position === 'top')
  const bottomTabs = TABS.filter((t) => t.position === 'bottom')

  const isTabActive = (tab: Tab) => {
    if (tab.id === 'ai')       return aiPanelOpen
    if (tab.id === 'settings') return false
    return tab.id === activeSidebarTab && sidebarOpen
  }

  return (
    <div
      className="flex flex-col shrink-0"
      style={{
        width: 48,
        background: '#06070b',
        borderRight: '1px solid rgba(139, 92, 246, 0.08)',
      }}
    >
      {/* Top icon group */}
      <div className="flex flex-col flex-1 pt-1">
        {topTabs.map((tab) => (
          <ActivityIcon
            key={tab.id}
            tab={tab}
            isActive={isTabActive(tab)}
            onClick={() => handleTabClick(tab.id)}
          />
        ))}
      </div>

      {/* Bottom icon group */}
      <div className="flex flex-col pb-2">
        {bottomTabs.map((tab) => (
          <ActivityIcon
            key={tab.id}
            tab={tab}
            isActive={isTabActive(tab)}
            onClick={() => handleTabClick(tab.id)}
          />
        ))}
      </div>
    </div>
  )
}
