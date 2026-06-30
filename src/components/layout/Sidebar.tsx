import { useEffect, useState, useMemo, useCallback, memo, useRef } from 'react'
import { List } from 'react-window'
import { EmptyState } from '../ui/EmptyState'
import {
  FolderOpen, FilePlus, FolderPlus, RefreshCw,
  Search, GitBranch, Bug, Blocks, ChevronRight, Loader2,
  Star, Download, Trash2, Check, Sparkles, Code, Palette, Puzzle,
  LogOut, User
} from 'lucide-react'
import { useAppStore, ExplorerEntry, SearchResult } from '../../store/appStore'
import { loadGitStatus } from '../../lib/gitUtils'
import { useAppModal } from '../ui/ModalDialog'
import { openFile as openFileFs, readDir, invalidateDirCache, onDirCacheInvalidation, IGNORE_DIRS, MAX_DEPTH, MAX_FOLDER_ENTRIES, normalizeDirKey } from '../../lib/fileSystem'
import DatabasePanel from './DatabasePanel'
import { useAuth } from '../../context/AuthProvider'
import GitPanel from '../git/GitPanel'
import { useGitStore, refreshAll } from '../../store/gitStore'

// ── Section Header ────────────────────────────────────────────────────────────
const SectionHeader = memo(function SectionHeader({ title, actions }: {
  title: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2 group shrink-0"
      style={{ borderBottom: '1px solid rgba(139, 92, 246, 0.07)' }}
    >
      <span className="text-[10px] font-semibold tracking-widest text-[#3d4661] uppercase">
        {title}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {actions}
      </div>
    </div>
  )
})

// ── Icon Action Button ────────────────────────────────────────────────────────
const IconBtn = memo(function IconBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="w-5 h-5 flex items-center justify-center text-[#3d4661] hover:text-[#94a3b8] rounded hover:bg-white/[0.05] transition-all"
    >
      {icon}
    </button>
  )
})

// Shared EmptyState component imported above

// ── Tree Types ───────────────────────────────────────────────────────────────
interface FlatNode {
  path: string
  name: string
  depth: number
  isDirectory: boolean
  isLoading: boolean
  isExpanded: boolean
}

