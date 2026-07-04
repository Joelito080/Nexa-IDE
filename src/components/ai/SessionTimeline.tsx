import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import { Check, X, File, Undo2, Clock, RefreshCw, RotateCcw, Play } from 'lucide-react'

interface TimelineEvent {
  id: string
  type: 'change_applied' | 'change_rejected' | 'change_rolled_back' | 'message_sent' | 'task_complete' | 'reset' | 'model_switch' | 'truncation' | 'recovery_restore' | 'tool_execution'
  filePath?: string
  timestamp: string
  description: string
}

interface SessionTimelineProps {
  events: TimelineEvent[]
  onUndoChange: (filePath: string) => void
}

function TimelineEventRow({ event, onUndoChange }: { event: TimelineEvent; onUndoChange: (filePath: string) => void }) {
  const iconMap = {
    change_applied: <Check size={10} className="text-[#22c55e]" />,
    change_rejected: <X size={10} className="text-[#ef4444]" />,
    change_rolled_back: <Undo2 size={10} className="text-[#fbbf24]" />,
    message_sent: <File size={10} className="text-[#60a5fa]" />,
    task_complete: <Check size={10} className="text-[#22c55e]" />,
    reset: <RefreshCw size={10} className="text-[#f59e0b]" />,
    model_switch: <RotateCcw size={10} className="text-[#38bdf8]" />,
    truncation: <X size={10} className="text-[#f59e0b]" />,
    recovery_restore: <Check size={10} className="text-[#facc15]" />,
    tool_execution: <Play size={10} className="text-[#a855f7]" />,
  }

  const labelMap = {
    change_applied: 'Applied',
    change_rejected: 'Rejected',
    change_rolled_back: 'Rolled back',
    message_sent: 'Sent',
    task_complete: 'Complete',
    reset: 'Reset',
    model_switch: 'Model switch',
    truncation: 'Truncation',
    recovery_restore: 'Recovery',
    tool_execution: 'Tool execution',
  }

  return (
    <div className="flex items-start gap-2 py-1.5 group">
      <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
        {iconMap[event.type]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-[#94a3b8]">{labelMap[event.type]}</span>
          {event.filePath && (
            <span className="text-[9px] text-[#475569] truncate">{event.filePath}</span>
          )}
        </div>
        <p className="text-[9px] text-[#3d4661]">{event.description}</p>
      </div>
      {(event.type === 'change_applied') && (
        <button
          onClick={() => onUndoChange(event.filePath!)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-[#fbbf24] hover:text-[#fcd34d] flex items-center gap-1 shrink-0"
          title="Undo this change"
        >
          <Undo2 size={9} /> Undo
        </button>
      )}
    </div>
  )
}

function SessionTimeline({ events, onUndoChange }: SessionTimelineProps) {
  if (events.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-xl border border-white/5 p-3"
      style={{ background: 'rgba(13,14,22,0.6)' } as CSSProperties}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Clock size={11} className="text-[#475569]" />
        <span className="text-[10px] font-medium text-[#6b7280]">Session Timeline</span>
      </div>
      <div className="space-y-0">
        {events.map((event) => (
          <TimelineEventRow key={event.id} event={event} onUndoChange={onUndoChange} />
        ))}
      </div>
    </motion.div>
  )
}

export default SessionTimeline
export type { TimelineEvent }
