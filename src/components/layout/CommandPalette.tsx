import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Plus, FolderPlus, FolderOpen, Save, Terminal, Sparkles, RefreshCw, FilePlus, FileText, Bug, Settings } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useAppModal } from '../ui/ModalDialog'
import { loadGitStatus } from '../../lib/gitUtils'
import {
  openFile as openFileFs,
  saveFile as saveFileFs,
  getCachedFileContent,
  saveAllDirtyFiles,
} from '../../lib/fileSystem'
import {
  getRecentProjects,
} from '../../lib/recentProjects'

const COMMANDS = [
  { id: 'go-to-file', label: 'Go to File...', icon: <FolderOpen size={14} /> },
  { id: 'save-file', label: 'Save File', icon: <Save size={14} /> },
  { id: 'save-all', label: 'Save All Files', icon: <Save size={14} /> },
  { id: 'fix-file-ai', label: 'Fix Current File with AI', icon: <Bug size={14} /> },
  { id: 'explain-file-ai', label: 'Explain Current File', icon: <FileText size={14} /> },
  { id: 'refactor-selection-ai', label: 'Refactor Selection', icon: <Sparkles size={14} /> },
  { id: 'open-terminal', label: 'Open Terminal', icon: <Terminal size={14} /> },
  { id: 'toggle-ai-panel', label: 'Toggle AI Panel', icon: <Sparkles size={14} /> },
  { id: 'git-stage-all', label: 'Git: Stage All', icon: <RefreshCw size={14} /> },
  { id: 'git-commit', label: 'Git: Commit', icon: <RefreshCw size={14} /> },
  { id: 'git-checkout-branch', label: 'Git: Checkout Branch', icon: <RefreshCw size={14} /> },
  { id: 'git-clone', label: 'Git: Clone Repository', icon: <RefreshCw size={14} /> },
  { id: 'git-pull', label: 'Git: Pull', icon: <RefreshCw size={14} /> },
  { id: 'git-push', label: 'Git: Push', icon: <RefreshCw size={14} /> },
  { id: 'git-status', label: 'Git: Status', icon: <RefreshCw size={14} /> },
  { id: 'open-recent', label: 'Open Recent Project...', icon: <FolderOpen size={14} /> },
  { id: 'search-in-files', label: 'Search: Find in Files', icon: <Search size={14} /> },
  { id: 'open-settings', label: 'Open Settings', icon: <Settings size={14} /> },
  { id: 'new-file', label: 'New File', icon: <Plus size={14} /> },
  { id: 'new-folder', label: 'New Folder', icon: <FolderPlus size={14} /> },
  { id: 'open-project', label: 'Open Project', icon: <FolderOpen size={14} /> },
  { id: 'create-project', label: 'Create New Project', icon: <Sparkles size={14} /> },
  { id: 'install-dependencies', label: 'Install Dependencies', icon: <FilePlus size={14} /> },
  { id: 'create-deploy-config', label: 'Create Deploy Config', icon: <RefreshCw size={14} /> },
]