// ── Tree Item Row ────────────────────────────────────────────────────────────
const TreeItem = memo(function TreeItem({
  node,
  isSelected,
  onSelect,
  onToggleExpand,
  gitStatus,
}: {
  node: FlatNode
  isSelected: boolean
  onSelect: () => void
  onToggleExpand: () => void
  gitStatus?: { type: 'staged' | 'unstaged' | 'untracked'; status: string } | null
}) {
  const hasUnsavedChanges = useAppStore((s) => s.unsavedChanges[node.path] !== undefined)
  let textColor = isSelected ? 'text-white' : 'text-[#cbd5e1]'
  let textStyle: React.CSSProperties = {}
  
  let badgeLabel = ''
  let badgeColor = ''
  
  if (!isSelected && gitStatus) {
    if (gitStatus.type === 'staged') {
      badgeLabel = gitStatus.status === 'A' ? 'A' : 'M'
      badgeColor = gitStatus.status === 'A' ? '#4ade80' : '#fbbf24'
    } else if (gitStatus.type === 'unstaged') {
      badgeLabel = 'M'
      badgeColor = '#fbbf24'
    } else if (gitStatus.type === 'untracked') {
      badgeLabel = 'U'
      badgeColor = '#4ade80'
    }
    
    textColor = '' // clear tailwind class to apply style color
    textStyle = { color: badgeColor }
  }

  return (
    <div
      className={`flex items-center gap-1 h-7 cursor-pointer text-[12px] rounded group/tree ${
        isSelected ? 'bg-white/5 text-white' : 'hover:bg-white/5'
      } ${textColor}`}
      style={{ paddingLeft: `${8 + node.depth * 16}px`, paddingRight: 8, ...textStyle }}
      onClick={node.isDirectory ? onToggleExpand : onSelect}
      title={node.path}
    >
      {node.isDirectory ? (
        <ChevronRight
          size={12}
          className={`shrink-0 transition-transform duration-150 ${
            node.isExpanded ? 'rotate-90' : ''
          } ${isSelected ? 'text-white' : 'text-[#6b7280]'}`}
        />
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <span className="truncate flex-1 flex items-center gap-1.5">
        <span>{node.name}</span>
        {hasUnsavedChanges && (
          <span 
            className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0 animate-pulse animate-duration-1000" 
            title="Unsaved changes"
          />
        )}
      </span>
      {node.isLoading && <Loader2 size={10} className="animate-spin ml-1 shrink-0 text-[#a78bfa]" />}
      {badgeLabel && (
        <span
          className="text-[9px] font-bold px-1 rounded shrink-0 opacity-80 group-hover/tree:opacity-100 transition-opacity"
          style={{ background: 'rgba(255,255,255,0.05)', color: badgeColor }}
        >
          {badgeLabel}
        </span>
      )}
    </div>
  )
})

// ── Explorer Panel (Virtualized Tree) ────────────────────────────────────────
function TreeRow({ index, style, flatTree, selectedFilePath, onSelectEntry, onToggleExpand, gitStatusMap, rootPath }: {
  index: number
  style: React.CSSProperties
  flatTree: FlatNode[]
  selectedFilePath: string | null
  onSelectEntry: (path: string) => void
  onToggleExpand: (dirPath: string) => void
  gitStatusMap?: Map<string, { type: 'staged' | 'unstaged' | 'untracked'; status: string }>
  rootPath?: string | null
}): React.ReactElement | null {
  const node = flatTree[index]
  
  let gitStatus = null
  if (gitStatusMap && rootPath) {
    const normNode = node.path.replace(/\\/g, '/').replace(/\/$/, '')
    const normRoot = rootPath.replace(/\\/g, '/').replace(/\/$/, '')
    if (normNode.startsWith(normRoot)) {
      let relPath = normNode.slice(normRoot.length)
      if (relPath.startsWith('/')) relPath = relPath.slice(1)
      gitStatus = gitStatusMap.get(relPath)
    }
  }

  return (
    <div style={style}>
      <TreeItem
        node={node}
        isSelected={node.path === selectedFilePath}
        onSelect={() => onSelectEntry(node.path)}
        onToggleExpand={() => onToggleExpand(node.path)}
        gitStatus={gitStatus}
      />
    </div>
  )
}

const ExplorerPanel = memo(function ExplorerPanel({
  rootPath,
  flatTree,
  selectedFilePath,
  onOpenFolder,
  onSelectEntry,
  onToggleExpand,
}: {
  rootPath: string | null
  flatTree: FlatNode[]
  selectedFilePath: string | null
  onOpenFolder: () => void
  onSelectEntry: (path: string) => void
  onToggleExpand: (dirPath: string) => void
}) {
  const staged = useGitStore((s) => s.staged)
  const unstaged = useGitStore((s) => s.unstaged)
  const untracked = useGitStore((s) => s.untracked)

  const gitStatusMap = useMemo(() => {
    const map = new Map<string, { type: 'staged' | 'unstaged' | 'untracked'; status: string }>()
    if (!rootPath) return map
    
    staged.forEach(f => {
      map.set(f.path.replace(/\\/g, '/'), { type: 'staged', status: f.status })
    })
    unstaged.forEach(f => {
      map.set(f.path.replace(/\\/g, '/'), { type: 'unstaged', status: f.status })
    })
    untracked.forEach(p => {
      map.set(p.replace(/\\/g, '/'), { type: 'untracked', status: '?' })
    })
    return map
  }, [staged, unstaged, untracked, rootPath])

  const rowProps = useMemo(() => ({ flatTree, selectedFilePath, onSelectEntry, onToggleExpand, gitStatusMap, rootPath }),
    [flatTree, selectedFilePath, onSelectEntry, onToggleExpand, gitStatusMap, rootPath])

  return (
    <div className="flex flex-col h-full">
      {/* Open editors section */}
      <div>
        <div className="flex items-center gap-1 px-4 py-1.5 cursor-pointer group">
          <ChevronRight size={12} className="text-[#3d4661] group-hover:text-[#6b7280] transition-colors" />
          <span className="text-[10px] font-semibold tracking-widest text-[#3d4661] group-hover:text-[#6b7280] uppercase transition-colors">
            Open Editors
          </span>
        </div>
        <p className="text-[10.5px] text-[#3d4661] px-8 pb-2">
          {selectedFilePath ? selectedFilePath : 'No open files'}
        </p>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(139, 92, 246, 0.07)', margin: '0 0' }} />

      {/* Project explorer — virtualized tree */}
      <div className="flex-1 flex flex-col min-h-0">
        {!rootPath ? (
          <EmptyState
            icon={<FolderOpen size={22} />}
            title="No folder opened"
            subtitle="Open a folder to start exploring your project files"
            cta="Open Folder"
            onCta={onOpenFolder}
          />
        ) : flatTree.length === 0 ? (
          <div className="p-4 text-[10px] text-[#3d4661] text-center">Loading…</div>
        ) : (
          <>
            <p className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-[#3d4661] px-4 pb-1 pt-2 truncate">
              {rootPath}
            </p>
            <div className="flex-1 min-h-0">
              <List<{
                flatTree: FlatNode[]
                selectedFilePath: string | null
                onSelectEntry: (path: string) => void
                onToggleExpand: (dirPath: string) => void
                gitStatusMap: Map<string, { type: 'staged' | 'unstaged' | 'untracked'; status: string }>
                rootPath: string | null
              }>
                rowCount={flatTree.length}
                rowHeight={28}
                rowProps={rowProps}
                rowComponent={TreeRow}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
})

// ── Search Panel ──────────────────────────────────────────────────────────────
const SearchPanel = memo(function SearchPanel({
  rootPath,
  query,
  results,
  isSearching,
  onQueryChange,
  onOpenFolder,
  onSearch,
  onCancel,
  onOpenResult,
}: {
  rootPath: string | null
  query: string
  results: SearchResult[]
  isSearching: boolean
  onQueryChange: (value: string) => void
  onOpenFolder: () => void
  onSearch: () => void
  onCancel: () => void
  onOpenResult: (filePath: string, line?: number) => void
}) {
  const handleSearch = async () => {
    if (!rootPath || !query.trim()) return
    await onSearch()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <div className="flex gap-2">
          <input
            autoFocus
            className="nexus-input text-[11px] flex-1"
            placeholder="Search files..."
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
          />
          <button
            type="button"
            onClick={isSearching ? onCancel : handleSearch}
            className="btn-outline text-[11px] py-1.5 min-w-[54px]"
          >
            {isSearching ? (
              <Loader2 size={12} className="animate-spin inline-block mr-1" />
            ) : null}
            {isSearching ? 'Stop' : 'Find'}
          </button>
        </div>
      </div>

      {!rootPath ? (
        <EmptyState
          icon={<Search size={22} />}
          title="Search across files"
          subtitle="Open a project folder to start searching"
          cta="Open Folder"
          onCta={onOpenFolder}
        />
      ) : results.length === 0 && !isSearching ? (
        <EmptyState
          icon={<Search size={22} />}
          title="No search results"
          subtitle="Try a different query or open a larger folder"
          cta="Search"
          onCta={handleSearch}
        />
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {results.map((result) => (
            <button
              key={`${result.file}:${result.line}`}
              type="button"
              onClick={() => onOpenResult(result.file, result.line)}
              className="w-full text-left px-3 py-2 rounded-lg text-[#cbd5e1] bg-white/5 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center justify-between text-[11px] text-[#94a3b8]">
                <span className="truncate">{result.file}</span>
                <span>Ln {result.line}</span>
              </div>
              <p className="mt-1 text-[12px] text-[#e2e8f0] truncate">{result.text}</p>
            </button>
          ))}
          {isSearching && (
            <div className="text-center text-[10px] text-[#6b7280] py-2">
              Searching... ({results.length} results)
            </div>
          )}
        </div>
      )}
    </div>
  )
})



// ── Debug Panel ───────────────────────────────────────────────────────────────
function DebugPanel() {
  return (
    <EmptyState
      icon={<Bug size={22} />}
      title="No debug configuration"
      subtitle="Open a project to configure and start debugging"
    />
  )
}

// ── Extensions Panel ─────────────────────────────────────────────────────────
// ── Extensions Panel ─────────────────────────────────────────────────────────
const ExtensionsPanel = memo(function ExtensionsPanel() {
  const addNotification = useAppStore((s) => s.addNotification)
  const { prompt, confirm } = useAppModal()
  const [activeTab, setActiveTab] = useState<'installed' | 'marketplace' | 'themes' | 'languages' | 'tools'>('installed')
  const [installedExtensions, setInstalledExtensions] = useState<any[]>([])
  const [marketplaceExtensions, setMarketplaceExtensions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [installingMap, setInstallingMap] = useState<Record<string, boolean>>({})
  const setLicenseStatus = useAppStore((s) => s.setLicenseStatus)

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => clearTimeout(handler)
  }, [searchQuery])

  const loadExtensions = async () => {
    setLoading(true)
    try {
      const installedResponse = await window.electronAPI?.extension.listInstalled()
      const marketplaceResponse = await window.electronAPI?.extension.listMarketplace(debouncedQuery)
      setInstalledExtensions(Array.isArray(installedResponse) ? installedResponse : [])
      setMarketplaceExtensions(Array.isArray(marketplaceResponse) ? marketplaceResponse : [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const refreshInstalled = async () => {
    try {
      const installedResponse = await window.electronAPI?.extension.listInstalled()
      setInstalledExtensions(Array.isArray(installedResponse) ? installedResponse : [])
    } catch (e) {
      console.error(e)
    }
  }

  // Effect to load marketplace extensions on query or tab change
  useEffect(() => {
    const fetchMarketplace = async () => {
      if (activeTab !== 'installed') {
        setLoading(true)
        try {
          const res = await window.electronAPI?.extension.listMarketplace(debouncedQuery)
          setMarketplaceExtensions(Array.isArray(res) ? res : [])
        } catch (e) {
          console.error(e)
        } finally {
          setLoading(false)
        }
      }
    }
    fetchMarketplace()
  }, [debouncedQuery, activeTab])

  // Initial load
  useEffect(() => {
    loadExtensions()
  }, [])

  const installLocalExtension = async () => {
    const result = await window.electronAPI?.extension.installLocal()
    if (result && !(result as any).error) {
      const manifest = (result as any).manifest ?? (result as any).contributes ?? null
      const allowed = await window.electronAPI?.license.canInstallExtension(manifest)
      if (!allowed) {
        addNotification('This extension requires a Pro or Ultimate license.', 'warning')
        return
      }
      await refreshInstalled()
      addNotification('Extension installed successfully.', 'success')
      try {
        const rec = await window.electronAPI?.license.recordExtensionInstall({ id: (result as any).id ?? null })
        if (rec && !(rec as any).error) {
          if ((rec as any).plan) setLicenseStatus(rec as any)
          else {
            const s = await window.electronAPI?.license.status()
            if (s && !(s as any).error) setLicenseStatus(s as any)
          }
        }
      } catch (e) {}
    } else {
      addNotification(`Install failed: ${(result as any).error ?? 'Unknown error'}`, 'error')
    }
  }

  const handleInstall = async (extensionId: string) => {
    const allowed = await window.electronAPI?.license.canInstallExtension({ id: extensionId })
    if (!allowed) {
      addNotification('This extension requires a Pro or Ultimate license.', 'warning')
      return
    }
    setInstallingMap((prev) => ({ ...prev, [extensionId]: true }))
    try {
      const response = await window.electronAPI?.extension.installMarketplace(extensionId)
      if (response && !(response as any).error) {
        await refreshInstalled()
        addNotification('Marketplace extension installed successfully.', 'success')
        try {
          const rec = await window.electronAPI?.license.recordExtensionInstall({ id: extensionId })
          if (rec && !(rec as any).error) {
            if ((rec as any).plan) setLicenseStatus(rec as any)
            else {
              const s = await window.electronAPI?.license.status()
              if (s && !(s as any).error) setLicenseStatus(s as any)
            }
          }
        } catch (e) {}
      } else {
        addNotification(`Install failed: ${(response as any).error ?? 'Unknown error'}`, 'error')
      }
    } catch (e: any) {
      addNotification(`Install failed: ${e.message || e}`, 'error')
    } finally {
      setInstallingMap((prev) => ({ ...prev, [extensionId]: false }))
    }
  }

  const toggleExtension = async (extensionId: string, enable: boolean) => {
    const response = enable
      ? await window.electronAPI?.extension.enable(extensionId)
      : await window.electronAPI?.extension.disable(extensionId)

    if (response && !(response as any).error) {
      await refreshInstalled()
    } else {
      addNotification(`Unable to ${enable ? 'enable' : 'disable'} extension: ${(response as any).error ?? 'Unknown error'}`, 'error')
    }
  }

  const uninstallExtension = async (extensionId: string) => {
    const shouldRemove = await confirm({
      title: 'Remove this extension?',
      message: 'Remove this extension from the app? This action cannot be undone.',
      confirmText: 'Remove',
      cancelText: 'Cancel',
    })
    if (!shouldRemove) return
    const response = await window.electronAPI?.extension.uninstall(extensionId)
    if (response && !(response as any).error) {
      await refreshInstalled()
      addNotification('Extension removed successfully.', 'success')
    } else {
      addNotification(`Uninstall failed: ${(response as any).error ?? 'Unknown error'}`, 'error')
    }
  }

  const getInstalledStatus = (extId: string) => {
    return installedExtensions.find((item) => item.id === extId)
  }

  const isTheme = (ext: any) => {
    const text = `${ext.name} ${ext.description || ''} ${ext.id}`.toLowerCase()
    return text.includes('theme') || text.includes('color') || ext.id.toLowerCase().includes('theme')
  }

  const isLanguage = (ext: any) => {
    const text = `${ext.name} ${ext.description || ''} ${ext.id}`.toLowerCase()
    return text.includes('language') || text.includes('lsp') || text.includes('python') || 
           text.includes('javascript') || text.includes('typescript') || text.includes('ruby') || 
           text.includes('java') || text.includes('php') || text.includes('rust') || text.includes('compiler') ||
           text.includes('syntax') || text.includes('autocomplete') || text.includes('linter') || text.includes('formatter')
  }

  // Filter local or remote list
  const filteredExtensions = useMemo(() => {
    if (activeTab === 'installed') {
      return installedExtensions.filter((ext) => {
        const q = searchQuery.toLowerCase()
        return !q || ext.name.toLowerCase().includes(q) || 
               (ext.description && ext.description.toLowerCase().includes(q)) ||
               ext.id.toLowerCase().includes(q)
      })
    }
    
    // Remote lists are already query-filtered from the API. We apply category filters here.
    if (activeTab === 'themes') {
      return marketplaceExtensions.filter(isTheme)
    }
    if (activeTab === 'languages') {
      return marketplaceExtensions.filter(isLanguage)
    }
    if (activeTab === 'tools') {
      return marketplaceExtensions.filter((ext) => !isTheme(ext) && !isLanguage(ext))
    }
    
    return marketplaceExtensions
  }, [activeTab, installedExtensions, marketplaceExtensions, searchQuery])

  // Custom helper to render icons
  const renderIcon = (extension: any) => {
    if (extension.iconUrl) {
      return (
        <img
          src={extension.iconUrl}
          alt={extension.name}
          className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 object-contain flex-shrink-0"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      )
    }
    const initials = (extension.name || 'EX').slice(0, 2).toUpperCase()
    return (
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-300 font-semibold text-[11px] flex-shrink-0 select-none">
        {initials}
      </div>
    )
  }

  const getTags = (extension: any) => {
    const tags: string[] = []
    const text = `${extension.name} ${extension.description || ''} ${extension.id}`.toLowerCase()
    if (text.includes('theme') || text.includes('color')) tags.push('Theme')
    if (text.includes('python')) tags.push('Python')
    if (text.includes('javascript') || text.includes('typescript') || text.includes('js') || text.includes('ts')) tags.push('JS/TS')
    if (text.includes('git')) tags.push('Git')
    if (text.includes('ai') || text.includes('copilot') || text.includes('llm')) tags.push('AI')
    if (text.includes('debug') || text.includes('debugger')) tags.push('Debugger')
    if (tags.length === 0) {
      if (text.includes('lsp') || text.includes('language')) tags.push('Language')
      else tags.push('Tool')
    }
    return tags.slice(0, 1) // Only show 1 tag to keep card extremely clean
  }

  const renderRating = (rating?: number) => {
    if (rating === undefined || rating === null) return null
    return (
      <div className="flex items-center gap-0.5 text-[9px] text-amber-400 font-medium">
        <Star size={8} className="fill-amber-400 stroke-amber-400" />
        <span>{Number(rating).toFixed(1)}</span>
      </div>
    )
  }

  const formatDownloads = (count?: number) => {
    if (count === undefined || count === null) return null
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
    if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`
    return count.toString()
  }

  const renderDownloads = (count?: number) => {
    const formatted = formatDownloads(count)
    if (!formatted) return null
    return (
      <div className="flex items-center gap-0.5 text-[9px] text-[#6b7280]">
        <Download size={8} />
        <span>{formatted}</span>
      </div>
    )
  }

  const renderActionButton = (ext: any) => {
    const installed = getInstalledStatus(ext.id)
    const isInstalling = installingMap[ext.id]

    if (isInstalling) {
      return (
        <button
          disabled
          className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/25 text-purple-300 text-[9.5px] font-medium flex items-center gap-1 cursor-default"
        >
          <Loader2 size={8} className="animate-spin" />
          <span>Installing</span>
        </button>
      )
    }

    if (installed) {
      return (
        <div className="flex items-center gap-1">
          <span className="text-emerald-400 flex items-center gap-0.5 text-[9.5px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 select-none">
            <Check size={8} strokeWidth={3} />
            <span>Installed</span>
          </span>
          <button
            onClick={() => uninstallExtension(ext.id)}
            title="Uninstall Extension"
            className="p-0.5 rounded bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 text-[#94a3b8] transition-all"
          >
            <Trash2 size={9} />
          </button>
        </div>
      )
    }

    return (
      <button
        onClick={() => handleInstall(ext.id)}
        className="px-2.5 py-0.5 rounded bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border border-indigo-500/30 text-white text-[9.5px] font-medium transition-all hover:scale-[1.03]"
      >
        Install
      </button>
    )
  }

  const renderEmptyState = () => {
    let title = "No extensions found"
    let subtitle = "Try a different search query or category"
    if (activeTab === 'installed') {
      title = "No installed extensions"
      subtitle = "Install from the marketplace or a local folder"
      return (
        <EmptyState
          icon={<Blocks size={22} />}
          title={title}
          subtitle={subtitle}
          cta="Install Local"
          onCta={installLocalExtension}
        />
      )
    }
    return (
      <EmptyState
        icon={<Blocks size={22} />}
        title={title}
        subtitle={subtitle}
      />
    )
  }

  const LoadingSkeleton = () => (
    <div className="space-y-1.5 animate-pulse">
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} className="flex items-center justify-between p-2 rounded-xl bg-white/[0.01] border border-white/[0.04] h-[62px]">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-lg bg-white/5 flex-shrink-0" />
            <div className="min-w-0 space-y-1 flex-1 pr-2">
              <div className="h-2.5 w-1/3 bg-white/10 rounded" />
              <div className="h-1.5 w-1/5 bg-white/5 rounded" />
              <div className="h-1.5 w-2/3 bg-white/5 rounded" />
            </div>
          </div>
          <div className="w-12 h-5 bg-white/5 rounded flex-shrink-0" />
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]/40">
      {/* Search Header Row */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <div className="relative flex-1">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6b7280]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search extensions..."
            className="w-full pl-7 pr-3 py-1 bg-white/[0.02] border border-white/10 rounded-md text-[11px] text-white placeholder-[#555] focus:outline-none focus:border-[#a855f7]/40 focus:ring-1 focus:ring-[#a855f7]/20 transition-all font-medium"
          />
        </div>
        
        <button
          type="button"
          onClick={installLocalExtension}
          title="Install Local Extension"
          className="flex-shrink-0 p-1 rounded-md bg-white/[0.02] border border-white/10 hover:bg-white/5 text-[#94a3b8] hover:text-white transition-all"
        >
          <Puzzle size={13} />
        </button>
        
        <button
          type="button"
          onClick={loadExtensions}
          title="Refresh Extensions"
          className="flex-shrink-0 p-1 rounded-md bg-white/[0.02] border border-white/10 hover:bg-white/5 text-[#94a3b8] hover:text-white transition-all"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs list selector */}
      <div 
        className="flex items-center gap-1 px-3 pb-2 overflow-x-auto border-b border-white/[0.04]"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {[
          { id: 'installed', label: 'Installed' },
          { id: 'marketplace', label: 'Marketplace' },
          { id: 'themes', label: 'Themes' },
          { id: 'languages', label: 'Language' },
          { id: 'tools', label: 'Tools' }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-shrink-0 rounded px-2 py-0.5 text-[10px] font-medium border transition-all ${
              activeTab === tab.id
                ? 'bg-[#a855f7]/10 text-[#c084fc] border-[#a855f7]/20'
                : 'bg-transparent border-transparent text-[#6b7280] hover:text-[#94a3b8]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Extensions Cards Container */}
      <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-1.5">
        {loading ? (
          <LoadingSkeleton />
        ) : filteredExtensions.length === 0 ? (
          renderEmptyState()
        ) : (
          <div className="space-y-1.5">
            {filteredExtensions.map((extension) => {
              const installed = getInstalledStatus(extension.id)
              const tags = getTags(extension)
              
              return (
                <div
                  key={extension.id}
                  className="group relative flex items-center justify-between gap-2.5 p-2 rounded-xl bg-white/[0.01] border border-white/[0.05] hover:border-purple-500/20 hover:bg-white/[0.03] transition-all duration-200 h-[62px]"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 h-full">
                    {/* Left: Icon */}
                    {renderIcon(extension)}
                    
                    {/* Center: Details */}
                    <div className="flex flex-col justify-between min-w-0 flex-1 h-full py-0.5">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[11px] font-semibold text-white truncate group-hover:text-[#c084fc] transition-colors">
                          {extension.name}
                        </span>
                        {extension.downloadCount > 100_000 && (
                          <span className="text-sky-400 flex-shrink-0" title="Popular Extension">
                            <Check size={8} className="fill-sky-400/10 stroke-sky-400" strokeWidth={3.5} />
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1 text-[9.5px] text-[#6b7280] min-w-0">
                        <span className="font-medium truncate max-w-[65px] flex-shrink-0">{extension.publisher || 'VS Code'}</span>
                        <span className="text-[8px] flex-shrink-0">•</span>
                        <span className="truncate flex-1" title={extension.description}>{extension.description || 'No description'}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        {tags.map((t) => (
                          <span key={t} className="text-[8px] px-1 bg-[#8b5cf6]/5 text-[#c084fc] rounded border border-[#8b5cf6]/10 leading-none py-0.2">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: Version, rating, downloads, action */}
                  <div className="flex flex-col items-end justify-between h-full min-w-[64px] text-right flex-shrink-0 py-0.5">
                    <span className="text-[8.5px] text-[#6b7280] font-mono leading-none">{extension.version}</span>
                    
                    <div className="flex items-center gap-1 leading-none select-none">
                      {renderRating(extension.averageRating)}
                      {extension.averageRating && extension.downloadCount && <span className="text-[#6b7280] text-[8px]">•</span>}
                      {renderDownloads(extension.downloadCount)}
                    </div>
                    
                    {activeTab === 'installed' ? (
                      <div className="flex items-center gap-1 leading-none">
                        <button
                          type="button"
                          onClick={() => toggleExtension(extension.id, !extension.enabled)}
                          className={`px-1.5 py-0.5 rounded text-[8.5px] font-medium border transition-all leading-none ${
                            extension.enabled
                              ? 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/25'
                          }`}
                        >
                          {extension.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => uninstallExtension(extension.id)}
                          className="p-0.5 rounded bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 text-[#94a3b8] transition-all leading-none"
                        >
                          <Trash2 size={9} />
                        </button>
                      </div>
                    ) : (
                      renderActionButton(extension)
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
})

// ── Sidebar ───────────────────────────────────────────────────────────────────
const PANEL_TITLES: Record<string, string> = {
  explorer:   'Explorer',
  search:     'Search',
  git:        'Source Control',
  debug:      'Run & Debug',
  extensions: 'Extensions',
  settings:   'Settings',
}

// Settings panel moved to EditorArea

export default memo(function Sidebar() {
  // ✨ Performance: Use sliced selectors instead of destructuring entire store
  const activeSidebarTab = useAppStore((s) => s.activeSidebarTab)
  const rootPath = useAppStore((s) => s.rootPath)
  const selectedFilePath = useAppStore((s) => s.selectedFilePath)
  const gitBranch = useAppStore((s) => s.gitBranch)
  const gitStatusSummary = useAppStore((s) => s.gitStatusSummary)
  const searchQuery = useAppStore((s) => s.searchQuery)
  const searchResults = useAppStore((s) => s.searchResults)
  
  // Get action creators
  const setRootPath = useAppStore((s) => s.setRootPath)
  const setCurrentFolder = useAppStore((s) => s.setCurrentFolder)
  const setExplorerEntries = useAppStore((s) => s.setExplorerEntries)
  const setSelectedFilePath = useAppStore((s) => s.setSelectedFilePath)
  const setSelectedLineNumber = useAppStore((s) => s.setSelectedLineNumber)
  const openTabs = useAppStore((s) => s.openTabs)
  const setOpenTabs = useAppStore((s) => s.setOpenTabs)
  const setSearchQuery = useAppStore((s) => s.setSearchQuery)
  const setSearchResults = useAppStore((s) => s.setSearchResults)
  const clearProject = useAppStore((s) => s.clearProject)
  const addNotification = useAppStore((s) => s.addNotification)
  const { prompt, confirm } = useAppModal()

  // ── Search state ──────────────────────────────────────────────────────────
  const [isSearching, setIsSearching] = useState(false)
  const searchIdRef = useRef<string | null>(null)
  const accumulatedResultsRef = useRef<SearchResult[]>([])

  // Subscribe to streaming search events
  useEffect(() => {
    const unsubResult = window.electronAPI?.search.onResult((searchId, results) => {
      if (searchId === searchIdRef.current) {
        accumulatedResultsRef.current = [...accumulatedResultsRef.current, ...results]
        setSearchResults(accumulatedResultsRef.current)
      }
    })
    const unsubDone = window.electronAPI?.search.onDone((searchId, totalResults) => {
      if (searchId === searchIdRef.current) {
        searchIdRef.current = null
        setIsSearching(false)
        // Ensure final state is set
        setSearchResults(accumulatedResultsRef.current)
      }
    })
    const unsubError = window.electronAPI?.search.onError((searchId, error) => {
      if (searchId === searchIdRef.current) {
        searchIdRef.current = null
        setIsSearching(false)
        addNotification(`Search error: ${error}`, 'error')
      }
    })
    return () => {
      unsubResult?.()
      unsubDone?.()
      unsubError?.()
    }
  }, [addNotification, setSearchResults])

  // ── Directory cache (LRU, max 200 dirs) ──────────────────────────────────
  const dirCacheRef = useRef<Map<string, ExplorerEntry[]>>(new Map())
  // Dedup: Map<normPath, Promise> so concurrent callers share ONE IPC call
  const pendingFetchRef = useRef<Map<string, Promise<ExplorerEntry[] | null>>>(new Map())
  const MAX_CACHED_DIRS = 200

  const cacheDirEntries = useCallback((norm: string, entries: ExplorerEntry[]) => {
    const sorted = [...entries].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    const seen = new Set<string>()
    const unique = sorted.filter((e) => {
      if (e.isDirectory && IGNORE_DIRS.has(e.name)) return false
      const key = e.path.replace(/[/\\]$/, '').toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const map = dirCacheRef.current
    if (map.has(norm)) map.delete(norm)
    map.set(norm, unique)
    if (map.size > MAX_CACHED_DIRS) {
      const oldest = map.keys().next().value
      if (oldest !== undefined) map.delete(oldest)
    }
  }, [])

  const expandedMap = useAppStore((s) => s.expandedFolders)
  const setExpandedMap = useAppStore((s) => s.setExpandedFolders)
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})

  // ── Subscribe to cache invalidation from fileSystem.ts ────────────────────
  useEffect(() => {
    const unsub = onDirCacheInvalidation((invalidatedNorms) => {
      const map = dirCacheRef.current
      let affected = false
      if (invalidatedNorms.length === 0) {
        map.clear()
        affected = true
      } else {
        for (const norm of invalidatedNorms) {
          // Also invalidate all children of this path
          for (const key of map.keys()) {
            if (key === norm || key.startsWith(norm + '/')) {
              map.delete(key)
              affected = true
            }
          }
        }
      }
      if (affected) {
        // Re-seed root so the tree updates
        if (rootPath) seedRootDir(rootPath)
      }
    })
    return unsub
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath])

  const getPathSeparator = (value: string) => (value.includes('\\') ? '\\' : '/')
  const ensureTrailingSeparator = (value: string) => {
    const sep = getPathSeparator(value)
    return value.endsWith(sep) ? value : `${value}${sep}`
  }
  const joinPath = (base: string, next: string) => `${ensureTrailingSeparator(base)}${next}`

  // ── Directory loading with dedup + retry ──────────────────────────────────
  const loadDirIntoCache = useCallback(async (dirPath: string): Promise<ExplorerEntry[] | null> => {
    const norm = normalizeDirKey(dirPath)
    const pendingMap = pendingFetchRef.current

    // Cache hit — already loaded
    if (dirCacheRef.current.has(norm)) return dirCacheRef.current.get(norm) ?? null

    // Dedup — share existing in-flight promise
    if (pendingMap.has(norm)) {
      return pendingMap.get(norm)!
    }

    const fetchWithRetryAndTimeout = async (retries = 3): Promise<ExplorerEntry[] | null> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const readPromise = readDir(dirPath, { silent: true })
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Directory read timed out')), 5000)
          )
          const raw = await Promise.race([readPromise, timeoutPromise])
          if (!raw) {
            if (attempt === retries) return null
            continue
          }
          const entries = raw as unknown as ExplorerEntry[]
          cacheDirEntries(norm, entries)
          return dirCacheRef.current.get(norm) ?? entries
        } catch (err) {
          console.warn(`[Sidebar] Directory read attempt ${attempt + 1} failed for ${norm}:`, err)
          if (attempt === retries) return null
        }
      }
      return null
    }

    // Mark this directory as loading so the tree row shows a spinner and
    // the flat-node walk does not try to recurse into unpopulated children.
    setLoadingMap((prev) => ({ ...prev, [norm]: true }))

    const promise = fetchWithRetryAndTimeout().finally(() => {
      pendingMap.delete(norm)
      // Clear the loading indicator regardless of success or failure
      setLoadingMap((prev) => {
        const next = { ...prev }
        delete next[norm]
        return next
      })
    })

    pendingMap.set(norm, promise)
    return promise
  }, [cacheDirEntries])

  // Seed the cache with root-level entries when rootPath changes
  const seedRootDir = useCallback(async (dirPath: string | null) => {
    if (!dirPath) return
    const entries = await loadDirIntoCache(dirPath)
    if (!entries) return
    setExpandedMap((prev) => ({ ...prev }))
    setExplorerEntries(entries)
  }, [loadDirIntoCache, setExplorerEntries])

  useEffect(() => {
    seedRootDir(rootPath)
  }, [rootPath, seedRootDir])


  // ✨ Performance: Memoize async handlers to prevent re-renders when passed to memoized children
  const loadDirectory = useCallback(async (folderPath: string) => {
    const norm = normalizeDirKey(folderPath)
    // Bust cache for this dir and all children
    const map = dirCacheRef.current
    for (const key of map.keys()) {
      if (key === norm || key.startsWith(norm + '/')) map.delete(key)
    }
    const entries = await loadDirIntoCache(folderPath)
    if (!entries) return

    setRootPath(folderPath)
    setCurrentFolder(folderPath)
    setExplorerEntries(entries)
    setSelectedFilePath(null)

    await loadGitStatus(folderPath)
    refreshAll(folderPath).catch(() => {})
    setExpandedMap((prev) => ({ ...prev }))
  }, [loadDirIntoCache, setRootPath, setCurrentFolder, setExplorerEntries, setSelectedFilePath])

  // ── Lazy expand/collapse a directory in the tree ─────────────────────────
  const toggleExpand = useCallback(async (dirPath: string) => {
    const norm = normalizeDirKey(dirPath)
    if (expandedMap[norm]) {
      // Collapse: just remove from expandedMap — do NOT evict children from cache
      setExpandedMap((prev) => {
        const next = { ...prev }
        delete next[norm]
        return next
      })
      return
    }
    // Only load children on expand (lazy)
    if (!dirCacheRef.current.has(norm)) {
      setLoadingMap((prev) => ({ ...prev, [norm]: true }))
      await loadDirIntoCache(dirPath)
      setLoadingMap((prev) => {
        const next = { ...prev }
        delete next[norm]
        return next
      })
    }
    setExpandedMap((prev) => ({ ...prev, [norm]: true }))
  }, [expandedMap, loadDirIntoCache])

  const openFolder = useCallback(async () => {
    const folderPath = await window.electronAPI?.dialog.openFolder()
    if (folderPath) {
      if ((window as any).loadDirectory) {
        await (window as any).loadDirectory(folderPath)
      } else {
        await loadDirectory(folderPath)
      }
    }
  }, [loadDirectory])

  const createFile = useCallback(async () => {
    const filePath = await window.electronAPI?.dialog.createFile()
    if (!filePath) return
    const dir = filePath.replace(/[/\\][^/\\]+$/, '')
    invalidateDirCache(dir)
    try {
      await openFileFs(filePath)
    } catch (err) {
      addNotification(`Unable to open created file: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [addNotification])

  const createFolder = useCallback(async () => {
    const name = (await prompt({
      title: 'New folder name',
      message: 'Enter a name for the new folder.',
      placeholder: 'Folder name',
      confirmText: 'Create',
      cancelText: 'Cancel',
    }))?.trim()
    if (!name || !rootPath) return
    const folderPath = `${ensureTrailingSeparator(rootPath)}${name}`
    await window.electronAPI?.invoke('fs:createFolder', folderPath)
    invalidateDirCache(rootPath)
  }, [rootPath, prompt]) // prompt is from useAppModal

  const refreshFolder = useCallback(async () => {
    if (!rootPath) return
    const norm = normalizeDirKey(rootPath)
    const map = dirCacheRef.current
    for (const key of map.keys()) {
      if (key === norm || key.startsWith(norm + '/')) map.delete(key)
    }
    setExpandedMap({})
    invalidateDirCache(rootPath)
  }, [rootPath])

  const openFile = useCallback(async (filePath: string) => {
    try {
      await openFileFs(filePath)
    } catch (err) {
      addNotification(`Unable to read file: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [addNotification])

  const selectEntry = useCallback(async (entryPath: string) => {
    console.log("Clicked file:", entryPath)
    await openFile(entryPath)
  }, [openFile])

  const openSearchResult = useCallback(async (filePath: string, line?: number) => {
    await openFile(filePath)
    if (line !== undefined) {
      setSelectedLineNumber(line)
    }
  }, [openFile, setSelectedLineNumber])

  // ── Flatten visible tree for virtualization ──────────────────────────────
  const flatTree = useMemo(() => {
    if (!rootPath) return []
    const norm = normalizeDirKey(rootPath)
    const rootChildren = dirCacheRef.current.get(norm)
    if (!rootChildren) return []

    const result: FlatNode[] = []

    function walk(entries: ExplorerEntry[], depth: number) {
      // Enforce max depth — collapsed dirs beyond this point show no children
      if (depth > MAX_DEPTH) return

      for (const entry of entries) {
        // Client-side IGNORE_DIRS filter (belt-and-suspenders)
        if (entry.isDirectory && IGNORE_DIRS.has(entry.name)) continue

        const key = normalizeDirKey(entry.path)
        const isExpanded = !!expandedMap[key]
        const isLoading = !!loadingMap[key]

        result.push({
          path: entry.path,
          name: entry.name,
          depth,
          isDirectory: entry.isDirectory,
          isLoading,
          isExpanded,
        })

        // Only recurse into expanded, non-loading dirs
        if (entry.isDirectory && isExpanded && !isLoading) {
          const children = dirCacheRef.current.get(key)
          if (children) walk(children, depth + 1)
        }
      }
    }

    walk(rootChildren, 0)
    return result
  }, [rootPath, expandedMap, loadingMap])

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        width: 240,
        background: '#0a0b10',
      }}
    >
      <SectionHeader
        title={PANEL_TITLES[activeSidebarTab] ?? 'Explorer'}
        actions={
          activeSidebarTab === 'explorer' ? (
            <>
              <IconBtn icon={<FilePlus size={13} />} title="New File" onClick={createFile} />
              <IconBtn icon={<FolderPlus size={13} />} title="New Folder" onClick={createFolder} />
              <IconBtn icon={<RefreshCw size={12} />} title="Refresh" onClick={refreshFolder} />
            </>
          ) : null
        }
      />

      <div className="flex-1 overflow-hidden">
        {activeSidebarTab === 'explorer' && (
          <ExplorerPanel
            rootPath={rootPath}
            flatTree={flatTree}
            selectedFilePath={selectedFilePath}
            onOpenFolder={openFolder}
            onSelectEntry={selectEntry}
            onToggleExpand={toggleExpand}
          />
        )}
        {activeSidebarTab === 'search' && (
          <SearchPanel
            rootPath={rootPath}
            query={searchQuery}
            results={searchResults}
            isSearching={isSearching}
            onQueryChange={setSearchQuery}
            onOpenFolder={openFolder}
            onSearch={async () => {
              if (!rootPath || !searchQuery.trim()) return
              // Cancel any previous search
              if (searchIdRef.current) {
                window.electronAPI?.search.cancel(searchIdRef.current)
              }
              accumulatedResultsRef.current = []
              setSearchResults([])
              setIsSearching(true)
              const response = await window.electronAPI?.search.find(rootPath, searchQuery.trim(), false)
              if (response) {
                searchIdRef.current = response.searchId
              } else {
                setIsSearching(false)
              }
            }}
            onCancel={() => {
              if (searchIdRef.current) {
                window.electronAPI?.search.cancel(searchIdRef.current)
                searchIdRef.current = null
                setIsSearching(false)
              }
            }}
            onOpenResult={openSearchResult}
          />
        )}
        {activeSidebarTab === 'git' && (
          <GitPanel rootPath={rootPath} />
        )}
        {activeSidebarTab === 'debug' && <DebugPanel />}
        {activeSidebarTab === 'extensions' && <ExtensionsPanel />}
        {/* Settings now opens in main editor area */}
        {activeSidebarTab === 'database' && <DatabasePanel />}
      </div>
    </div>
  )
})
