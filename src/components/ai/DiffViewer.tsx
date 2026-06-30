import { useState, useMemo, memo } from 'react'
import { motion } from 'framer-motion'
import { Check, X, Edit3, File, ChevronDown, ChevronRight } from 'lucide-react'

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  oldLineNum: number | null
  newLineNum: number | null
  content: string
}

interface FileDiff {
  filePath: string
  lines: DiffLine[]
  oldContent: string
  newContent: string
}

interface DiffViewerProps {
  diffs: FileDiff[]
  onAccept: (filePath: string, newContent: string) => void
  onReject: (filePath: string) => void
  onEditBeforeApply: (filePath: string, oldContent: string, newContent: string) => void
  onAcceptAll: () => void
  onRejectAll: () => void
}

const DiffLineRow = memo(function DiffLineRow({ line }: { line: DiffLine }) {
  const bgColor = line.type === 'added'
    ? 'rgba(34,197,94,0.08)'
    : line.type === 'removed'
    ? 'rgba(239,68,68,0.08)'
    : 'transparent'

  const textColor = line.type === 'added'
    ? '#86efac'
    : line.type === 'removed'
    ? '#fca5a5'
    : '#94a3b8'

  const gutterStyle = {
    added: { bg: 'rgba(34,197,94,0.2)', text: '#22c55e', sign: '+' },
    removed: { bg: 'rgba(239,68,68,0.2)', text: '#ef4444', sign: '-' },
    unchanged: { bg: 'transparent', text: '#475569', sign: ' ' },
  }[line.type]

  return (
    <div
      className="flex text-[11px] font-mono leading-relaxed min-h-[22px]"
      style={{ background: bgColor }}
    >
      <div
        className="w-[44px] shrink-0 text-right pr-2 select-none"
        style={{ color: '#3d4661', borderRight: '1px solid rgba(255,255,255,0.04)' }}
      >
        {line.oldLineNum ?? ''}
      </div>
      <div
        className="w-[12px] shrink-0 text-center select-none"
        style={{ color: gutterStyle.text }}
      >
        {gutterStyle.sign}
      </div>
      <div
        className="w-[44px] shrink-0 text-right pr-2 select-none"
        style={{ color: '#3d4661', borderRight: '1px solid rgba(255,255,255,0.04)' }}
      >
        {line.newLineNum ?? ''}
      </div>
      <div
        className="flex-1 whitespace-pre px-2"
        style={{ color: textColor }}
      >
        {line.content || ' '}
      </div>
    </div>
  )
})

function FileDiffCard({ diff, onAccept, onReject, onEditBeforeApply }: {
  diff: FileDiff
  onAccept: (filePath: string, newContent: string) => void
  onReject: (filePath: string) => void
  onEditBeforeApply: (filePath: string, oldContent: string, newContent: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const removedCount = diff.lines.filter((l) => l.type === 'removed').length
  const addedCount = diff.lines.filter((l) => l.type === 'added').length

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden border border-white/10"
      style={{ background: 'rgba(13,14,22,0.9)' }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
        style={{ borderBottom: expanded ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {expanded ? <ChevronDown size={12} className="text-[#475569] shrink-0" /> : <ChevronRight size={12} className="text-[#475569] shrink-0" />}
          <File size={12} className="text-[#475569] shrink-0" />
          <span className="text-[11px] text-[#94a3b8] truncate">{diff.filePath}</span>
          <span className="text-[9px] shrink-0" style={{ color: '#ef4444' }}>-{removedCount}</span>
          <span className="text-[9px] shrink-0" style={{ color: '#22c55e' }}>+{addedCount}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onAccept(diff.filePath, diff.newContent) }}
            className="flex items-center gap-1 text-[9.5px] px-2 py-1 rounded-lg transition-colors"
            style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}
            title="Accept changes"
          >
            <Check size={10} /> Accept
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onReject(diff.filePath) }}
            className="flex items-center gap-1 text-[9.5px] px-2 py-1 rounded-lg transition-colors"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
            title="Reject changes"
          >
            <X size={10} /> Reject
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEditBeforeApply(diff.filePath, diff.oldContent, diff.newContent) }}
            className="flex items-center gap-1 text-[9.5px] px-2 py-1 rounded-lg transition-colors"
            style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}
            title="Edit before applying"
          >
            <Edit3 size={10} /> Edit
          </button>
        </div>
      </div>
      {expanded && (
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <div className="min-w-[500px]">
            <div className="flex text-[9.5px] font-mono px-1 py-1" style={{ color: '#3d4661', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <span className="w-[44px] shrink-0 text-right pr-2">Old</span>
              <span className="w-[12px] shrink-0" />
              <span className="w-[44px] shrink-0 text-right pr-2">New</span>
              <span className="flex-1 px-2">Content</span>
            </div>
            {diff.lines.map((line, i) => (
              <DiffLineRow key={i} line={line} />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}

function DiffViewer({ diffs, onAccept, onReject, onEditBeforeApply, onAcceptAll, onRejectAll }: DiffViewerProps) {
  if (diffs.length === 0) return null

  const totalRemoved = diffs.reduce((s, d) => s + d.lines.filter((l) => l.type === 'removed').length, 0)
  const totalAdded = diffs.reduce((s, d) => s + d.lines.filter((l) => l.type === 'added').length, 0)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-[#94a3b8]">
            {diffs.length} file{diffs.length !== 1 ? 's' : ''} changed
          </span>
          <span className="text-[9px]" style={{ color: '#ef4444' }}>-{totalRemoved}</span>
          <span className="text-[9px]" style={{ color: '#22c55e' }}>+{totalAdded}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onAcceptAll}
            className="text-[9.5px] px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
          >
            <Check size={10} /> Accept all
          </button>
          <button
            onClick={onRejectAll}
            className="text-[9.5px] px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
          >
            <X size={10} /> Reject all
          </button>
        </div>
      </div>
      {diffs.map((diff) => (
        <FileDiffCard
          key={diff.filePath}
          diff={diff}
          onAccept={onAccept}
          onReject={onReject}
          onEditBeforeApply={onEditBeforeApply}
        />
      ))}
    </div>
  )
}

export default memo(DiffViewer)
export type { DiffLine, FileDiff }