export default function CommandPalette() {
  // State selectors — fine-grained to prevent cascading re-renders
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen)
  const commandPaletteMode = useAppStore((s) => s.commandPaletteMode)
  const rootPath = useAppStore((s) => s.rootPath)
  const selectedFilePath = useAppStore((s) => s.selectedFilePath)
  const openTabs = useAppStore((s) => s.openTabs)
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen)
  const setCommandPaletteMode = useAppStore((s) => s.setCommandPaletteMode)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const setSidebarTab = useAppStore((s) => s.setSidebarTab)
  const setBottomPanelOpen = useAppStore((s) => s.setBottomPanelOpen)
  const setAIPanelOpen = useAppStore((s) => s.setAIPanelOpen)
  const requestAIPanelFocus = useAppStore((s) => s.requestAIPanelFocus)
  const requestTerminalFocus = useAppStore((s) => s.requestTerminalFocus)
  const setSelectedFilePath = useAppStore((s) => s.setSelectedFilePath)
  const setOpenTabs = useAppStore((s) => s.setOpenTabs)
  const setExplorerEntries = useAppStore((s) => s.setExplorerEntries)
  const setRootPath = useAppStore((s) => s.setRootPath)
  const setCurrentFolder = useAppStore((s) => s.setCurrentFolder)
  const setGitBranch = useAppStore((s) => s.setGitBranch)
  const setGitStatusSummary = useAppStore((s) => s.setGitStatusSummary)
  const setLicenseStatus = useAppStore((s) => s.setLicenseStatus)
  const setPendingAiPrompt = useAppStore((s) => s.setPendingAiPrompt)
  const addNotification = useAppStore((s) => s.addNotification)
  const { prompt, confirm } = useAppModal()

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [files, setFiles] = useState<string[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  const [paletteMode, setPaletteMode] = useState<'command' | 'file' | 'recent'>('command')

  useEffect(() => {
    setPaletteMode(commandPaletteMode)
  }, [commandPaletteMode])

  // Reset selected index on query or mode changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query, paletteMode])

  // Load files when entering file search mode
  useEffect(() => {
    if (commandPaletteOpen && commandPaletteMode === 'file') {
      setLoadingFiles(true)
      window.electronAPI?.workspace.listFiles()
        .then((fileList) => {
          if (Array.isArray(fileList)) {
            setFiles(fileList)
          }
        })
        .catch((err) => {
          console.error('Failed to list workspace files:', err)
        })
        .finally(() => {
          setLoadingFiles(false)
        })
    }
  }, [commandPaletteOpen, commandPaletteMode])

  const getRelativePath = useCallback((absolutePath: string) => {
    if (!rootPath) return absolutePath
    const normalizedRoot = rootPath.replace(/\\/g, '/')
    const normalizedPath = absolutePath.replace(/\\/g, '/')
    if (normalizedPath.startsWith(normalizedRoot)) {
      let rel = normalizedPath.slice(normalizedRoot.length)
      if (rel.startsWith('/')) rel = rel.slice(1)
      return rel
    }
    return absolutePath
  }, [rootPath])

  const results = useMemo(() => {
    if (paletteMode === 'command') {
      return COMMANDS.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      ).map(cmd => ({
        id: cmd.id,
        label: cmd.label,
        subtitle: '',
        icon: cmd.icon
      }))
    } else if (paletteMode === 'recent') {
      const recents = getRecentProjects()
      return recents.filter((item) =>
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.path.toLowerCase().includes(query.toLowerCase())
      ).map(project => ({
        id: `recent-proj:${project.path}`,
        label: project.name,
        subtitle: project.path,
        icon: <FolderOpen size={14} />
      }))
    } else {
      // File mode fuzzy matching: order-independent matching of terms
      if (!query.trim()) {
        return files.slice(0, 50).map(file => {
          const name = file.split(/[/\\]/).pop() || ''
          return {
            id: file,
            label: name,
            subtitle: file,
            icon: <FileText size={14} />
          }
        })
      }

      const terms = query.toLowerCase().split(/\s+/)
      const matched: Array<{ file: string; fileName: string; score: number }> = []

      for (const file of files) {
        const lowerPath = file.toLowerCase()
        const fileName = file.split(/[/\\]/).pop() || ''
        const lowerFileName = fileName.toLowerCase()

        let matches = true
        for (const term of terms) {
          if (!lowerPath.includes(term)) {
            matches = false
            break
          }
        }

        if (matches) {
          let score = 0
          if (lowerFileName === query.toLowerCase()) {
            score += 10000
          } else if (lowerFileName.includes(query.toLowerCase())) {
            score += 5000 + (lowerFileName.startsWith(query.toLowerCase()) ? 1000 : 0)
          }
          score -= file.length // Prefer shorter path lengths
          matched.push({ file, fileName, score })
        }
      }

      matched.sort((a, b) => b.score - a.score)

      return matched.slice(0, 50).map(item => ({
        id: item.file,
        label: item.fileName,
        subtitle: item.file,
        icon: <FileText size={14} />
      }))
    }
  }, [paletteMode, query, files])

  const getPathSeparator = (value: string) => (value.includes('\\') ? '\\' : '/')
  const ensureTrailingSeparator = (value: string) => {
    const sep = getPathSeparator(value)
    return value.endsWith(sep) ? value : `${value}${sep}`
  }

  const getGlobalLoadFolder = () => {
    return (window as any).loadDirectory || loadFolder
  }

  const loadFolder = async (folderPath: string) => {
    // Set root on main process BEFORE any fs call — prevents stale-root reads
    if (window.electronAPI?.app?.allowPath) {
      window.electronAPI.app.allowPath(folderPath)
    }
    await window.electronAPI?.workspace.setRoot(folderPath)

    const response = await window.electronAPI?.fs.readDir(folderPath)
    if (!response || (response as any).error) {
      await window.electronAPI?.workspace.setRoot(null).catch(() => {})
      return false
    }

    const separator = getPathSeparator(folderPath)
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

    return true
  }

  const runCommand = useCallback(
    async (commandId: string) => {
      setCommandPaletteOpen(false)
      setQuery('')

      if (commandId.startsWith('recent-proj:')) {
        const projectPath = commandId.slice('recent-proj:'.length)
        const stat = await window.electronAPI?.fs.stat(projectPath)
        if (stat && !('error' in stat) && (stat as any).isDirectory) {
          await getGlobalLoadFolder()(projectPath)
        } else {
          addNotification('Folder not found or deleted.', 'error')
        }
        setPaletteMode('command')
        return
      }

      // ── File Mode Selection ────────────────────────────────────────────────
      if (paletteMode === 'file') {
        const filePath = commandId
        try {
          await openFileFs(filePath)
        } catch (err) {
          addNotification(`Unable to read file: ${err instanceof Error ? err.message : String(err)}`, 'error')
        }
        return
      }

      // ── Command Palette Execution ──────────────────────────────────────────
      if (commandId === 'go-to-file') {
        setCommandPaletteMode('file')
        setCommandPaletteOpen(true)
        return
      }

      if (commandId === 'save-file') {
        if (!selectedFilePath) return
        try {
          await saveFileFs(selectedFilePath)
          addNotification('File saved.', 'success')
        } catch (err) {
          addNotification(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
        }
      }

      if (commandId === 'save-all') {
        try {
          await saveAllDirtyFiles()
          addNotification('All files saved.', 'success')
        } catch (err) {
          addNotification(`Save all failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
        }
      }

      if (commandId === 'git-clone') {
        const repoUrl = (await prompt({
          title: 'Repository URL',
          message: 'Enter the repository URL to clone.',
          placeholder: 'https://github.com/owner/repo.git',
          confirmText: 'Clone',
          cancelText: 'Cancel',
        }))?.trim()
        if (!repoUrl) return
        addNotification('Cloning repository...', 'info')
        const response = await window.electronAPI?.project.clone(repoUrl)
        if (response && !(response as any).error && (response as any).path) {
          addNotification(`Repository cloned to ${(response as any).path}`, 'success')
          await getGlobalLoadFolder()((response as any).path)
        } else {
          addNotification(`Clone failed: ${(response as any).error ?? 'Unknown error'}`, 'error')
        }
      }

      if (commandId === 'git-pull') {
        if (!rootPath) {
          addNotification('Open a project first.', 'warning')
          return
        }
        addNotification('Pulling changes...', 'info')
        const res = await window.electronAPI?.git.pull(rootPath)
        if (res && !(res as any).error) {
          addNotification('Pulled successfully.', 'success')
          await loadGitStatus(rootPath)
        } else {
          addNotification(`Pull failed: ${(res as any)?.error ?? 'Unknown error'}`, 'error')
        }
      }

      if (commandId === 'git-push') {
        if (!rootPath) {
          addNotification('Open a project first.', 'warning')
          return
        }
        addNotification('Pushing changes...', 'info')
        const res = await window.electronAPI?.git.push(rootPath)
        if (res && !(res as any).error) {
          addNotification('Pushed successfully.', 'success')
          await loadGitStatus(rootPath)
        } else {
          addNotification(`Push failed: ${(res as any)?.error ?? 'Unknown error'}`, 'error')
        }
      }

      if (commandId === 'git-status') {
        if (!rootPath) {
          addNotification('Open a project first.', 'warning')
          return
        }
        await loadGitStatus(rootPath)
        setSidebarOpen(true)
        setSidebarTab('git')
      }

      if (commandId === 'open-recent') {
        setPaletteMode('recent')
        setCommandPaletteOpen(true)
        return
      }

      if (commandId === 'fix-file-ai') {
        if (!selectedFilePath) {
          addNotification('No file selected to fix.', 'warning')
          return
        }
        setAIPanelOpen(true)
        requestAIPanelFocus()
        const content = getCachedFileContent(selectedFilePath) ?? ''
        setPendingAiPrompt(`Analyze and fix any bugs, compiler errors, or structural issues in this file: ${selectedFilePath}\n\nCode Content:\n\`\`\`\n${content}\n\`\`\``)
      }

      if (commandId === 'explain-file-ai') {
        if (!selectedFilePath) {
          addNotification('No file selected to explain.', 'warning')
          return
        }
        setAIPanelOpen(true)
        requestAIPanelFocus()
        const content = getCachedFileContent(selectedFilePath) ?? ''
        setPendingAiPrompt(`Explain the code in the file ${selectedFilePath} in detail, focusing on its architecture, patterns, and logic.\n\nCode Content:\n\`\`\`\n${content}\n\`\`\``)
      }

      if (commandId === 'refactor-selection-ai') {
        if (!selectedFilePath) {
          addNotification('No file selected to refactor.', 'warning')
          return
        }
        setAIPanelOpen(true)
        requestAIPanelFocus()
        const content = getCachedFileContent(selectedFilePath) ?? ''
        setPendingAiPrompt(`Refactor this code for better clarity, readability, maintainability, and performance. Apply modern best practices.\n\nFile: ${selectedFilePath}\n\nCode Content:\n\`\`\`\n${content}\n\`\`\``)
      }

      if (commandId === 'open-terminal' || commandId === 'run-terminal') {
        setBottomPanelOpen(true)
        requestTerminalFocus()
      }

      if (commandId === 'toggle-ai-panel') {
        const current = useAppStore.getState().aiPanelOpen
        setAIPanelOpen(!current)
      }

      if (commandId === 'git-stage-all') {
        if (!rootPath) {
          addNotification('Open a project first.', 'warning')
          return
        }
        const res = await window.electronAPI?.git.stageAll(rootPath)
        if (res && !(res as any).error) {
          addNotification('Staged all changes.', 'success')
          await loadGitStatus(rootPath)
        } else {
          addNotification(`Failed to stage changes: ${(res as any)?.error ?? 'Unknown error'}`, 'error')
        }
      }

      if (commandId === 'git-commit') {
        if (!rootPath) {
          addNotification('Open a project first.', 'warning')
          return
        }
        const message = await prompt({
          title: 'Git Commit',
          message: 'Enter commit message for staged changes.',
          placeholder: 'feat: add feature',
          confirmText: 'Commit',
          cancelText: 'Cancel',
        })
        if (!message || !message.trim()) return
        const res = await window.electronAPI?.git.commitStaged(rootPath, message.trim())
        if (res && !(res as any).error) {
          addNotification('Committed changes.', 'success')
          await loadGitStatus(rootPath)
        } else {
          addNotification(`Commit failed: ${(res as any)?.error ?? 'Unknown error'}`, 'error')
        }
      }

      if (commandId === 'git-checkout-branch') {
        setSidebarOpen(true)
        setSidebarTab('git')
      }

      if (commandId === 'search-in-files') {
        setSidebarOpen(true)
        setSidebarTab('search')
      }

      if (commandId === 'open-settings') {
        if (!openTabs.includes('nexus://settings')) {
          setOpenTabs([...openTabs, 'nexus://settings'])
        }
        setSelectedFilePath('nexus://settings')
      }

      if (commandId === 'new-file') {
        const filePath = await window.electronAPI?.dialog.createFile()
        if (filePath) {
          const folder = filePath.replace(/[/\\][^/\\]+$/, '')
          const response = await window.electronAPI?.fs.readDir(folder)
          if (response && !(response as any).error) {
            const separator = getPathSeparator(folder)
            const entries = (response as any[]).map((entry) => ({
              name: entry.name,
              path: `${folder}${folder.endsWith(separator) ? '' : separator}${entry.name}`,
              isDirectory: entry.isDirectory,
              isFile: entry.isFile,
            }))
            setSidebarOpen(true)
            setSidebarTab('explorer')
            setExplorerEntries(entries)
            try {
              await openFileFs(filePath)
            } catch (err) {
              addNotification(`Unable to open created file: ${err instanceof Error ? err.message : String(err)}`, 'error')
            }
          }
        }
      }

      if (commandId === 'new-folder') {
        const name = await prompt({
          title: 'New folder name',
          message: 'Enter a name for the new folder.',
          placeholder: 'Folder name',
          confirmText: 'Create',
          cancelText: 'Cancel',
        })
        if (!name) return
        if (!rootPath) return
        const folderPath = `${ensureTrailingSeparator(rootPath)}${name}`
        await window.electronAPI?.invoke('fs:createFolder', folderPath)
        const response = await window.electronAPI?.fs.readDir(rootPath)
        if (response && !(response as any).error) {
          const separator = getPathSeparator(rootPath)
          const entries = (response as any[]).map((entry) => ({
            name: entry.name,
            path: `${rootPath}${rootPath.endsWith(separator) ? '' : separator}${entry.name}`,
            isDirectory: entry.isDirectory,
            isFile: entry.isFile,
          }))
          setExplorerEntries(entries)
        }
      }

      if (commandId === 'open-project') {
        const folderPath = await window.electronAPI?.dialog.openFolder()
        if (folderPath) {
          await getGlobalLoadFolder()(folderPath)
        }
      }

      if (commandId === 'create-project') {
        const projectFolder = await window.electronAPI?.invoke('project:new')
        if (!projectFolder || (projectFolder as any).error || (projectFolder as any).canceled) return
        const root = (projectFolder as any).path
        const description = (await prompt({
          title: 'Describe your project',
          message: 'Explain the type of project you want to create.',
          placeholder: 'A React app starter',
          defaultValue: 'A React app starter',
          confirmText: 'Next',
          cancelText: 'Cancel',
        }))?.trim()
        if (!description) return
        const templateId = (await window.electronAPI?.project.findTemplate(description)) as string || 'react'
        const suggestedName = description.split(/\s+/).slice(0, 3).join('-') || templateId
        const projectName = ((await prompt({
          title: 'Project name',
          message: 'Enter a name for your project.',
          placeholder: suggestedName,
          defaultValue: suggestedName,
          confirmText: 'Create',
          cancelText: 'Cancel',
        }))?.trim() || suggestedName)
        const canCreate = await window.electronAPI?.license.canCreateTemplate(templateId)
        if (!canCreate) {
          addNotification('Creating this project template requires a Pro or Ultimate license.', 'warning')
          return
        }
        const created = await window.electronAPI?.project.create(root, templateId, projectName)
        if (!created || (created as any).error) {
          addNotification(`Project creation failed: ${(created as any).error ?? 'Unknown error'}`, 'error')
          return
        }
        try {
          const rec = await window.electronAPI?.license.recordTemplateUsage(templateId)
          if (rec && !(rec as any).error) {
            if ((rec as any).plan) setLicenseStatus(rec as any)
            else {
              const s = await window.electronAPI?.license.status()
              if (s && !(s as any).error) setLicenseStatus(s as any)
            }
          }
        } catch (e) {}
        const projectPath = (created as any).path
        addNotification(`Project created at ${projectPath}`, 'success')
        await getGlobalLoadFolder()(projectPath)
        const installDependencies = await confirm({
          title: 'Install dependencies?',
          message: 'Install dependencies for this new project now?',
          confirmText: 'Install',
          cancelText: 'Later',
        })
        if (installDependencies) {
          const installResult = await window.electronAPI?.project.installDependencies(projectPath)
          if (installResult && !(installResult as any).error) {
            addNotification((installResult as any).message ?? 'Dependencies installed successfully.', 'success')
          } else {
            addNotification(`Dependency install failed: ${(installResult as any).error ?? 'Unknown error'}`, 'error')
          }
        }
      }

      if (commandId === 'install-dependencies') {
        if (!rootPath) {
          addNotification('Open a project first.', 'warning')
          return
        }
        const result = await window.electronAPI?.project.installDependencies(rootPath)
        if (result && !(result as any).error) {
          addNotification((result as any).message ?? 'Dependencies installed successfully.', 'success')
        } else {
          addNotification(`Install failed: ${(result as any).error ?? 'Unknown error'}`, 'error')
        }
      }

      if (commandId === 'create-deploy-config') {
        if (!rootPath) {
          addNotification('Open a project first.', 'warning')
          return
        }
        const provider = (await prompt({
          title: 'Deploy provider',
          message: 'Enter the deployment provider name.',
          placeholder: 'vercel',
          defaultValue: 'vercel',
          confirmText: 'Create',
          cancelText: 'Cancel',
        }))?.trim().toLowerCase()
        if (!provider) return
        const result = await window.electronAPI?.project.createDeployConfig(rootPath, provider)
        if (result && !(result as any).error) {
          addNotification(`Created deploy files: ${(result as any).created?.join(', ')}`, 'success')
        } else {
          addNotification(`Deploy config creation failed: ${(result as any).error ?? 'Unknown error'}`, 'error')
        }
      }
    },
    [
      commandPaletteMode,
      openTabs,
      rootPath,
      selectedFilePath,
      setAIPanelOpen,
      setCommandPaletteMode,
      setCommandPaletteOpen,
      setExplorerEntries,
      setOpenTabs,
      setRootPath,
      setCurrentFolder,
      setSelectedFilePath,
      setSidebarOpen,
      setSidebarTab,
      setBottomPanelOpen,
      requestTerminalFocus,
      requestAIPanelFocus,
      setGitBranch,
      setGitStatusSummary,
      setLicenseStatus,
      setPendingAiPrompt,
      addNotification,
      prompt,
      confirm
    ]
  )

  useEffect(() => {
    if (!commandPaletteOpen) return
    setSelectedIndex(0)
  }, [commandPaletteOpen])

  useEffect(() => {
    if (!commandPaletteOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCommandPaletteOpen(false)
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((current) => Math.min(current + 1, results.length - 1))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((current) => Math.max(current - 1, 0))
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        if (results[selectedIndex]) runCommand(results[selectedIndex].id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [commandPaletteOpen, results, runCommand, selectedIndex])

  if (!commandPaletteOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      >
        <motion.div
          initial={{ scale: 0.98, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.98, opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="w-[520px] rounded-3xl border border-white/10 bg-[#090b11] shadow-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-3 text-[12px] text-[#94a3b8]">
              <Search size={14} />
              <span>{paletteMode === 'command' ? 'Command palette' : paletteMode === 'recent' ? 'Open Recent Project...' : 'Fuzzy find files'}</span>
            </div>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="mt-3 w-full rounded-2xl border border-white/10 bg-[#03050b] px-4 py-3 text-[13px] text-white outline-none ring-0 focus:border-[#8b5cf6]"
              placeholder={paletteMode === 'command' ? 'Type a command...' : paletteMode === 'recent' ? 'Search recent projects...' : 'Search files...'}
            />
          </div>

          <div className="max-h-72 overflow-y-auto px-5 py-3 space-y-2">
            {loadingFiles && (
              <div className="text-center text-[12px] text-gray-500 py-4">
                Loading files...
              </div>
            )}
            {!loadingFiles && results.length === 0 && (
              <div className="text-center text-[12px] text-gray-500 py-4">
                No matches found
              </div>
            )}
            {!loadingFiles && results.map((item, index) => (
              <button
                type="button"
                key={item.id}
                onClick={() => runCommand(item.id)}
                className={`w-full rounded-2xl px-4 py-3 text-left transition-all ${
                  index === selectedIndex ? 'bg-white/10' : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-[#8b5cf6] flex-shrink-0">{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-white font-medium truncate">{item.label}</p>
                    {item.subtitle ? (
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">{getRelativePath(item.subtitle)}</p>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
