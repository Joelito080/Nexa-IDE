import { memo, useEffect, useCallback, useState, useRef } from 'react'
import {
  GitBranch, RefreshCw, Plus, Check, ChevronDown, ChevronRight,
  Minus, RotateCcw, Clock, GitCommit, Trash2, Upload, Download,
  AlertCircle, FileText, FolderGit2,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useGitStore, refreshAll, refreshGitChanges, refreshGitBranches, refreshGitLog } from '../../store/gitStore'
import type { GitFileStatus, GitView } from '../../store/gitStore'
import FileDiffViewer from './FileDiffViewer'
import { EmptyState } from '../ui/EmptyState'

// ── Status code → colour ──────────────────────────────────────────────────────
function statusColor(s: string): string {
  switch (s) {
    case 'M': return '#fbbf24'  // modified — amber
    case 'A': return '#4ade80'  // added — green
    case 'D': return '#f87171'  // deleted — red
    case 'R': return '#60a5fa'  // renamed — blue
    default:  return '#94a3b8'  // untracked / other
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case 'M': return 'M'
    case 'A': return 'A'
    case 'D': return 'D'
    case 'R': return 'R'
    default:  return '?'
  }
}

// ── Relative time helper ───────────────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(dateStr).toLocaleDateString()
}

// ── File Row ──────────────────────────────────────────────────────────────────
interface FileRowProps {
  file: GitFileStatus | string
  isUntracked?: boolean
  isStaged: boolean
  isSelected: boolean
  rootPath: string
  onSelect: () => void
  onStage?: () => void
  onUnstage?: () => void
  onDiscard?: () => void
}

