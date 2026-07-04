import { memo, useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'

interface CrashHistoryEntry {
  timestamp: string
  component: string
  reason: string
  shortStack?: string
  details?: string
  suggestedSafeMode?: string[]
}

export default memo(function CrashHistoryModal({ onClose }: { onClose: () => void }) {
  const addNotification = useAppStore((state) => state.addNotification)
  const [history, setHistory] = useState<CrashHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await window.electronAPI?.app?.getCrashHistory()
        if (!res || res.error) {
          setError(res?.error || 'Failed to load crash history')
          setHistory([])
        } else {
          setHistory(res.history || [])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load crash history')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const handleClearHistory = useCallback(async () => {
    setClearing(true)
    try {
      const res = await window.electronAPI?.app?.clearCrashHistory()
      if (res?.success) {
        setHistory([])
        addNotification('Crash history cleared', 'success')
      } else {
        addNotification(`Failed to clear crash history: ${res?.error ?? 'Unknown'}`, 'error')
      }
    } catch (err) {
      addNotification(`Failed to clear crash history: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    } finally {
      setClearing(false)
    }
  }, [addNotification])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#08080b] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500">Crash history</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Recent crash events</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearHistory}
              disabled={loading || clearing}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear History
            </button>
            <button
              onClick={onClose}
              className="rounded-2xl bg-[#8b5cf6] px-4 py-2 text-sm font-semibold text-white"
            >
              Close
            </button>
          </div>
        </div>

        <div className="max-h-[520px] overflow-auto px-6 py-4">
          {loading ? (
            <div className="text-sm text-slate-400">Loading crash history…</div>
          ) : error ? (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
              {error}
            </div>
          ) : history.length === 0 ? (
            <div className="text-sm text-slate-400">No crash history found.</div>
          ) : (
            <div className="space-y-4">
              {history.map((entry) => (
                <div key={`${entry.timestamp}-${entry.component}`} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{new Date(entry.timestamp).toLocaleString()}</div>
                      <div className="mt-1 text-sm font-semibold text-white">{entry.component}</div>
                    </div>
                    <div className="text-xs text-slate-400">{entry.suggestedSafeMode?.length ? 'Safe mode suggested' : 'No safe mode hint'}</div>
                  </div>
                  <div className="mt-3 text-sm text-slate-200">{entry.reason}</div>
                  {entry.shortStack ? (
                    <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/5 bg-slate-950/70 p-3 text-[12px] text-slate-300">
                      {entry.shortStack}
                    </pre>
                  ) : null}
                  {entry.details ? (
                    <div className="mt-3 rounded-2xl border border-white/5 bg-slate-950/70 p-3 text-[12px] text-slate-300">
                      <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Details</div>
                      <div className="mt-2 whitespace-pre-wrap break-words">{entry.details}</div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
