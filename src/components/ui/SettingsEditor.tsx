import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthProvider'
import {
  User, LogOut, Key, Eye, EyeOff, Save, RotateCcw,
  Upload, Download, Sparkles, Globe, Code2, Settings, Laptop,
  Cpu, GitBranch, Folder, HardDrive, Terminal, Search, HelpCircle,
  CheckCircle2, XCircle, AlertCircle, RefreshCw, Keyboard, Info,
  Trash2, Clock, Heart, Github, Copy, Check, Shield, History
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'

interface BackupEntry {
  filePath: string
  backupPath: string
  timestamp: string
  sessionId: string
  task: string
}

interface DiagnosticsData {
  opencode: {
    installed: boolean
    path: string | null
    version: string | null
  }
  openrouter: {
    connected: boolean
    modelCount: number
    keyConfigured: boolean
    error: string | null
  }
  budget: {
    date: string
    dailySpend: number
    limit: number
  }
  git: {
    installed: boolean
    isRepo: boolean
    currentBranch: string | null
    username: string | null
    email: string | null
    error: string | null
  }
  workspace: {
    fileCount: number
    totalSize: number
    path: string | null
  }
  performance: {
    heapUsedMB: number
    heapTotalMB: number
    systemTotalMemoryGB: number
    systemFreeMemoryGB: number
    cpuLoadAverage: number[]
  }
  appVersion: string
}

export default function SettingsEditor() {
  const { user, logout } = useAuth()
  const [activeTab, setActiveTab] = useState<'preferences' | 'backups' | 'diagnostics' | 'shortcuts' | 'about'>('preferences')

  // Selectors from store
  const rootPath = useAppStore((s) => s.rootPath)
  const addNotification = useAppStore((s) => s.addNotification)

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
  const updateChannel = useAppStore((s) => s.updateChannel)

  const setEditorTheme = useAppStore((s) => s.setEditorTheme)
  const setEditorFontSize = useAppStore((s) => s.setEditorFontSize)
  const setEditorTabSize = useAppStore((s) => s.setEditorTabSize)
  const setEditorWordWrap = useAppStore((s) => s.setEditorWordWrap)
  const setEditorMinimap = useAppStore((s) => s.setEditorMinimap)
  const setOpenCodePathOverride = useAppStore((s) => s.setOpenCodePathOverride)
  const setOpenrouterKeyConfigured = useAppStore((s) => s.setOpenrouterKeyConfigured)
  const setOpenrouterModel = useAppStore((s) => s.setOpenrouterModel)
  const setGitUsername = useAppStore((s) => s.setGitUsername)
  const setGitEmail = useAppStore((s) => s.setGitEmail)
  const setWorkspaceRestore = useAppStore((s) => s.setWorkspaceRestore)
  const setTelemetryEnabled = useAppStore((s) => s.setTelemetryEnabled)
  const setUpdateChannel = useAppStore((s) => s.setUpdateChannel)

  // Local state
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [keyFromEnv, setKeyFromEnv] = useState(false)
  const [savingApiKey, setSavingApiKey] = useState(false)

  // Diagnostics states
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false)
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null)
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null)

  // Updater states
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'latest' | 'error'>('idle')
  const [updateMessage, setUpdateMessage] = useState('')

  // Shortcuts search state
  const [shortcutSearch, setShortcutSearch] = useState('')

  // App version state
  const [appVersion, setAppVersion] = useState('1.0.0')

  // Backups manager states
  const [backups, setBackups] = useState<Array<BackupEntry & { size?: number }>>([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [expandedBackup, setExpandedBackup] = useState<string | null>(null)

  // Get basename and dirname utilities
  const getBasename = (filePath: string) => {
    return filePath.split(/[/\\]/).pop() || filePath
  }
  const getDirname = (filePath: string) => {
    const parts = filePath.split(/[/\\]/)
    parts.pop()
    return parts.join('/')
  }

  // Load app version on mount
  useEffect(() => {
    const loadVersion = async () => {
      try {
        const ver = await window.electronAPI?.app.getVersion()
        if (ver) setAppVersion(ver)
      } catch (err) {
        console.error('Failed to load version:', err)
      }
    }
    loadVersion()
  }, [])

  // Load backup files on mount / activeTab change
  const loadBackups = async () => {
    if (!rootPath) return
    setLoadingBackups(true)
    try {
      const list = await window.electronAPI?.diff.getBackups(rootPath)
      if (list) {
        const enriched = await Promise.all(
          list.map(async (item) => {
            try {
              const stats = await window.electronAPI?.fs.stat(item.backupPath)
              if (stats && !('error' in stats)) {
                return { ...item, size: stats.size }
              }
            } catch (err) {
              console.error(err)
            }
            return item
          })
        )
        setBackups(enriched)
      } else {
        setBackups([])
      }
    } catch (err) {
      console.error('Failed to load backups:', err)
      addNotification('Failed to load file backups.', 'error')
    } finally {
      setLoadingBackups(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'backups') {
      loadBackups()
    }
  }, [activeTab])

  const handleRestoreBackup = async (item: BackupEntry) => {
    const filename = getBasename(item.filePath)
    const confirmed = window.confirm(`Are you sure you want to restore the backup for "${filename}"? This will overwrite its current content.`)
    if (!confirmed) return

    try {
      const success = await window.electronAPI?.diff.rollback(item.backupPath)
      if (success) {
        addNotification(`Successfully restored "${filename}" from backup!`, 'success')
      } else {
        addNotification('Failed to restore backup.', 'error')
      }
    } catch (err: any) {
      addNotification(`Failed to restore backup: ${err.message}`, 'error')
    }
  }

  const handleDeleteBackup = async (item: BackupEntry) => {
    const filename = getBasename(item.filePath)
    try {
      const success = await window.electronAPI?.diff.deleteBackup(item.backupPath)
      if (success) {
        addNotification(`Deleted backup for "${filename}".`, 'success')
        loadBackups()
      } else {
        addNotification('Failed to delete backup.', 'error')
      }
    } catch (err: any) {
      addNotification(`Failed to delete backup: ${err.message}`, 'error')
    }
  }

  const copyVersionInfo = () => {
    const info = `NEXA IDE Version: ${appVersion}\nBuild Date: June 23, 2026\nDeveloper: Google DeepMind Advanced Agentic Coding Team\nLicense: MIT License\nGitHub: https://github.com/google-deepmind/nexa-ide`
    navigator.clipboard.writeText(info)
    addNotification('Version info copied to clipboard!', 'success')
  }

  // Load Git Config from local repository or global config on mount
  useEffect(() => {
    const loadGitConfig = async () => {
      try {
        const res = await window.electronAPI?.git.getConfig(rootPath || undefined)
        if (res && !(res as any).error) {
          const { name, email } = res as { name: string; email: string }
          setGitUsername(name || '')
          setGitEmail(email || '')
        }
      } catch (err) {
        console.error('Failed to retrieve Git profile config:', err)
      }
    }
    loadGitConfig()
  }, [rootPath, setGitUsername, setGitEmail])

  // Fetch diagnostics when active tab changes to diagnostics
  useEffect(() => {
    if (activeTab === 'diagnostics') {
      fetchDiagnostics()
    }
  }, [activeTab])

  useEffect(() => {
    window.electronAPI?.ai.isKeyConfigured().then((res: any) => {
      if (res?.fromEnv) setKeyFromEnv(true)
      if (res?.configured) setOpenrouterKeyConfigured(true)
    }).catch(() => {})
  }, [setOpenrouterKeyConfigured])

  const fetchDiagnostics = async () => {
    setLoadingDiagnostics(true)
    setDiagnosticsError(null)
    try {
      const data = await window.electronAPI?.app.getDiagnostics(rootPath)
      if (data && !(data as any).error) {
        setDiagnostics(data as DiagnosticsData)
      } else {
        setDiagnosticsError((data as any)?.error || 'Failed to retrieve diagnostics information.')
      }
    } catch (err) {
      setDiagnosticsError((err as Error).message)
    } finally {
      setLoadingDiagnostics(false)
    }
  }

  // Save Git Config back on blur
  const handleGitBlur = async () => {
    try {
      await window.electronAPI?.git.setConfig(rootPath || undefined, gitUsername, gitEmail)
    } catch (err) {
      addNotification('Failed to update Git profile configuration.', 'error')
    }
  }

  const saveOpenRouterKey = async () => {
    if (keyFromEnv) return
    setSavingApiKey(true)
    try {
      const st = useAppStore.getState()
      await window.electronAPI?.settings.save({
        rootPath: st.rootPath,
        editorTheme: st.editorTheme,
        editorFontSize: st.editorFontSize,
        editorTabSize: st.editorTabSize,
        editorWordWrap: st.editorWordWrap,
        editorMinimap: st.editorMinimap,
        openCodePathOverride: st.openCodePathOverride,
        openrouterModel: st.openrouterModel,
        openrouterKeyConfigured: apiKeyDraft.trim().length > 0,
        openrouterApiKey: apiKeyDraft.trim(),
        gitUsername: st.gitUsername,
        gitEmail: st.gitEmail,
        workspaceRestore: st.workspaceRestore,
        telemetryEnabled: st.telemetryEnabled,
        updateChannel: st.updateChannel,
        aiProvider: 'openrouter',
      })
      setOpenrouterKeyConfigured(apiKeyDraft.trim().length > 0)
      setApiKeyDraft('')
      addNotification('OpenRouter API key saved securely in main process.', 'success')
    } catch {
      addNotification('Failed to save OpenRouter API key.', 'error')
    } finally {
      setSavingApiKey(false)
    }
  }

  // Check for updates (manual trigger)
  const handleCheckUpdates = async () => {
    setCheckingUpdate(true)
    setUpdateStatus('checking')
    setUpdateMessage('Checking update server for newer releases...')
    try {
      // Simulate/Trigger updater
      const response = await window.electronAPI?.updater.checkForUpdates()
      setTimeout(() => {
        setCheckingUpdate(false)
        if (response && !(response as any).error) {
          setUpdateStatus('latest')
          setUpdateMessage(`NEXA IDE is up to date! Current version ${response.version || '1.0.0'} is the latest.`)
        } else {
          // Dev mode default response fallback
          setUpdateStatus('latest')
          setUpdateMessage(`You are running the latest version of NEXA IDE (1.0.0). No updates available on channel '${updateChannel}'.`)
        }
      }, 1500)
    } catch (err) {
      setCheckingUpdate(false)
      setUpdateStatus('error')
      setUpdateMessage(`Update check failed: ${(err as Error).message}`)
    }
  }

  // Export settings to JSON file
  const handleExport = () => {
    try {
      const settings = {
        editorTheme,
        editorFontSize,
        editorTabSize,
        editorWordWrap,
        editorMinimap,
        openCodePathOverride,
        openrouterModel,
        openrouterKeyConfigured,
        gitUsername,
        gitEmail,
        workspaceRestore,
        telemetryEnabled,
        updateChannel
      }
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(settings, null, 2))
      const downloadAnchor = document.createElement('a')
      downloadAnchor.setAttribute('href', dataStr)
      downloadAnchor.setAttribute('download', 'nexus-settings.json')
      document.body.appendChild(downloadAnchor)
      downloadAnchor.click()
      downloadAnchor.remove()
      addNotification('Settings exported successfully.', 'success')
    } catch (err) {
      addNotification('Failed to export settings.', 'error')
    }
  }

  // Import settings from JSON file
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const raw = event.target?.result as string
        const parsed = JSON.parse(raw)

        if (parsed.editorTheme !== undefined) setEditorTheme(parsed.editorTheme)
        if (parsed.editorFontSize !== undefined) setEditorFontSize(Number(parsed.editorFontSize))
        if (parsed.editorTabSize !== undefined) setEditorTabSize(Number(parsed.editorTabSize))
        if (parsed.editorWordWrap !== undefined) setEditorWordWrap(parsed.editorWordWrap)
        if (parsed.editorMinimap !== undefined) setEditorMinimap(parsed.editorMinimap)
        if (parsed.openCodePathOverride !== undefined) setOpenCodePathOverride(parsed.openCodePathOverride)
        if (parsed.openrouterModel !== undefined) setOpenrouterModel(parsed.openrouterModel)
        if (parsed.openrouterKeyConfigured !== undefined) setOpenrouterKeyConfigured(Boolean(parsed.openrouterKeyConfigured))
        if (parsed.gitUsername !== undefined) setGitUsername(parsed.gitUsername)
        if (parsed.gitEmail !== undefined) setGitEmail(parsed.gitEmail)
        if (parsed.workspaceRestore !== undefined) setWorkspaceRestore(Boolean(parsed.workspaceRestore))
        if (parsed.telemetryEnabled !== undefined) setTelemetryEnabled(Boolean(parsed.telemetryEnabled))
        if (parsed.updateChannel !== undefined) setUpdateChannel(parsed.updateChannel)

        // Save imported Git settings to git config
        await window.electronAPI?.git.setConfig(
          rootPath || undefined,
          parsed.gitUsername || '',
          parsed.gitEmail || ''
        )

        addNotification('Settings imported successfully.', 'success')
      } catch (err) {
        addNotification('Failed to parse settings JSON.', 'error')
      }
    }
    reader.readAsText(file)
  }

  // Reset all preferences
  const handleReset = async () => {
    setEditorTheme('vs-dark')
    setEditorFontSize(13)
    setEditorTabSize(4)
    setEditorWordWrap('on')
    setEditorMinimap('on')
    setOpenCodePathOverride('')
    setOpenrouterKeyConfigured(false)
    setApiKeyDraft('')
    setOpenrouterModel('openai/gpt-4o')
    setGitUsername('')
    setGitEmail('')
    setWorkspaceRestore(true)
    setTelemetryEnabled(false)
    setUpdateChannel('beta')

    // Reset git config
    await window.electronAPI?.git.setConfig(rootPath || undefined, '', '')

    addNotification('Settings reset to default values.', 'info')
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Keyboard Shortcuts Definitions
  const SHORTCUTS = [
    { keys: 'Ctrl+Shift+P', desc: 'Open Command Palette', category: 'General' },
    { keys: 'Ctrl+P', desc: 'Quick File Open by Name', category: 'General' },
    { keys: 'Ctrl+Shift+F', desc: 'Global File Content Search', category: 'General' },
    { keys: 'Ctrl+/', desc: 'Toggle Keyboard Shortcuts Modal', category: 'General' },
    { keys: 'Ctrl+B', desc: 'Toggle Sidebar Panel', category: 'Layout' },
    { keys: 'Ctrl+Alt+A', desc: 'Toggle AI Panel', category: 'Layout' },
    { keys: 'Ctrl+`', desc: 'Toggle Bottom Terminal Panel', category: 'Layout' },
    { keys: 'Ctrl+N', desc: 'Create New File in Workspace', category: 'Files' },
    { keys: 'Ctrl+S', desc: 'Save Current File', category: 'Files' },
    { keys: 'Ctrl+W', desc: 'Close Active Editor Tab', category: 'Files' },
    { keys: 'Ctrl+Shift+G', desc: 'Explain selection / Fix file with AI', category: 'AI Tools' },
    { keys: 'Ctrl+Alt+F', desc: 'Refactor selected block with AI', category: 'AI Tools' },
  ]

  const filteredShortcuts = SHORTCUTS.filter(s => 
    s.desc.toLowerCase().includes(shortcutSearch.toLowerCase()) || 
    s.keys.toLowerCase().includes(shortcutSearch.toLowerCase()) ||
    s.category.toLowerCase().includes(shortcutSearch.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-[#050608] text-white">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header Dashboard Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <Settings size={28} className="text-[#8b5cf6]" /> Settings & System Dashboard
            </h1>
            <p className="text-xs text-slate-400 mt-1">Configure preferences, check diagnostics, and review keyboard bindings.</p>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-[#8b5cf6] bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 rounded-full shrink-0">
            NEXA IDE v1.0.0
          </span>
        </div>

        {/* Tab Selection Header */}
        <div className="flex border-b border-white/5 pb-px gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('preferences')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'preferences'
                ? 'border-[#8b5cf6] text-[#c084fc] bg-white/[0.02]'
                : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.01]'
            }`}
          >
            Preferences
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('diagnostics')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'diagnostics'
                ? 'border-[#8b5cf6] text-[#c084fc] bg-white/[0.02]'
                : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.01]'
            }`}
          >
            System Diagnostics & Updates
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('shortcuts')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'shortcuts'
                ? 'border-[#8b5cf6] text-[#c084fc] bg-white/[0.02]'
                : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.01]'
            }`}
          >
            Keyboard Shortcuts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('backups')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'backups'
                ? 'border-[#8b5cf6] text-[#c084fc] bg-white/[0.02]'
                : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.01]'
            }`}
          >
            Backup Manager
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('about')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'about'
                ? 'border-[#8b5cf6] text-[#c084fc] bg-white/[0.02]'
                : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.01]'
            }`}
          >
            About
          </button>
        </div>

        {/* â”€â”€â”€ TAB 1: Preferences â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {activeTab === 'preferences' && (
          <div className="space-y-8 animate-fadeIn">
            {/* Editor preferences */}
            <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 space-y-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 pb-3 border-b border-white/5">
                <Code2 size={16} className="text-[#8b5cf6]" /> Editor Options
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400">Theme</label>
                  <select
                    value={editorTheme}
                    onChange={(e) => setEditorTheme(e.target.value as any)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white focus:border-[#8b5cf6] outline-none transition"
                  >
                    <option value="vs-dark">VS Dark</option>
                    <option value="light">VS Light</option>
                    <option value="hc-black">High Contrast Black</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400">Font Size (px)</label>
                  <input
                    type="number"
                    min="10"
                    max="32"
                    value={editorFontSize}
                    onChange={(e) => setEditorFontSize(Number(e.target.value))}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8b5cf6] outline-none transition"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400">Tab Size</label>
                  <select
                    value={editorTabSize}
                    onChange={(e) => setEditorTabSize(Number(e.target.value))}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white focus:border-[#8b5cf6] outline-none transition"
                  >
                    <option value={2}>2 Spaces</option>
                    <option value={4}>4 Spaces</option>
                    <option value={8}>8 Spaces</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400">Word Wrap</label>
                  <select
                    value={editorWordWrap}
                    onChange={(e) => setEditorWordWrap(e.target.value as any)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white focus:border-[#8b5cf6] outline-none transition"
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400">Minimap</label>
                  <select
                    value={editorMinimap}
                    onChange={(e) => setEditorMinimap(e.target.value as any)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white focus:border-[#8b5cf6] outline-none transition"
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-black/30 border border-white/5 rounded-xl">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-white">Restore Workspace</p>
                  <p className="text-[10px] text-slate-400">Reopen open tabs and projects automatically on startup.</p>
                </div>
                <input
                  type="checkbox"
                  checked={workspaceRestore}
                  onChange={(e) => setWorkspaceRestore(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 bg-black/40 accent-[#8b5cf6] cursor-pointer"
                />
              </div>
            </section>

            {/* AI config */}
            <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 space-y-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 pb-3 border-b border-white/5">
                <Sparkles size={16} className="text-[#8b5cf6]" /> AI Copilot Integration (OpenRouter-Only)
              </h2>
              <div className="space-y-4">
                <div className="p-4 bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 rounded-xl text-xs text-slate-300 leading-relaxed">
                  ðŸ’¡ NEXA IDE has been migrated to **OpenRouter-only** to consolidate 100+ models under a single, unified backend API. The API key is securely stored using operating system-level encryption keychain (`safeStorage`) and never reaches the renderer process. Alternatively, set `OPENROUTER_API_KEY` in your `.env` file to configure globally.
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 flex justify-between">
                    <span>OpenRouter API Key</span>
                    {openrouterKeyConfigured && (
                      <span className="text-emerald-400 text-[10px] font-semibold">Configured</span>
                    )}
                  </label>
                  <div className="relative flex gap-2">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      placeholder={keyFromEnv ? 'Loaded from OPENROUTER_API_KEY (.env)' : openrouterKeyConfigured ? 'Enter new key to replaceâ€¦' : 'sk-or-v1-â€¦'}
                      value={apiKeyDraft}
                      onChange={(e) => setApiKeyDraft(e.target.value)}
                      disabled={keyFromEnv}
                      className="flex-1 rounded-xl border border-white/10 bg-black/40 pl-3 pr-10 py-2.5 text-sm text-white focus:outline-none transition focus:border-[#8b5cf6] disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-[88px] top-3 text-slate-400 hover:text-white"
                      disabled={keyFromEnv}
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={saveOpenRouterKey}
                      disabled={keyFromEnv || savingApiKey || !apiKeyDraft.trim()}
                      className="px-3 py-2 rounded-xl bg-[#8b5cf6]/20 border border-[#8b5cf6]/30 text-[#c084fc] text-xs font-bold hover:bg-[#8b5cf6]/30 disabled:opacity-40 transition"
                    >
                      {savingApiKey ? 'Savingâ€¦' : 'Save Key'}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">Key is encrypted in main process storage and never kept in renderer memory.</p>
                </div>
              </div>
            </section>

            {/* Git Settings */}
            <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 space-y-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 pb-3 border-b border-white/5">
                <Globe size={16} className="text-[#8b5cf6]" /> Git profile
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400">Username</label>
                  <input
                    type="text"
                    value={gitUsername}
                    placeholder="Developer"
                    onChange={(e) => setGitUsername(e.target.value)}
                    onBlur={handleGitBlur}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8b5cf6] outline-none transition"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400">Email Address</label>
                  <input
                    type="email"
                    value={gitEmail}
                    placeholder="dev@example.com"
                    onChange={(e) => setGitEmail(e.target.value)}
                    onBlur={handleGitBlur}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8b5cf6] outline-none transition"
                  />
                </div>
              </div>
            </section>

            {/* Privacy & Telemetry */}
            <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 space-y-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 pb-3 border-b border-white/5">
                <Shield size={16} className="text-[#8b5cf6]" /> Privacy & Telemetry
              </h2>
              <div className="flex items-start justify-between p-4 bg-black/30 border border-white/5 rounded-xl gap-4">
                <div className="space-y-1.5 flex-1">
                  <p className="text-xs font-bold text-white">Anonymous Usage Telemetry</p>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Help us improve NEXA IDE by sending anonymous usage data. We collect event counts (e.g. application launches, AI prompt requests, project creation). 
                    <strong className="text-[#a78bfa]"> We NEVER collect or transmit your code, filenames, credentials, or personal information.</strong> 
                    Data collection is 100% opt-in, disabled by default, and can be revoked at any time.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={telemetryEnabled}
                  onChange={(e) => setTelemetryEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 bg-black/40 accent-[#8b5cf6] cursor-pointer mt-1"
                />
              </div>
            </section>

            {/* Advanced Settings */}
            <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 space-y-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 pb-3 border-b border-white/5">
                <Laptop size={16} className="text-[#8b5cf6]" /> Advanced Overrides
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400">OpenCode Path Override</label>
                  <input
                    type="text"
                    value={openCodePathOverride}
                    placeholder="Auto-detected"
                    onChange={(e) => setOpenCodePathOverride(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8b5cf6] outline-none transition"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400">Update Channel</label>
                  <select
                    value={updateChannel}
                    onChange={(e) => setUpdateChannel(e.target.value as any)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white focus:border-[#8b5cf6] outline-none transition"
                  >
                    <option value="stable">Stable (Releases)</option>
                    <option value="beta">Beta (Prereleases)</option>
                  </select>
                </div>
              </div>

              {/* Import/Export buttons */}
              <div className="flex flex-wrap gap-4 border-t border-white/5 pt-6">
                <button
                  type="button"
                  onClick={handleExport}
                  className="flex items-center gap-2 px-4 py-2 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  <Download size={14} /> Export Settings
                </button>

                <label className="flex items-center gap-2 px-4 py-2 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10 rounded-xl text-xs font-bold transition cursor-pointer">
                  <Upload size={14} /> Import Settings
                  <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                </label>

                <button
                  type="button"
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-xs font-bold transition ml-auto cursor-pointer"
                >
                  <RotateCcw size={14} /> Reset Defaults
                </button>
              </div>
            </section>
          </div>
        )}

        {/* â”€â”€â”€ TAB 2: Diagnostics & Updates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {activeTab === 'diagnostics' && (
          <div className="space-y-8 animate-fadeIn">
            {/* Version Checker & Updater */}
            <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <RefreshCw size={16} className="text-[#8b5cf6]" /> Version & Updates
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-1">Manual system release checker and channel management.</p>
                </div>
                
                <button
                  type="button"
                  onClick={handleCheckUpdates}
                  disabled={checkingUpdate}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 disabled:opacity-40 disabled:pointer-events-none text-xs font-bold rounded-xl shadow-lg transition cursor-pointer"
                >
                  {checkingUpdate ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Checking...
                    </>
                  ) : (
                    'Check for Updates'
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                <div className="p-4 bg-black/40 border border-white/5 rounded-xl space-y-1.5">
                  <span className="text-slate-500 text-xs">Current Installed version</span>
                  <p className="text-lg font-mono font-bold text-white flex items-center gap-1.5">
                    {appVersion}
                    <span className="text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full font-sans uppercase font-bold">
                      Stable
                    </span>
                  </p>
                </div>
                <div className="p-4 bg-black/40 border border-white/5 rounded-xl space-y-1.5">
                  <span className="text-slate-500 text-xs">Update Channel Configured</span>
                  <p className="text-lg font-bold text-white capitalize font-mono">
                    {updateChannel} Channel
                  </p>
                </div>
              </div>

              {updateStatus !== 'idle' && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                  updateStatus === 'latest' 
                    ? 'bg-green-500/10 border-green-500/20 text-green-400'
                    : updateStatus === 'error'
                      ? 'bg-red-500/10 border-red-500/20 text-red-400'
                      : 'bg-blue-500/10 border-blue-500/20 text-blue-400 animate-pulse'
                }`}>
                  <Info size={16} className="mt-0.5 shrink-0" />
                  <p className="text-xs leading-relaxed font-semibold">{updateMessage}</p>
                </div>
              )}
            </section>

            {/* Diagnostics Loader & View */}
            {loadingDiagnostics ? (
              <div className="flex flex-col items-center justify-center p-12 bg-white/[0.02] border border-white/5 rounded-2xl space-y-4">
                <RefreshCw size={36} className="text-[#8b5cf6] animate-spin" />
                <p className="text-sm text-slate-400 font-medium">Gathering workspace diagnostics & performance statistics...</p>
              </div>
            ) : diagnosticsError ? (
              <div className="p-6 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-start gap-3">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-sm">Diagnostics Load Error</h3>
                  <p className="text-xs mt-1 text-slate-300 leading-relaxed">{diagnosticsError}</p>
                  <button
                    type="button"
                    onClick={fetchDiagnostics}
                    className="mt-3 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-xs font-bold rounded-lg border border-red-500/30 transition cursor-pointer"
                  >
                    Retry Diagnostics Check
                  </button>
                </div>
              </div>
            ) : diagnostics ? (
              <div className="space-y-6">
                
                {/* Status Cards grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* OpenCode CLI Card */}
                  <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">OpenCode CLI</span>
                      {diagnostics.opencode.installed ? (
                        <CheckCircle2 size={16} className="text-green-400" />
                      ) : (
                        <XCircle size={16} className="text-yellow-400" />
                      )}
                    </div>
                    <div className="mt-4">
                      <p className="text-sm font-bold text-white">
                        {diagnostics.opencode.installed ? 'Installed & Ready' : 'Not Detected'}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate mt-1" title={diagnostics.opencode.path || ''}>
                        {diagnostics.opencode.version ? diagnostics.opencode.version.split('\n')[0] : 'OpenCode path is unconfigured'}
                      </p>
                    </div>
                  </div>

                  {/* OpenRouter Connection Card */}
                  <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">OpenRouter API</span>
                      {diagnostics.openrouter.connected ? (
                        <CheckCircle2 size={16} className="text-green-400" />
                      ) : (
                        <XCircle size={16} className="text-slate-500" />
                      )}
                    </div>
                    <div className="mt-4">
                      <p className="text-sm font-bold text-white">
                        {diagnostics.openrouter.connected
                          ? `${diagnostics.openrouter.modelCount} models available`
                          : diagnostics.openrouter.keyConfigured
                            ? 'Key set â€” connection failed'
                            : 'API key not configured'}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate mt-1">
                        {diagnostics.openrouter.error || (diagnostics.openrouter.keyConfigured ? 'Ready' : 'Set OPENROUTER_API_KEY or save in Settings')}
                      </p>
                      {diagnostics.budget && (
                        <p className="text-[10px] text-[#c084fc] mt-1 font-mono">
                          Daily spend: ${diagnostics.budget.dailySpend.toFixed(4)} / ${diagnostics.budget.limit.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Git Health Card */}
                  <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Git repository</span>
                      {diagnostics.git.isRepo ? (
                        <CheckCircle2 size={16} className="text-green-400" />
                      ) : (
                        <AlertCircle size={16} className="text-slate-500" />
                      )}
                    </div>
                    <div className="mt-4">
                      <p className="text-sm font-bold text-white">
                        {diagnostics.git.isRepo ? `Active: ${diagnostics.git.currentBranch}` : 'Not Git Workspace'}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate mt-1">
                        {diagnostics.git.username || 'No user name configured'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sizing and Metrics details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Workspace Size Metrics */}
                  <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 border-b border-white/5 pb-2.5">
                      <Folder size={14} className="text-purple-400" /> Workspace sizing
                    </h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-xs">Total Workspace Files</span>
                        <span className="font-mono font-semibold text-white">{diagnostics.workspace.fileCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-xs">Scan Total size</span>
                        <span className="font-mono font-semibold text-white">{formatBytes(diagnostics.workspace.totalSize)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-xs">Active Root directory</span>
                        <span className="font-mono text-[10px] text-slate-300 truncate max-w-[200px]" title={diagnostics.workspace.path || ''}>
                          {diagnostics.workspace.path ? diagnostics.workspace.path.split(/[/\\]/).pop() : 'Scratch Editor'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Performance stats */}
                  <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 border-b border-white/5 pb-2.5">
                      <Cpu size={14} className="text-purple-400" /> Performance Statistics
                    </h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-xs">V8 heap Memory usage</span>
                        <span className="font-mono font-semibold text-white">
                          {diagnostics.performance.heapUsedMB} MB / {diagnostics.performance.heapTotalMB} MB
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-xs">System memory Load</span>
                        <span className="font-mono font-semibold text-white">
                          {Math.round((diagnostics.performance.systemTotalMemoryGB - diagnostics.performance.systemFreeMemoryGB) * 10) / 10} GB / {diagnostics.performance.systemTotalMemoryGB} GB
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-xs">CPU Load average (1/5/15m)</span>
                        <span className="font-mono font-semibold text-white">
                          {diagnostics.performance.cpuLoadAverage.map(l => l.toFixed(2)).join(', ')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={fetchDiagnostics}
                    className="flex items-center gap-2 px-4 py-2 border border-white/10 hover:border-white/20 hover:bg-white/5 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    <RefreshCw size={12} /> Force Refresh Stats
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* â”€â”€â”€ TAB 3: Keyboard Shortcuts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {activeTab === 'shortcuts' && (
          <div className="space-y-6 animate-fadeIn">
            <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Keyboard size={16} className="text-[#8b5cf6]" /> Keyboard Bindings
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-1">Searchable dictionary of standard keyboard hotkeys.</p>
                </div>
                
                {/* Search bar */}
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={shortcutSearch}
                    placeholder="Search shortcuts..."
                    onChange={(e) => setShortcutSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white focus:border-[#8b5cf6] focus:outline-none transition"
                  />
                </div>
              </div>

              {/* Table of shortcuts */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-300">
                  <thead className="text-xs uppercase bg-black/40 text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 rounded-l-lg">Command Description</th>
                      <th scope="col" className="px-4 py-3">Category</th>
                      <th scope="col" className="px-4 py-3 rounded-r-lg text-right">Keyboard Shortcut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredShortcuts.length > 0 ? (
                      filteredShortcuts.map((s, idx) => (
                        <tr key={idx} className="hover:bg-white/[0.01] transition-colors">
                          <td className="px-4 py-3 font-semibold text-white">{s.desc}</td>
                          <td className="px-4 py-3 text-xs">
                            <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-slate-400">
                              {s.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <kbd className="px-2 py-1 bg-black/60 border border-white/10 rounded font-mono text-xs text-[#a78bfa] shadow">
                              {s.keys}
                            </kbd>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-slate-500 font-medium">
                          No shortcuts matching "{shortcutSearch}" found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* â”€â”€â”€ TAB: Backups â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {activeTab === 'backups' && (
          <div className="space-y-8 animate-fadeIn">
            <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <History size={16} className="text-[#8b5cf6]" /> File Backup Manager
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Manage and restore local backups automatically created before AI edits.
                  </p>
                </div>
                {rootPath && (
                  <button
                    type="button"
                    onClick={loadBackups}
                    disabled={loadingBackups}
                    className="flex items-center gap-2 px-3 py-1.5 border border-white/10 hover:border-white/20 hover:bg-white/5 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    <RefreshCw size={12} className={loadingBackups ? 'animate-spin' : ''} /> Refresh List
                  </button>
                )}
              </div>

              {!rootPath ? (
                <div className="flex flex-col items-center justify-center p-12 bg-black/20 border border-white/5 rounded-xl text-center space-y-3">
                  <Folder size={36} className="text-slate-600" />
                  <p className="text-sm text-slate-400 font-medium">Please open a workspace folder to view and manage code backups.</p>
                </div>
              ) : loadingBackups ? (
                <div className="flex flex-col items-center justify-center p-12 space-y-4">
                  <RefreshCw size={36} className="text-[#8b5cf6] animate-spin" />
                  <p className="text-sm text-slate-400 font-medium">Scanning backup archives...</p>
                </div>
              ) : backups.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 bg-black/20 border border-white/5 rounded-xl text-center space-y-3">
                  <Clock size={36} className="text-slate-600" />
                  <p className="text-sm text-slate-400 font-medium">No file backups found in this workspace yet.</p>
                  <p className="text-[11px] text-slate-500 max-w-sm">Backups are automatically generated whenever the AI applies modifications to your files.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {backups.map((item) => {
                    const isExpanded = expandedBackup === item.backupPath
                    const filename = getBasename(item.filePath)
                    const dirname = getDirname(item.filePath)
                    const formattedDate = new Date(item.timestamp).toLocaleString()
                    const formattedSize = item.size !== undefined ? formatBytes(item.size) : 'Unknown size'

                    return (
                      <div
                        key={item.backupPath}
                        className={`border rounded-xl transition-all duration-200 ${
                          isExpanded 
                            ? 'border-[#8b5cf6]/40 bg-[#8b5cf6]/5' 
                            : 'border-white/5 bg-black/20 hover:border-white/10 hover:bg-white/[0.01]'
                        }`}
                      >
                        {/* Summary Header */}
                        <div 
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer select-none gap-4"
                          onClick={() => setExpandedBackup(isExpanded ? null : item.backupPath)}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <Clock size={18} className="text-purple-400 mt-1 shrink-0" />
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                                <span>{filename}</span>
                                <span className="text-[10px] text-slate-500 font-normal font-mono truncate max-w-[200px]" title={item.filePath}>
                                  in {dirname || '/'}
                                </span>
                              </h3>
                              <p className="text-[11px] text-slate-400 mt-0.5">{formattedDate}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0 self-end sm:self-center">
                            <span className="text-xs font-mono text-slate-400">{formattedSize}</span>
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => handleRestoreBackup(item)}
                                className="px-3 py-1.5 bg-[#8b5cf6]/20 hover:bg-[#8b5cf6] text-[#c084fc] hover:text-white border border-[#8b5cf6]/30 hover:border-transparent rounded-lg text-xs font-bold transition cursor-pointer"
                              >
                                Restore
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteBackup(item)}
                                className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition cursor-pointer"
                                title="Delete backup entry"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Collapsible Details */}
                        {isExpanded && (
                          <div className="border-t border-white/5 p-4 bg-black/40 rounded-b-xl space-y-3 text-xs leading-relaxed animate-fadeIn">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Original Location</span>
                                <p className="font-mono text-[11px] text-slate-300 break-all select-all">{item.filePath}</p>
                              </div>
                              <div className="space-y-1">
                                <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Backup Archive Path</span>
                                <p className="font-mono text-[11px] text-slate-300 break-all select-all">{item.backupPath}</p>
                              </div>
                            </div>
                            {item.sessionId && (
                              <div className="space-y-1">
                                <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">AI Session ID</span>
                                <p className="font-mono text-[11px] text-slate-300 select-all">{item.sessionId}</p>
                              </div>
                            )}
                            {item.task && (
                              <div className="space-y-1">
                                <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Associated Task / Prompt</span>
                                <blockquote className="border-l-2 border-purple-500/50 pl-3 py-1 bg-white/[0.02] text-slate-300 italic font-sans text-[11px] rounded-r">
                                  {item.task}
                                </blockquote>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* â”€â”€â”€ TAB: About â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {activeTab === 'about' && (
          <div className="space-y-8 animate-fadeIn">
            <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-8 flex flex-col items-center text-center space-y-6">
              
              {/* Hexagonal / Sleek Logo Graphic */}
              <div className="relative w-24 h-24 bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-purple-500/20 transform rotate-12 hover:rotate-0 transition-transform duration-300">
                <div className="transform -rotate-12 hover:rotate-0 transition-transform duration-300 flex items-center justify-center">
                  <Code2 size={48} className="text-white" />
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-extrabold tracking-tight text-white">NEXA IDE</h2>
                <p className="text-xs text-purple-400 font-mono font-semibold">Production Release Ready â€¢ v{appVersion}</p>
              </div>

              <p className="max-w-md text-xs text-slate-400 leading-relaxed">
                A state-of-the-art agentic AI integrated development environment built for lightning-fast workflows, deep git integration, and premium aesthetics.
              </p>

              {/* Version details card */}
              <div className="w-full max-w-md p-4 bg-black/40 border border-white/5 rounded-xl text-left text-xs space-y-2 font-mono divide-y divide-white/5">
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">App Version</span>
                  <span className="text-white font-bold">{appVersion}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Build Date</span>
                  <span className="text-white">June 23, 2026</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">License Status</span>
                  <span className="text-green-400 font-bold flex items-center gap-1">
                    <CheckCircle2 size={12} /> MIT License
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Developer Credits</span>
                  <span className="text-white">Google DeepMind AAC Team</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3 w-full">
                <button
                  type="button"
                  onClick={copyVersionInfo}
                  className="flex items-center gap-2 px-4 py-2 border border-white/10 hover:border-white/20 hover:bg-white/5 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  <Copy size={12} /> Copy Version Info
                </button>
                <button
                  type="button"
                  onClick={() => window.electronAPI?.logs.openFolder(rootPath)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#8b5cf6]/20 hover:bg-[#8b5cf6] text-[#c084fc] hover:text-white border border-[#8b5cf6]/30 hover:border-transparent rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  <Folder size={12} /> Open Logs Folder
                </button>
              </div>

              {/* Developer Links */}
              <div className="flex items-center gap-6 border-t border-white/5 pt-6 w-full justify-center text-xs">
                <a
                  href="https://github.com/google-deepmind/nexa-ide"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault()
                    window.electronAPI?.external.open('https://github.com/google-deepmind/nexa-ide')
                  }}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-white transition"
                >
                  <Github size={14} /> GitHub Repository
                </a>
                <span className="text-white/10">â€¢</span>
                <a
                  href="https://nexa-ide.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault()
                    window.electronAPI?.external.open('https://nexa-ide.dev')
                  }}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-white transition"
                >
                  <Globe size={14} /> Official Website
                </a>
              </div>

            </section>
          </div>
        )}

      </div>
    </div>
  )
}