const FileRow = memo(function FileRow({
  file, isUntracked, isStaged, isSelected, rootPath,
  onSelect, onStage, onUnstage, onDiscard,
}: FileRowProps) {
  const filePath = typeof file === 'string' ? file : file.path
  const statusCode = typeof file === 'string' ? '?' : file.status
  const fileName = filePath.split('/').pop() ?? filePath
  const fileDir = filePath.includes('/') ? filePath.split('/').slice(0, -1).join('/') : ''

  return (
    <div
      className="group flex items-center gap-2 px-3 py-1.5 cursor-pointer rounded-lg transition-all duration-100"
      style={{
        background: isSelected ? 'rgba(139,92,246,0.15)' : undefined,
        borderLeft: isSelected ? '2px solid #8b5cf6' : '2px solid transparent',
      }}
      onClick={onSelect}
    >
      {/* Status badge */}
      <span
        className="text-[10px] font-bold w-4 text-center shrink-0"
        style={{ color: statusColor(statusCode) }}
      >
        {statusLabel(statusCode)}
      </span>

      {/* Filename */}
      <div className="flex-1 min-w-0">
        <span className="text-[12px] text-white truncate block">{fileName}</span>
        {fileDir && (
          <span className="text-[10px] text-[#475569] truncate block">{fileDir}</span>
        )}
      </div>

      {/* Action buttons (show on hover) */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {onDiscard && (
          <button
            type="button"
            title="Discard changes"
            onClick={(e) => { e.stopPropagation(); onDiscard() }}
            className="p-1 rounded hover:bg-red-500/20 text-[#f87171] transition-colors"
          >
            <RotateCcw size={11} />
          </button>
        )}
        {onUnstage && (
          <button
            type="button"
            title="Unstage"
            onClick={(e) => { e.stopPropagation(); onUnstage() }}
            className="p-1 rounded hover:bg-amber-500/20 text-[#fbbf24] transition-colors"
          >
            <Minus size={11} />
          </button>
        )}
        {onStage && (
          <button
            type="button"
            title="Stage"
            onClick={(e) => { e.stopPropagation(); onStage() }}
            className="p-1 rounded hover:bg-green-500/20 text-[#4ade80] transition-colors"
          >
            <Plus size={11} />
          </button>
        )}
      </div>
    </div>
  )
})

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({
  title, count, expanded, onToggle, action,
}: {
  title: string
  count: number
  expanded: boolean
  onToggle: () => void
  action?: React.ReactNode
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 cursor-pointer select-none"
      onClick={onToggle}
    >
      <div className="flex items-center gap-1.5">
        {expanded ? <ChevronDown size={12} className="text-[#475569]" /> : <ChevronRight size={12} className="text-[#475569]" />}
        <span className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider">{title}</span>
        <span className="text-[10px] text-[#475569] ml-1">({count})</span>
      </div>
      {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
    </div>
  )
}

// ── Changes View ───────────────────────────────────────────────────────────────
function ChangesView({ rootPath }: { rootPath: string }) {
  const {
    staged, unstaged, untracked, selectedFile, selectedFileIsStaged,
    commitMessage, isLoading,
    setSelectedFile, setCommitMessage, clearSelection,
  } = useGitStore()
  const addNotification = useAppStore((s) => s.addNotification)
  const setGitBranch = useAppStore((s) => s.setGitBranch)
  const setGitStatusSummary = useAppStore((s) => s.setGitStatusSummary)

  const [stagedExpanded, setStagedExpanded] = useState(true)
  const [unstagedExpanded, setUnstagedExpanded] = useState(true)
  const [untrackedExpanded, setUntrackedExpanded] = useState(true)
  const [committing, setCommitting] = useState(false)

  const refresh = useCallback(async () => {
    await refreshGitChanges(rootPath)
    // Also refresh global branch info
    const res = await window.electronAPI?.git.status(rootPath)
    if (res && !('error' in res)) {
      setGitBranch(res.branch || 'main')
      setGitStatusSummary(res.statusSummary)
    }
  }, [rootPath, setGitBranch, setGitStatusSummary])

  const handleStageFile = useCallback(async (filePath: string) => {
    const res = await window.electronAPI?.git.stageFile(rootPath, filePath)
    if (res && 'error' in res) addNotification(`Stage failed: ${res.error}`, 'error')
    else refresh()
  }, [rootPath, addNotification, refresh])

  const handleUnstageFile = useCallback(async (filePath: string) => {
    const res = await window.electronAPI?.git.unstageFile(rootPath, filePath)
    if (res && 'error' in res) addNotification(`Unstage failed: ${res.error}`, 'error')
    else refresh()
  }, [rootPath, addNotification, refresh])

  const handleDiscardFile = useCallback(async (filePath: string, isUntracked: boolean) => {
    const res = await window.electronAPI?.git.discardFile(rootPath, filePath, isUntracked)
    if (res && 'error' in res) addNotification(`Discard failed: ${res.error}`, 'error')
    else { if (selectedFile === filePath) clearSelection(); refresh() }
  }, [rootPath, addNotification, refresh, selectedFile, clearSelection])

  const handleStageAll = useCallback(async () => {
    const res = await window.electronAPI?.git.stageAll(rootPath)
    if (res && 'error' in res) addNotification(`Stage All failed: ${res.error}`, 'error')
    else refresh()
  }, [rootPath, addNotification, refresh])

  const handleCommitStaged = useCallback(async () => {
    if (!commitMessage.trim()) { addNotification('Enter a commit message', 'warning'); return }
    if (staged.length === 0) { addNotification('No staged changes to commit', 'warning'); return }
    setCommitting(true)
    try {
      const res = await window.electronAPI?.git.commitStaged(rootPath, commitMessage.trim())
      if (res && 'error' in res) addNotification(`Commit failed: ${res.error}`, 'error')
      else {
        addNotification(`Committed: ${res?.hash ?? ''}`, 'success')
        setCommitMessage('')
        clearSelection()
        await Promise.all([refreshGitChanges(rootPath), refreshGitLog(rootPath)])
      }
    } finally {
      setCommitting(false)
    }
  }, [rootPath, commitMessage, staged.length, addNotification, setCommitMessage, clearSelection])

  const handleCommitAll = useCallback(async () => {
    if (!commitMessage.trim()) { addNotification('Enter a commit message', 'warning'); return }
    setCommitting(true)
    try {
      const res = await window.electronAPI?.git.commitAll(rootPath, commitMessage.trim())
      if (res && 'error' in res) addNotification(`Commit All failed: ${res.error}`, 'error')
      else {
        addNotification(`Committed all: ${res?.hash ?? ''}`, 'success')
        setCommitMessage('')
        clearSelection()
        await Promise.all([refreshGitChanges(rootPath), refreshGitLog(rootPath)])
      }
    } finally {
      setCommitting(false)
    }
  }, [rootPath, commitMessage, addNotification, setCommitMessage, clearSelection])

  const totalChanges = staged.length + unstaged.length + untracked.length
  const showDiff = selectedFile !== null

  return (
    <div className="flex flex-col h-full">
      {/* Commit area */}
      <div className="px-3 py-3 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message…"
          rows={2}
          className="w-full rounded-lg px-3 py-2 text-[12px] outline-none resize-none transition-colors"
          style={{
            background: 'rgba(19,20,30,0.8)',
            border: '1px solid rgba(139,92,246,0.18)',
            color: '#f1f5f9',
            lineHeight: 1.5,
          }}
          onFocus={(e) => { e.target.style.borderColor = 'rgba(139,92,246,0.5)' }}
          onBlur={(e) => { e.target.style.borderColor = 'rgba(139,92,246,0.18)' }}
        />

        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            disabled={committing || staged.length === 0 || !commitMessage.trim()}
            onClick={handleCommitStaged}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg,#8b5cf6,#6366f1)',
              color: 'white',
            }}
          >
            <GitCommit size={12} />
            Commit Staged {staged.length > 0 ? `(${staged.length})` : ''}
          </button>
          <button
            type="button"
            disabled={committing || totalChanges === 0 || !commitMessage.trim()}
            onClick={handleCommitAll}
            title="Stage all + commit"
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-40"
            style={{
              background: 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.3)',
              color: '#a78bfa',
            }}
          >
            All
          </button>
        </div>
      </div>

      {/* File lists + diff — scrollable area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {totalChanges === 0 && !isLoading ? (
          <EmptyState
            icon={<Check size={22} className="text-[#4ade80]" />}
            title="Working tree clean"
            subtitle="No changes detected in your workspace repository"
          />
        ) : (
          <div className="py-1">
            {/* Staged */}
            {(staged.length > 0 || true) && (
              <div className="mb-1">
                <SectionHeader
                  title="Staged"
                  count={staged.length}
                  expanded={stagedExpanded}
                  onToggle={() => setStagedExpanded((v) => !v)}
                  action={
                    staged.length > 0 ? (
                      <button
                        type="button"
                        title="Unstage all"
                        onClick={async () => {
                          for (const f of staged) await window.electronAPI?.git.unstageFile(rootPath, f.path)
                          refresh()
                        }}
                        className="text-[10px] text-[#fbbf24] hover:text-amber-300 px-1.5 py-0.5 rounded transition-colors"
                      >
                        Unstage all
                      </button>
                    ) : null
                  }
                />
                {stagedExpanded && staged.map((f) => (
                  <FileRow
                    key={f.path}
                    file={f}
                    isStaged={true}
                    isSelected={selectedFile === f.path && selectedFileIsStaged}
                    rootPath={rootPath}
                    onSelect={() => setSelectedFile(f.path, true)}
                    onUnstage={() => handleUnstageFile(f.path)}
                    onDiscard={() => handleDiscardFile(f.path, false)}
                  />
                ))}
              </div>
            )}

            {/* Unstaged */}
            {(unstaged.length > 0) && (
              <div className="mb-1">
                <SectionHeader
                  title="Unstaged"
                  count={unstaged.length}
                  expanded={unstagedExpanded}
                  onToggle={() => setUnstagedExpanded((v) => !v)}
                  action={
                    <button
                      type="button"
                      title="Stage all"
                      onClick={handleStageAll}
                      className="text-[10px] text-[#4ade80] hover:text-green-300 px-1.5 py-0.5 rounded transition-colors"
                    >
                      Stage all
                    </button>
                  }
                />
                {unstagedExpanded && unstaged.map((f) => (
                  <FileRow
                    key={f.path}
                    file={f}
                    isStaged={false}
                    isSelected={selectedFile === f.path && !selectedFileIsStaged}
                    rootPath={rootPath}
                    onSelect={() => setSelectedFile(f.path, false)}
                    onStage={() => handleStageFile(f.path)}
                    onDiscard={() => handleDiscardFile(f.path, false)}
                  />
                ))}
              </div>
            )}

            {/* Untracked */}
            {untracked.length > 0 && (
              <div className="mb-1">
                <SectionHeader
                  title="Untracked"
                  count={untracked.length}
                  expanded={untrackedExpanded}
                  onToggle={() => setUntrackedExpanded((v) => !v)}
                />
                {untrackedExpanded && untracked.map((fp) => (
                  <FileRow
                    key={fp}
                    file={{ path: fp, status: '?' }}
                    isUntracked={true}
                    isStaged={false}
                    isSelected={selectedFile === fp && !selectedFileIsStaged}
                    rootPath={rootPath}
                    onSelect={() => setSelectedFile(fp, false)}
                    onStage={() => handleStageFile(fp)}
                    onDiscard={() => handleDiscardFile(fp, true)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inline diff viewer */}
        {showDiff && selectedFile && (
          <div
            className="border-t shrink-0"
            style={{
              borderColor: 'rgba(139,92,246,0.2)',
              height: '320px',
              minHeight: '320px',
            }}
          >
            <FileDiffViewer
              projectPath={rootPath}
              filePath={selectedFile}
              isStaged={selectedFileIsStaged}
              onClose={clearSelection}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── History View ───────────────────────────────────────────────────────────────
function HistoryView({ rootPath }: { rootPath: string }) {
  const { commits, isLoading } = useGitStore()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [commitFilesMap, setCommitFilesMap] = useState<Record<string, { path: string; status: string }[]>>({})
  const [loadingFilesMap, setLoadingFilesMap] = useState<Record<string, boolean>>({})

  const addNotification = useAppStore((s) => s.addNotification)
  const setGitBranch = useAppStore((s) => s.setGitBranch)
  const { confirm } = useModal()

  useEffect(() => {
    refreshGitLog(rootPath)
  }, [rootPath])

  // Lazy-load changed files when commit is expanded
  useEffect(() => {
    if (!expanded) return
    if (commitFilesMap[expanded]) return

    let cancelled = false
    async function loadFiles() {
      setLoadingFilesMap((prev) => ({ ...prev, [expanded!]: true }))
      try {
        const res = await window.electronAPI?.git.commitFiles(rootPath, expanded!)
        if (cancelled) return
        if (res && !('error' in res)) {
          setCommitFilesMap((prev) => ({ ...prev, [expanded!]: res.files }))
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setLoadingFilesMap((prev) => ({ ...prev, [expanded!]: false }))
        }
      }
    }
    loadFiles()
    return () => { cancelled = true }
  }, [expanded, rootPath, commitFilesMap])

  const filteredCommits = commits.filter((c) => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return (
      c.message.toLowerCase().includes(q) ||
      c.author.toLowerCase().includes(q) ||
      c.hash.toLowerCase().includes(q)
    )
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <span className="text-[12px] text-[#475569] animate-pulse">Loading history…</span>
      </div>
    )
  }

  if (commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <Clock size={22} className="text-[#475569]" />
        <p className="text-[12px] text-[#6b7280]">No commits found</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search Input */}
      <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search commits by msg, author, hash..."
          className="w-full rounded-lg px-2.5 py-1.5 text-[11px] outline-none transition-colors"
          style={{
            background: 'rgba(19,20,30,0.8)',
            border: '1px solid rgba(139,92,246,0.18)',
            color: '#f1f5f9',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.18)' }}
        />
      </div>

      {/* Commits List */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredCommits.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-[12px] text-[#6b7280]">No matching commits</p>
          </div>
        ) : (
          filteredCommits.map((c) => (
            <div key={c.hash} className="group">
              <div
                className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-white/5 rounded-lg mx-1 transition-colors"
                onClick={() => setExpanded(expanded === c.hash ? null : c.hash)}
              >
                <div
                  className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)' }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-white truncate font-semibold">{c.message}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-mono text-[#8b5cf6]">{c.shortHash}</span>
                    <span className="text-[10px] text-[#475569]">{c.author}</span>
                    <span className="text-[10px] text-[#334155]">{relativeTime(c.date)}</span>
                  </div>
                </div>
              </div>
              {expanded === c.hash && (
                <div
                  className="mx-3 mb-2 px-3 py-2.5 rounded-lg text-[11px] flex flex-col gap-2"
                  style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.12)' }}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-purple-500/10 pb-1.5">
                    <span className="font-mono text-[#8b5cf6] select-all truncate shrink-0 max-w-[140px]" title="Copy hash">
                      {c.hash.slice(0, 12)}...
                    </span>
                    <div className="flex items-center gap-1.5">
                      {/* Copy hash button */}
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation()
                          await navigator.clipboard.writeText(c.hash)
                          addNotification('Commit hash copied to clipboard', 'success')
                        }}
                        className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white transition-colors"
                      >
                        Copy
                      </button>
                      {/* Checkout commit button */}
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation()
                          const ok = await confirm({
                            title: 'Checkout Commit',
                            message: `Warning: Checking out commit ${c.shortHash} will put you in a 'detached HEAD' state. You will not be on any branch. Proceed?`,
                            confirmText: 'Checkout Detached',
                            cancelText: 'Cancel'
                          })
                          if (!ok) return
                          const res = await window.electronAPI?.git.checkoutCommit(rootPath, c.hash)
                          if (res && 'error' in res) {
                            addNotification(`Checkout failed: ${res.error}`, 'error')
                          } else {
                            addNotification(`Checked out commit ${c.shortHash} (detached HEAD)`, 'success')
                            setGitBranch(c.shortHash)
                            await refreshGitBranches(rootPath)
                            await refreshGitChanges(rootPath)
                            await refreshGitLog(rootPath)
                          }
                        }}
                        className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-[#fbbf24] transition-colors"
                      >
                        Checkout
                      </button>
                    </div>
                  </div>
                  
                  <div className="text-[#6b7280] space-y-0.5">
                    <p>Author: <span className="text-slate-300 font-semibold">{c.author} &lt;{c.email}&gt;</span></p>
                    <p>Date: <span className="text-slate-300 font-semibold">{new Date(c.date).toLocaleString()}</span></p>
                  </div>

                  {/* Changed files list */}
                  <div className="mt-1 border-t border-purple-500/10 pt-1.5">
                    <p className="text-[10px] font-semibold text-[#8b5cf6] uppercase tracking-wider mb-1">Files Changed</p>
                    
                    {loadingFilesMap[c.hash] ? (
                      <p className="text-slate-500 italic py-0.5">Loading changed files...</p>
                    ) : (commitFilesMap[c.hash] || []).length === 0 ? (
                      <p className="text-slate-500 italic py-0.5">No files modified in this commit</p>
                    ) : (
                      <div className="flex flex-col gap-1 max-h-40 overflow-y-auto mt-1 pr-1">
                        {(commitFilesMap[c.hash] || []).map((file) => {
                          const fileName = file.path.split('/').pop() || file.path
                          return (
                            <div
                              key={file.path}
                              onClick={() => {
                                const diffTabPath = `gitdiff://${c.hash}/${file.path}`
                                const currentTabs = useAppStore.getState().openTabs
                                const setOpenTabs = useAppStore.getState().setOpenTabs
                                const setSelectedFilePath = useAppStore.getState().setSelectedFilePath
                                
                                if (!currentTabs.includes(diffTabPath)) {
                                  setOpenTabs([...currentTabs, diffTabPath])
                                }
                                setSelectedFilePath(diffTabPath)
                              }}
                              className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-white/5 hover:bg-purple-500/10 cursor-pointer text-slate-300 hover:text-white transition-all group/file"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[10px] font-mono shrink-0 w-3 text-center" style={{ color: statusColor(file.status) }}>
                                  {statusLabel(file.status)}
                                </span>
                                <span className="truncate max-w-[150px]" title={file.path}>{fileName}</span>
                              </div>
                              
                              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/file:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  title="Restore file from this commit"
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    const confirmRestore = await confirm({
                                      title: 'Restore File',
                                      message: `Are you sure you want to restore file "${fileName}" to its state at commit ${c.shortHash}? This will overwrite your working copy of this file.`,
                                      confirmText: 'Restore File',
                                      cancelText: 'Cancel'
                                    })
                                    if (!confirmRestore) return
                                    const res = await window.electronAPI?.git.restoreFile(rootPath, c.hash, file.path)
                                    if (res && 'error' in res) {
                                      addNotification(`Restore failed: ${res.error}`, 'error')
                                    } else {
                                      addNotification(`Restored ${fileName} from ${c.shortHash}`, 'success')
                                      await refreshGitChanges(rootPath)
                                    }
                                  }}
                                  className="p-0.5 rounded hover:bg-purple-500/20 text-[#a78bfa] transition-colors"
                                >
                                  <RotateCcw size={11} />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Branches View ──────────────────────────────────────────────────────────────
function BranchesView({ rootPath }: { rootPath: string }) {
  const { branches, currentBranch, isLoading, setBranches } = useGitStore()
  const addNotification = useAppStore((s) => s.addNotification)
  const setGitBranch = useAppStore((s) => s.setGitBranch)
  const { prompt, confirm } = useModal()
  const [localExpanded, setLocalExpanded] = useState(true)
  const [remoteExpanded, setRemoteExpanded] = useState(false)

  const localBranches = branches.filter((b) => !b.startsWith('remotes/'))
  const remoteBranches = branches.filter((b) => b.startsWith('remotes/'))

  const handleCheckout = useCallback(async (branch: string) => {
    const res = await window.electronAPI?.git.checkoutBranch(rootPath, branch)
    if (res && 'error' in res) {
      addNotification(`Checkout failed: ${res.error}`, 'error')
    } else {
      addNotification(`Switched to ${branch}`, 'success')
      setGitBranch(branch)
      await refreshGitBranches(rootPath)
      await refreshGitChanges(rootPath)
    }
  }, [rootPath, addNotification, setGitBranch])

  const handleCreateBranch = useCallback(async () => {
    const name = await prompt({ title: 'New Branch', message: 'Enter branch name:', placeholder: 'feature/my-branch', confirmText: 'Create' })
    if (!name) return
    const res = await window.electronAPI?.git.createBranch(rootPath, name.trim(), true)
    if (res && 'error' in res) {
      addNotification(`Create branch failed: ${res.error}`, 'error')
    } else {
      addNotification(`Created + switched to ${name.trim()}`, 'success')
      setGitBranch(name.trim())
      await refreshGitBranches(rootPath)
    }
  }, [rootPath, addNotification, setGitBranch, prompt])

  const handleDeleteBranch = useCallback(async (branch: string) => {
    const ok = await confirm({ title: 'Delete Branch', message: `Delete branch "${branch}"?`, confirmText: 'Delete', cancelText: 'Cancel' })
    if (!ok) return
    const res = await window.electronAPI?.git.deleteBranch(rootPath, branch, false)
    if (res && 'error' in res) {
      addNotification(`Delete failed: ${res.error}`, 'error')
    } else {
      addNotification(`Deleted ${branch}`, 'success')
      await refreshGitBranches(rootPath)
    }
  }, [rootPath, addNotification, confirm])

  function BranchItem({ branch, isCurrent }: { branch: string; isCurrent: boolean }) {
    const displayName = branch.replace(/^remotes\/[^/]+\//, '')
    const isRemote = branch.startsWith('remotes/')

    return (
      <div
        className="group flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors mx-1"
        style={{
          background: isCurrent ? 'rgba(139,92,246,0.15)' : undefined,
          borderLeft: isCurrent ? '2px solid #8b5cf6' : '2px solid transparent',
        }}
        onClick={() => !isCurrent && !isRemote && handleCheckout(branch)}
      >
        <GitBranch size={12} style={{ color: isCurrent ? '#a78bfa' : '#475569' }} className="shrink-0" />
        <span className={`flex-1 text-[12px] truncate ${isCurrent ? 'text-white font-semibold' : 'text-[#94a3b8]'}`}>
          {displayName}
        </span>
        {isCurrent && (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0"
            style={{ background: 'rgba(139,92,246,0.25)', color: '#a78bfa' }}>
            CURRENT
          </span>
        )}
        {!isCurrent && !isRemote && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
            <button
              type="button"
              title="Checkout"
              onClick={(e) => { e.stopPropagation(); handleCheckout(branch) }}
              className="p-1 rounded hover:bg-purple-500/20 text-[#a78bfa] transition-colors"
            >
              <Check size={10} />
            </button>
            <button
              type="button"
              title="Delete"
              onClick={(e) => { e.stopPropagation(); handleDeleteBranch(branch) }}
              className="p-1 rounded hover:bg-red-500/20 text-[#f87171] transition-colors"
            >
              <Trash2 size={10} />
            </button>
          </div>
        )}
        {!isCurrent && isRemote && (
          <button
            type="button"
            title="Track & checkout"
            onClick={(e) => { e.stopPropagation(); handleCheckout(branch) }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-purple-500/20 text-[#a78bfa] transition-opacity"
          >
            <Check size={10} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* New branch button */}
      <div className="px-3 py-2.5 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <button
          type="button"
          onClick={handleCreateBranch}
          className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
          style={{
            background: 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.3)',
            color: '#a78bfa',
          }}
        >
          <Plus size={13} /> New Branch
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <span className="text-[12px] text-[#475569] animate-pulse">Loading…</span>
          </div>
        ) : (
          <>
            {/* Local branches */}
            <SectionHeader
              title="Local"
              count={localBranches.length}
              expanded={localExpanded}
              onToggle={() => setLocalExpanded((v) => !v)}
            />
            {localExpanded && localBranches.map((b) => (
              <BranchItem key={b} branch={b} isCurrent={b === currentBranch} />
            ))}

            {/* Remote branches */}
            {remoteBranches.length > 0 && (
              <>
                <div className="mt-2">
                  <SectionHeader
                    title="Remote"
                    count={remoteBranches.length}
                    expanded={remoteExpanded}
                    onToggle={() => setRemoteExpanded((v) => !v)}
                  />
                  {remoteExpanded && remoteBranches.map((b) => (
                    <BranchItem key={b} branch={b} isCurrent={false} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── useModal shim ─────────────────────────────────────────────────────────────
// Reuses the existing modal system from appStore
function useModal() {
  const openModal = useAppStore((s) => s.openModal)
  const closeModal = useAppStore((s) => s.closeModal)

  const prompt = useCallback(({ title, message, placeholder, confirmText }: {
    title: string; message?: string; placeholder?: string; confirmText?: string
  }): Promise<string | null> => {
    return new Promise((resolve) => {
      openModal({
        id: `git-${Date.now()}`,
        type: 'prompt',
        title,
        message,
        placeholder,
        confirmText: confirmText ?? 'OK',
        cancelText: 'Cancel',
        resolve,
      })
    })
  }, [openModal])

  const confirm = useCallback(({ title, message, confirmText, cancelText }: {
    title: string; message?: string; confirmText?: string; cancelText?: string
  }): Promise<boolean> => {
    return new Promise((resolve) => {
      openModal({
        id: `git-${Date.now()}`,
        type: 'confirm',
        title,
        message,
        confirmText: confirmText ?? 'OK',
        cancelText: cancelText ?? 'Cancel',
        resolve,
      })
    })
  }, [openModal])

  return { prompt, confirm }
}

// ── Main GitPanel ─────────────────────────────────────────────────────────────
interface GitPanelProps {
  rootPath: string | null
}

const GitPanel = memo(function GitPanel({ rootPath }: GitPanelProps) {
  const {
    activeView, staged, unstaged, untracked, currentBranch, isLoading,
    setActiveView,
  } = useGitStore()
  const addNotification = useAppStore((s) => s.addNotification)
  const setGitBranch = useAppStore((s) => s.setGitBranch)
  const setGitStatusSummary = useAppStore((s) => s.setGitStatusSummary)

  const totalChanges = staged.length + unstaged.length + untracked.length

  const doRefresh = useCallback(async () => {
    if (!rootPath) return
    await refreshAll(rootPath)
    const res = await window.electronAPI?.git.status(rootPath)
    if (res && !('error' in res)) {
      setGitBranch(res.branch || 'main')
      setGitStatusSummary(res.statusSummary)
    }
  }, [rootPath, setGitBranch, setGitStatusSummary])

  // Initial load
  useEffect(() => {
    if (rootPath) {
      doRefresh()
    }
  }, [rootPath, doRefresh])

  if (!rootPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <EmptyState
          icon={<FolderGit2 size={22} />}
          title="No repository"
          subtitle="Open a folder that contains a Git repository to use source control"
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Branch header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GitBranch size={13} className="text-[#8b5cf6] shrink-0" />
          <span className="text-[12px] font-semibold text-white truncate">
            {currentBranch || '—'}
          </span>
          {currentBranch && /^[0-9a-f]{7,40}$/i.test(currentBranch) && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 bg-amber-500/20 text-[#fbbf24] border border-amber-500/30 animate-pulse font-sans"
              title="You are in a 'detached HEAD' state. Any commits you make will not belong to any branch."
            >
              Detached
            </span>
          )}
          {totalChanges > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24' }}
            >
              {totalChanges}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={async () => {
              const res = await window.electronAPI?.git.pull(rootPath)
              if (res && (res as any).error) addNotification(`Pull failed: ${(res as any).error}`, 'error')
              else { addNotification('Pulled', 'success'); doRefresh() }
            }}
            className="p-1.5 rounded hover:bg-white/5 text-[#475569] hover:text-white transition-colors"
            title="Pull"
          >
            <Download size={13} />
          </button>
          <button
            type="button"
            onClick={async () => {
              const res = await window.electronAPI?.git.push(rootPath)
              if (res && (res as any).error) addNotification(`Push failed: ${(res as any).error}`, 'error')
              else addNotification('Pushed', 'success')
            }}
            className="p-1.5 rounded hover:bg-white/5 text-[#475569] hover:text-white transition-colors"
            title="Push"
          >
            <Upload size={13} />
          </button>
          <button
            type="button"
            onClick={doRefresh}
            disabled={isLoading}
            className="p-1.5 rounded hover:bg-white/5 text-[#475569] hover:text-white transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="flex shrink-0 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.07)' }}
      >
        {[
          { id: 'changes', label: 'Changes', badge: totalChanges > 0 ? totalChanges : undefined },
          { id: 'history', label: 'History', badge: undefined },
          { id: 'branches', label: 'Branches', badge: undefined },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveView(tab.id as GitView)}
            className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold transition-colors relative"
            style={{
              color: activeView === tab.id ? '#a78bfa' : '#475569',
              borderBottom: activeView === tab.id ? '2px solid #8b5cf6' : '2px solid transparent',
            }}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className="text-[9px] font-bold px-1 py-0.5 rounded-full"
                style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24' }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* View content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeView === 'changes' && <ChangesView rootPath={rootPath} />}
        {activeView === 'history' && <HistoryView rootPath={rootPath} />}
        {activeView === 'branches' && <BranchesView rootPath={rootPath} />}
      </div>
    </div>
  )
})

export default GitPanel
