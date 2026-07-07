import React, { useEffect, useState } from 'react'
import { Bot } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { computeHealthScore } from '../../lib/aiHealthEngine'

function statusColorFor(metrics: any) {
  // Simple heuristic combining token pressure and latency/errors
  const tokenRatio = metrics.tokenBudget && metrics.currentTokenUsage ? (metrics.currentTokenUsage / Math.max(1, metrics.tokenBudget)) : 0
  const latency = metrics.latencyAverage ?? metrics.latency?.average ?? 0
  const errors = metrics.errorCount ?? 0

  if (tokenRatio > 0.8 || latency > 5 || errors > 3) return 'red'
  if (tokenRatio > 0.6 || latency > 2 || errors > 0) return 'yellow'
  return 'green'
}

export default function AIHealthPanel() {
  const [state, setState] = useState<any>({})
  const requestFocus = useAppStore((s) => s.requestAIPanelFocus)

  const refresh = async () => {
    try {
      const budget = await window.electronAPI?.ai.getBudget?.()
      const live = await window.electronAPI?.ai.getLiveSnapshot?.().catch(() => null)
      const modelsRes = await window.electronAPI?.ai.listModels?.().catch(() => null)
      const merged: any = {
        provider: live?.provider || 'unknown',
        activeModel: live?.data?.model || live?.model || (modelsRes && modelsRes.models && modelsRes.models[0]) || null,
        sessionMode: live?.data?.mode || live?.mode || null,
        currentTokenUsage: live?.usage ?? null,
        tokenBudget: budget?.limit ?? live?.tokenBudget ?? null,
        attachedFilesCount: Array.isArray(live?.attachedFiles) ? live.attachedFiles.length : (live?.data?.attachedFiles?.length ?? 0),
        truncatedFilesCount: Array.isArray(live?.truncationHistory) ? live.truncationHistory.length : (live?.data?.truncationHistory?.length ?? 0),
        contextSources: live?.data?.contextSources || live?.contextSources || [],
        sessionAgeSeconds: live?.startedAt ? Math.floor((Date.now() - new Date(live.startedAt).getTime()) / 1000) : (live?.createdAt ? Math.floor((Date.now() - new Date(live.createdAt).getTime()) / 1000) : null),
        latencyAverage: live?.latencyMetrics?.average || live?.latency?.average || null,
        errorCount: (live?.errorCount ?? live?.errors?.length ?? 0),
        resetCount: (live?.resetHistory ? live.resetHistory.length : (live?.data?.resetHistory?.length ?? 0)),
        recoveryAvailable: Boolean(live?.canRecover || live?.recoveryAvailable || false),
      }
      // compute health using settings
      const settings = useAppStore.getState().aiHealthSettings
      try {
        const eng = computeHealthScore(merged, settings)
        merged.healthScore = eng.healthScore
        merged.status = eng.status
        merged.statusColor = eng.color
        merged.healthBreakdown = eng.breakdown
      } catch {}

      setState(merged)
      try { useAppStore.getState().setAiHealthState(merged) } catch {}
    } catch (err) {
      // ignore
    }
  }

  useEffect(() => {
    let mounted = true
    refresh()
    const id = setInterval(() => { if (mounted) refresh() }, 5000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  const color = statusColorFor({ tokenBudget: state.tokenBudget, currentTokenUsage: state.currentTokenUsage, latencyAverage: state.latencyAverage, errorCount: state.errorCount })

  const badgeStyle = {
    green: { background: '#16a34a' },
    yellow: { background: '#f59e0b' },
    red: { background: '#ef4444' },
  } as any

  return (
    <div className="rounded-xl border border-white/[0.05] bg-[#04050a]/80 p-3 text-[12px] text-slate-200 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#8b5cf6]/20 to-cyan-500/10 flex items-center justify-center">
            <Bot size={18} className="text-[#a78bfa]" />
          </div>
          <div>
            <div className="font-semibold text-slate-100">AI Health</div>
            <div className="text-[11px] text-slate-400">Overview of active AI session</div>
          </div>
        </div>
        <div style={badgeStyle[color]} className="text-black text-[11px] font-semibold px-2 py-0.5 rounded">{color.toUpperCase()}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div><strong>Model:</strong> <div className="text-slate-300 inline">{state.activeModel || '—'}</div></div>
        <div><strong>Provider:</strong> <div className="text-slate-300 inline">{state.provider || '—'}</div></div>
        <div><strong>Mode:</strong> <div className="text-slate-300 inline">{state.sessionMode || '—'}</div></div>
        <div><strong>Token Usage:</strong> <div className="text-slate-300 inline">{state.currentTokenUsage ?? '—'}</div></div>
        <div><strong>Token Budget:</strong> <div className="text-slate-300 inline">{state.tokenBudget ?? '—'}</div></div>
        <div><strong>Attached Files:</strong> <div className="text-slate-300 inline">{state.attachedFilesCount ?? 0}</div></div>
        <div><strong>Truncated Files:</strong> <div className="text-slate-300 inline">{state.truncatedFilesCount ?? 0}</div></div>
        <div><strong>Context Sources:</strong> <div className="text-slate-300 inline">{(state.contextSources && state.contextSources.length) ? state.contextSources.length : 0}</div></div>
        <div><strong>Session Age:</strong> <div className="text-slate-300 inline">{state.sessionAgeSeconds ? `${Math.floor(state.sessionAgeSeconds/60)}m` : '—'}</div></div>
        <div><strong>Latency Avg:</strong> <div className="text-slate-300 inline">{state.latencyAverage ? `${state.latencyAverage.toFixed(2)}s` : '—'}</div></div>
        <div><strong>Error Count:</strong> <div className="text-slate-300 inline">{state.errorCount ?? 0}</div></div>
        <div><strong>Reset Count:</strong> <div className="text-slate-300 inline">{state.resetCount ?? 0}</div></div>
        <div className="col-span-2"><strong>Recovery Available:</strong> <div className="text-slate-300 inline">{state.recoveryAvailable ? 'Yes' : 'No'}</div></div>
        <div><strong>Tier:</strong> <div className={`inline text-[11px] font-semibold ${(state.activeModel || '').endsWith(':free') ? 'text-emerald-400' : 'text-amber-400'}`}>{(state.activeModel || '').endsWith(':free') ? 'FREE' : 'PREMIUM'}</div></div>
        <div><strong>Fallback:</strong> <div className="text-slate-300 inline">{state.fallbackStatus || 'Ready'}</div></div>
      </div>
    </div>
  )
}
