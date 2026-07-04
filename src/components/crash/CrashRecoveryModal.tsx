import { memo, useCallback, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { getLatestSnapshot } from '../../lib/sessionSnapshots'
import { buildAiSessionKey } from '../../store/appStore'
import CrashHistoryModal from './CrashHistoryModal'

interface LastCrash {
  timestamp: string
  component: string
  reason: string
  shortStack?: string
  details?: any
  suggestedSafeMode?: string[]
}

function severityForComponent(component: string) {
  const fatal = ['uncaught-exception', 'unhandled-rejection', 'extension-host', 'renderer']
  const recoverable = ['workspace-restore', 'ai-recovery', 'extension-crash']
  if (fatal.includes(component)) return 'red'
  if (recoverable.includes(component)) return 'yellow'
  return 'gray'
}

export default memo(function CrashRecoveryModal({ crash, onClose }: { crash: LastCrash; onClose: () => void }) {
  const setAiSessionCache = useAppStore((s) => s.setAiSessionCache)
  const setAiSessionHistory = useAppStore((s) => s.setAiSessionHistory)
  const setAiChatHistory = useAppStore((s) => s.setAiChatHistory)
  const setRootPath = useAppStore((s) => s.setRootPath)

  const severity = severityForComponent(crash.component)

  const handleOpenSafe = useCallback(async () => {
    try {
      await (window as any).electronAPI?.app?.relaunchSafe()
    } catch (err) {
      console.error('Failed to relaunch safe:', err)
    }
  }, [])

  const [showHistory, setShowHistory] = useState(false)

  const handleViewDiagnostics = useCallback(async () => {
    try {
      await (window as any).electronAPI?.app?.openDiagnosticsFolder()
    } catch (err) {
      console.error('Failed to open diagnostics:', err)
    }
  }, [])

  const handleViewHistory = useCallback(() => {
    setShowHistory(true)
  }, [])

  const handleRestore = useCallback(async () => {
    try {
      const snap = getLatestSnapshot()
      if (snap && snap.data) {
        const key = buildAiSessionKey(snap.data.provider as any, snap.data.model)
        // Rehydrate AI session state
        setAiSessionCache({ [key]: {
          history: snap.data.chatHistory || [],
          systemPrompt: snap.data.systemPrompt || '',
          showSystemPrompt: snap.data.visibility?.showSystemPrompt ?? true,
          showUserPrompt: snap.data.visibility?.showUserPrompt ?? true,
          showSelectedFile: snap.data.visibility?.showSelectedFile ?? true,
          showAttachedFiles: snap.data.visibility?.showAttachedFiles ?? true,
          showImportedFiles: snap.data.visibility?.showImportedFiles ?? true,
          showWorkspaceContext: snap.data.visibility?.showWorkspaceContext ?? true,
          temperature: snap.data.parameters?.temperature ?? 0.5,
          maxTokens: snap.data.parameters?.maxTokens ?? 1024,
          topP: snap.data.parameters?.topP ?? 1,
          attachedFiles: snap.data.attachedFiles || [],
          tokenHistory: [],
        } })
      }

      // If crash details include a workspace path, attempt to reopen it
      try {
        const details = crash.details
        if (details && typeof details === 'object' && details.workspaceRoot) {
          await (window as any).loadDirectory(details.workspaceRoot)
        }
      } catch {}

    } catch (err) {
      console.error('Restore last session failed:', err)
    } finally {
      onClose()
    }
  }, [crash, onClose, setAiSessionCache])

  const handleDismiss = useCallback(() => {
    onClose()
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[520px] rounded-2xl border border-white/10 bg-[#08080b] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500">Nexa IDE recovered from a crash</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Last crash details</h2>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-300">
          <div>
            <div className="text-xs text-slate-500">Timestamp</div>
            <div className="mt-1">{new Date(crash.timestamp).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Component</div>
            <div className="mt-1">{crash.component}</div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-slate-500">Reason</div>
            <div className="mt-1 text-white">{crash.reason}</div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-slate-500">Stack summary</div>
            <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-[12px] text-slate-300">{crash.shortStack}</pre>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="text-sm">
            <span className={severity === 'red' ? 'text-red-400' : severity === 'yellow' ? 'text-amber-300' : 'text-slate-400'}>
              {severity === 'red' ? 'Fatal crash' : severity === 'yellow' ? 'Recoverable crash' : 'Unknown severity'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleOpenSafe} className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">Open in Safe Mode</button>
            <button onClick={handleRestore} className="rounded-2xl bg-[#8b5cf6] px-4 py-2 text-sm font-semibold text-white">Restore Last Session</button>
            <button onClick={handleViewHistory} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">View Crash History</button>
            <button onClick={handleViewDiagnostics} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">View Diagnostics</button>
            <button onClick={handleDismiss} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">Dismiss</button>
          </div>
        </div>
      </div>
      {showHistory && <CrashHistoryModal onClose={() => setShowHistory(false)} />}
    </div>
  )
})
