import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

const CHUNK_SIZE = 262144 // 256 KB
const MAX_CHUNKS = 80 // ~20 MB max resident chunk data
const LINE_HEIGHT = 20

interface ChunkInfo {
  offset: number
  lines: string[]
}

interface Props {
  filePath: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

const LargeFileViewer = memo(function LargeFileViewer({ filePath }: Props) {
  const [totalSize, setTotalSize] = useState<number | null>(null)
  const [chunks, setChunks] = useState<ChunkInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visibleStartLine, setVisibleStartLine] = useState(0)
  const [visibleEndLine, setVisibleEndLine] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const chunksRef = useRef(chunks)
  chunksRef.current = chunks
  const isLoadingRef = useRef(false)
  const visibleRangeRef = useRef({ start: 0, end: 0 })
  visibleRangeRef.current = { start: visibleStartLine, end: visibleEndLine }

  // Clear chunks on unmount
  useEffect(() => {
    return () => setChunks([])
  }, [])

  // Evict chunks farthest from viewport when over MAX_CHUNKS
  const addChunkWithEviction = useCallback((chunk: ChunkInfo): void => {
    setChunks((prev) => {
      if (prev.some((c) => c.offset === chunk.offset)) return prev
      const next = [...prev, chunk].sort((a, b) => a.offset - b.offset)
      if (next.length <= MAX_CHUNKS) return next

      const { start, end } = visibleRangeRef.current
      const midLine = (start + end) / 2

      // Compute line offset of each chunk
      let accLine = 0
      const chunkDist = next.map((c) => {
        const chunkMidLine = accLine + c.lines.length / 2
        accLine += c.lines.length
        return { chunk: c, dist: Math.abs(chunkMidLine - midLine) }
      })

      // Sort by distance descending, evict farthest
      chunkDist.sort((a, b) => b.dist - a.dist)
      const evict = chunkDist[0].chunk
      return next.filter((c) => c.offset !== evict.offset)
    })
  }, [])

  // ── Get file size on mount, load first chunk ────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const api = window.electronAPI
      if (!api) return
      const stat = await api.fs.stat(filePath)
      if (cancelled) return
      if ('error' in stat) {
        setError(stat.error)
        return
      }
      setTotalSize(stat.size)
      await loadChunk(0)
    })()
    return () => { cancelled = true }
  }, [filePath])

  // ── Load a single chunk ─────────────────────────────────────────────────
  const loadChunk = useCallback(async (offset: number): Promise<void> => {
    if (isLoadingRef.current) return
    if (chunksRef.current.some((c) => c.offset === offset)) return

    const api = window.electronAPI
    if (!api) return

    isLoadingRef.current = true
    setIsLoading(true)

    try {
      const response = await api.fs.readFileRange(filePath, offset, CHUNK_SIZE)
      if ('error' in response) {
        setError(response.error ?? 'Unknown error')
        return
      }

      const text = response.content
      const lines = text.split('\n')
      // Remove trailing empty entry if file ends with newline
      if (lines.length > 0 && lines[lines.length - 1] === '' && response.eof) {
        lines.pop()
      }

      addChunkWithEviction({ offset, lines })
    } finally {
      isLoadingRef.current = false
      setIsLoading(false)
    }
  }, [filePath])

  // ── Global line index to chunk resolution ──────────────────────────────
  const resolveLine = useCallback((lineIndex: number): { chunk: ChunkInfo; localLine: number } | null => {
    let acc = 0
    for (const chunk of chunksRef.current) {
      if (lineIndex < acc + chunk.lines.length) {
        return { chunk, localLine: lineIndex - acc }
      }
      acc += chunk.lines.length
    }
    return null
  }, [])

  const totalLines = chunksRef.current.reduce((acc, c) => acc + c.lines.length, 0)

  // ── Track visible range via IntersectionObserver on sentinel elements ───
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      const scrollTop = container.scrollTop
      const clientHeight = container.clientHeight
      const start = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - 20)
      const end = Math.ceil((scrollTop + clientHeight) / LINE_HEIGHT) + 20
      setVisibleStartLine(start)
      setVisibleEndLine(end)

      // Trigger chunk loading near boundaries
      if (totalLines > 0 && end + 30 >= totalLines) {
        const lastChunk = chunksRef.current[chunksRef.current.length - 1]
        if (lastChunk && totalSize !== null) {
          const nextOffset = lastChunk.offset + CHUNK_SIZE
          if (nextOffset < totalSize) {
            loadChunk(nextOffset)
          }
        }
      }

      if (start <= 30 && totalLines > 0) {
        const firstChunk = chunksRef.current[0]
        if (firstChunk && firstChunk.offset > 0) {
          const prevOffset = Math.max(0, firstChunk.offset - CHUNK_SIZE)
          loadChunk(prevOffset)
        }
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => container.removeEventListener('scroll', handleScroll)
  }, [totalLines, totalSize, loadChunk])

  // ── Render visible lines ────────────────────────────────────────────────
  const visibleLines: { lineIndex: number; text: string }[] = []
  for (let i = visibleStartLine; i <= visibleEndLine && i < totalLines; i++) {
    const resolved = resolveLine(i)
    if (resolved) {
      visibleLines.push({ lineIndex: i, text: resolved.chunk.lines[resolved.localLine] ?? '' })
    }
  }

  const estimatedTotalHeight = totalSize !== null
    ? Math.max(totalLines, Math.ceil(totalSize / 40)) * LINE_HEIGHT
    : 100 * LINE_HEIGHT

  return (
    <div className="flex flex-col h-full bg-[#0d0e16]">
      {/* Status banner */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#1a1b25] border-b border-white/10 text-[12px] shrink-0">
        <AlertTriangle size={14} className="text-amber-400 shrink-0" />
        <span className="text-[#94a3b8]">
          Large file{totalSize !== null ? ` (${formatSize(totalSize)})` : ''} — read-only
        </span>
        {isLoading && (
          <span className="flex items-center gap-1 text-[#60a5fa] ml-2">
            <Loader2 size={12} className="animate-spin" />
            Loading...
          </span>
        )}
        <span className="text-[#3d4661] ml-auto text-[11px]">
          ~{totalLines.toLocaleString()} lines
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-900/20 border-b border-red-500/20 text-red-400 text-[12px] font-mono shrink-0">
          {error}
        </div>
      )}

      {/* Virtualized content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto font-mono text-[13px] leading-5 text-[#e2e8f0]"
      >
        <div style={{ height: estimatedTotalHeight, position: 'relative' }}>
          {visibleLines.map(({ lineIndex, text }) => (
            <div
              key={lineIndex}
              className="absolute left-0 right-0 flex items-center px-4 whitespace-pre"
              style={{
                top: lineIndex * LINE_HEIGHT,
                height: LINE_HEIGHT,
              }}
            >
              <span className="text-[#3d4661] text-[11px] w-12 text-right mr-4 shrink-0 select-none">
                {lineIndex + 1}
              </span>
              <span className="truncate">{text || '\u00A0'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

export default LargeFileViewer
