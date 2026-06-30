import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bot, Send, Sparkles, FileCode, Settings, Copy, Check,
  RefreshCw, Trash2, X, FileText, Code2, Layers, ChevronDown,
  Square, Wand2, Lightbulb, RotateCcw, FilePlus, FolderSearch,
  Zap, Circle, AlertCircle, ChevronRight, Search, Star, History,
  Sliders, SlidersHorizontal, Scale, ShieldAlert, Cpu
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { getFileContent } from '../../lib/fileCache'

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SLASH_COMMANDS = [
  { cmd: '/fix', icon: 'ðŸ”§', desc: 'Fix bugs in the active file' },
  { cmd: '/explain', icon: 'ðŸ’¡', desc: 'Explain the active file or selection' },
  { cmd: '/refactor', icon: 'ðŸ”„', desc: 'Refactor selection for clarity' },
  { cmd: '/generate', icon: 'âœ¨', desc: 'Generate a new file or snippet' },
  { cmd: '/test', icon: 'ðŸ§ª', desc: 'Write unit tests for this file' },
  { cmd: '/optimize', icon: 'âš¡', desc: 'Optimize performance' },
  { cmd: '/document', icon: 'ðŸ“', desc: 'Add documentation and JSDoc' },
  { cmd: '/debug', icon: 'ðŸ›', desc: 'Add debug logging' },
]

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  timestamp: string
  actionChips?: string[]
  error?: boolean
  timingMs?: number
  metrics?: {
    inputTokens: number
    outputTokens: number
    cost: number
    speed: number
  }
}

interface OpenRouterModel {
  id: string
  name: string
  context_length: number
  pricing: {
    prompt: string
    completion: string
  }
  description: string
  architecture?: {
    modality?: string
  }
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function getBaseName(p: string) {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function truncateToTokenBudget(text: string, maxTokens: number): string {
  const maxChars = Math.max(0, maxTokens * 4)
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n...[truncated for context limit]...`
}

function extractImports(content: string): string[] {
  const imports: string[] = []
  const importRegex = /^(?:import|export)\s+.*?from\s+['"][^'"]+['"]/gm
  let match: RegExpExecArray | null
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[0])
    if (imports.length >= 24) break
  }
  return imports
}

function formatPricePerMillion(price: string): string {
  const perToken = parseFloat(price)
  if (!Number.isFinite(perToken) || perToken <= 0) return 'Free'
  const perM = perToken * 1_000_000
  if (perM < 0.01) return `$${perM.toFixed(4)}/M`
  return `$${perM.toFixed(2)}/M`
}

// â”€â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TypingDots = memo(function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-[#a855f7] animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
})

interface CodeBlockProps {
  language: string
  code: string
  filePath: string | null
}

const CodeBlock = memo(function CodeBlock({ language, code, filePath }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleApply = async () => {
    if (!filePath) return
    try {
      await window.electronAPI?.diff.apply(filePath, code, newId(), 'AI apply code')
    } catch {
      // Ignore error
    }
  }

  return (
    <div className="my-2 border border-white/5 rounded-xl overflow-hidden bg-black/40">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.02] border-b border-white/5 text-[9px] text-slate-400 font-mono">
        <span>{language || 'code'}</span>
        <div className="flex items-center gap-2">
          {filePath && (
            <button
              onClick={handleApply}
              className="text-[#a855f7] hover:text-[#c084fc] transition-colors flex items-center gap-0.5"
            >
              <Check size={10} /> Apply
            </button>
          )}
          <button onClick={handleCopy} className="hover:text-white transition-colors flex items-center gap-0.5">
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre className="p-3 text-[10px] font-mono overflow-x-auto text-slate-300 leading-relaxed max-w-full">
        <code>{code}</code>
      </pre>
    </div>
  )
})

function parseInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let remaining = text
  let keyIdx = 0

  while (remaining.length > 0) {
    const boldStart = remaining.indexOf('**')
    const codeStart = remaining.indexOf('`')

    if (boldStart !== -1 && (codeStart === -1 || boldStart < codeStart)) {
      if (boldStart > 0) {
        parts.push(<span key={keyIdx++}>{remaining.slice(0, boldStart)}</span>)
      }
      const afterBold = remaining.slice(boldStart + 2)
      const boldEnd = afterBold.indexOf('**')
      if (boldEnd === -1) {
        parts.push(<strong key={keyIdx++} className="font-bold text-white">{afterBold}</strong>)
        break
      } else {
        parts.push(
          <strong key={keyIdx++} className="font-bold text-white">
            {afterBold.slice(0, boldEnd)}
          </strong>
        )
        remaining = afterBold.slice(boldEnd + 2)
      }
    } else if (codeStart !== -1 && (boldStart === -1 || codeStart < boldStart)) {
      if (codeStart > 0) {
        parts.push(<span key={keyIdx++}>{remaining.slice(0, codeStart)}</span>)
      }
      const afterCode = remaining.slice(codeStart + 1)
      const codeEnd = afterCode.indexOf('`')
      if (codeEnd === -1) {
        parts.push(
          <code key={keyIdx++} className="bg-white/5 border border-white/10 px-1 rounded text-[10px] font-mono text-purple-300">
            {afterCode}
          </code>
        )
        break
      } else {
        parts.push(
          <code key={keyIdx++} className="bg-white/5 border border-white/10 px-1 rounded text-[10px] font-mono text-purple-300">
            {afterCode.slice(0, codeEnd)}
          </code>
        )
        remaining = afterCode.slice(codeEnd + 1)
      }
    } else {
      parts.push(<span key={keyIdx++}>{remaining}</span>)
      break
    }
  }

  return parts
}

function parseTextWithMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n')
  return (
    <div className="space-y-1">
      {lines.map((line, lineIdx) => {
        if (line.startsWith('### ')) {
          return (
            <h3 key={lineIdx} className="text-[12.5px] font-bold text-white mt-3 mb-1.5 first:mt-0 font-sans">
              {parseInlineMarkdown(line.slice(4))}
            </h3>
          )
        }
        if (line.startsWith('## ')) {
          return (
            <h2 key={lineIdx} className="text-[13.5px] font-black text-white mt-4 mb-2 first:mt-0 font-sans border-b border-white/5 pb-1">
              {parseInlineMarkdown(line.slice(3))}
            </h2>
          )
        }
        if (line.startsWith('# ')) {
          return (
            <h1 key={lineIdx} className="text-[15px] font-extrabold text-white mt-4 mb-2 first:mt-0 font-sans border-b border-white/10 pb-1">
              {parseInlineMarkdown(line.slice(2))}
            </h1>
          )
        }
        if (line.trim().startsWith('- ')) {
          const bulletContent = line.trim().slice(2)
          return (
            <li key={lineIdx} className="list-disc list-inside text-[11px] text-[#d1d5db] ml-2.5 my-0.5 leading-relaxed">
              {parseInlineMarkdown(bulletContent)}
            </li>
          )
        }
        if (line.trim().startsWith('* ')) {
          const bulletContent = line.trim().slice(2)
          return (
            <li key={lineIdx} className="list-disc list-inside text-[11px] text-[#d1d5db] ml-2.5 my-0.5 leading-relaxed">
              {parseInlineMarkdown(bulletContent)}
            </li>
          )
        }
        return (
          <p key={lineIdx} className="text-[11px] leading-relaxed my-0.5 min-h-[1.2em]">
            {parseInlineMarkdown(line)}
          </p>
        )
      })}
    </div>
  )
}

function renderContent(text: string, filePath: string | null): React.ReactNode {
  const blocks: { type: 'text' | 'code'; lang?: string; content: string }[] = []
  let remaining = text

  while (remaining.length > 0) {
    const codeStart = remaining.indexOf('```')
    if (codeStart === -1) {
      blocks.push({ type: 'text', content: remaining })
      break
    }
    if (codeStart > 0) blocks.push({ type: 'text', content: remaining.slice(0, codeStart) })
    const afterOpen = remaining.slice(codeStart + 3)
    const firstNL = afterOpen.indexOf('\n')
    const lang = firstNL === -1 ? '' : afterOpen.slice(0, firstNL).trim()
    const codeStart2 = firstNL === -1 ? 0 : firstNL + 1
    const closeIdx = afterOpen.indexOf('```', codeStart2)
    const code = closeIdx === -1 ? afterOpen.slice(codeStart2) : afterOpen.slice(codeStart2, closeIdx)
    blocks.push({ type: 'code', lang, content: code.trimEnd() })
    remaining = closeIdx === -1 ? '' : afterOpen.slice(closeIdx + 3)
  }

  return (
    <>
      {blocks.map((b, i) =>
        b.type === 'code' ? (
          <CodeBlock key={i} language={b.lang ?? ''} code={b.content} filePath={filePath} />
        ) : (
          <div key={i} className="my-1.5 first:mt-0 last:mb-0">
            {parseTextWithMarkdown(b.content)}
          </div>
        )
      )}
    </>
  )
}

// â”€â”€â”€ Action Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ActionBarProps {
  onAction: (action: string) => void
  hasFile: boolean
  disabled: boolean
}

const ActionBar = memo(function ActionBar({ onAction, hasFile, disabled }: ActionBarProps) {
  const actions = [
    { id: 'fix', icon: <Wand2 size={10} />, label: 'Fix File', color: 'text-rose-400', requiresFile: true },
    { id: 'explain', icon: <Lightbulb size={10} />, label: 'Explain', color: 'text-amber-400', requiresFile: false },
    { id: 'refactor', icon: <RotateCcw size={10} />, label: 'Refactor', color: 'text-blue-400', requiresFile: true },
    { id: 'generate', icon: <FilePlus size={10} />, label: 'Generate', color: 'text-emerald-400', requiresFile: false },
    { id: 'project', icon: <FolderSearch size={10} />, label: 'Project', color: 'text-purple-400', requiresFile: false },
  ]

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto scrollbar-none">
      {actions.map((a) => {
        const isDisabled = disabled || (a.requiresFile && !hasFile)
        return (
          <button
            key={a.id}
            onClick={() => !isDisabled && onAction(a.id)}
            disabled={isDisabled}
            title={a.requiresFile && !hasFile ? 'Open a file first' : a.label}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9.5px] font-medium border whitespace-nowrap transition-all ${
              isDisabled
                ? 'opacity-30 cursor-not-allowed border-white/[0.04] text-[#475569]'
                : `border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] ${a.color} hover:border-white/[0.12]`
            }`}
          >
            {a.icon}
            <span>{a.label}</span>
          </button>
        )
      })}
    </div>
  )
})

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function NexusAssistant() {
  // â”€â”€ Store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const messages = useAppStore((s) => s.aiChatHistory) as ChatMessage[]
  const setMessages = useAppStore((s) => s.setAiChatHistory)
  const selectedFilePath = useAppStore((s) => s.selectedFilePath)
  const selectedLineNumber = useAppStore((s) => s.selectedLineNumber)
  const rootPath = useAppStore((s) => s.rootPath)
  const openrouterModel = useAppStore((s) => s.openrouterModel)
  const setOpenrouterModel = useAppStore((s) => s.setOpenrouterModel)
  const addNotification = useAppStore((s) => s.addNotification)
  const setLicenseStatus = useAppStore((s) => s.setLicenseStatus)
  const pendingAiPrompt = useAppStore((s) => s.pendingAiPrompt)
  const setPendingAiPrompt = useAppStore((s) => s.setPendingAiPrompt)
  const openTabs = useAppStore((s) => s.openTabs)

  // â”€â”€ Local state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null)
  const [showSlash, setShowSlash] = useState(false)
  const [slashIdx, setSlashIdx] = useState(0)
  const [projectContextMode, setProjectContextMode] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<string[]>([])

  // Dynamic models & selectors
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('nexus-fav-models') || '[]')
    } catch {
      return ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'deepseek/deepseek-chat']
    }
  })
  const [recents, setRecents] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('nexus-recent-models') || '[]')
    } catch {
      return []
    }
  })
  const [filterType, setFilterType] = useState<'all' | 'coding' | 'reasoning' | 'vision' | 'long-context' | 'fast' | 'cheap'>('all')
  const [showSelectorDropdown, setShowSelectorDropdown] = useState(false)
  const [dailySpend, setDailySpend] = useState(0)
  const [dailyBudgetLimit, setDailyBudgetLimit] = useState(5)
  const sessionSpendRef = useRef(0)

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [temperature, setTemperature] = useState(0.5)
  const [maxTokens, setMaxTokens] = useState(4096)
  const [topP, setTopP] = useState(0.9)
  const [systemPrompt, setSystemPrompt] = useState('You are Nexus Assistant, an expert AI coding assistant built into NEXA IDE. Be concise, precise, and output well-formatted code.')

  // â”€â”€ Refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const scrollRef = useRef<HTMLDivElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const selectorRef = useRef<HTMLDivElement>(null)
  const streamingMsgIdRef = useRef<string | null>(null)
  const queryStartTimeRef = useRef<number | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // â”€â”€ Fetch Models â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadModelsList = useCallback(async (force = false) => {
    setLoadingModels(true)
    try {
      const res = await window.electronAPI?.ai.listModels(force)
      if (res && 'models' in res && res.models.length > 0) {
        setModels(res.models)
      }
    } catch (err) {
      addNotification('Failed to fetch models list.', 'error')
    } finally {
      setLoadingModels(false)
    }
  }, [addNotification])

  useEffect(() => {
    loadModelsList()
    window.electronAPI?.ai.getBudget().then((res: any) => {
      if (res && !res.error) {
        setDailySpend(res.dailySpend ?? 0)
        setDailyBudgetLimit(res.limit ?? 5)
      }
    }).catch(() => {})
  }, [loadModelsList])

  // Handle outside click for model selector dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setShowSelectorDropdown(false)
      }
    }
    if (showSelectorDropdown) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSelectorDropdown])

  // Consume pending prompt injected by editor action
  useEffect(() => {
    if (!pendingAiPrompt) return
    setInput(pendingAiPrompt)
    setPendingAiPrompt(null)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [pendingAiPrompt, setPendingAiPrompt])

  // Auto-scroll on new messages
  const handleMessageListScroll = () => {
    const el = messageListRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 40
    setAutoScroll(isAtBottom)
  }

  useEffect(() => {
    if (!autoScroll) return
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming, autoScroll])

  // Abort in-flight stream when unmounting
  useEffect(() => {
    return () => {
      const streamId = streamingMsgIdRef.current
      if (streamId) {
        window.electronAPI?.ai.streamStop(streamId).catch(() => {})
      }
    }
  }, [])

  // Subscribe to stream events â€” register once
  useEffect(() => {
    const api = window.electronAPI?.ai
    if (!api) return

    const unChunk = api.onChunk(({ streamId, text }) => {
      if (streamId !== streamingMsgIdRef.current) return
      setMessages((prev: ChatMessage[]) => {
        const last = prev[prev.length - 1]
        if (!last || last.id !== streamId) return prev
        return [...prev.slice(0, -1), { ...last, content: last.content + text }]
      })
    })

    const unEnd = api.onEnd(({ streamId, fullText, metrics }) => {
      if (streamId !== streamingMsgIdRef.current) return
      const duration = queryStartTimeRef.current ? Date.now() - queryStartTimeRef.current : 0
      
      setMessages((prev: ChatMessage[]) => {
        const last = prev[prev.length - 1]
        if (!last || last.id !== streamId) return prev
        return [
          ...prev.slice(0, -1),
          { 
            ...last, 
            content: fullText, 
            isStreaming: false, 
            actionChips: ['Refine', 'Explain More', 'Apply'],
            timingMs: duration,
            metrics: metrics || {
              inputTokens: Math.ceil(last.content.length / 4),
              outputTokens: Math.ceil(fullText.length / 4),
              cost: 0,
              speed: 0
            }
          },
        ]
      })
      setIsStreaming(false)
      setActiveStreamId(null)
      streamingMsgIdRef.current = null
      if (metrics?.cost) sessionSpendRef.current += metrics.cost
      if (metrics?.dailySpend !== undefined) setDailySpend(metrics.dailySpend)
    })

    const unErr = api.onError(({ streamId, error }) => {
      if (streamId !== streamingMsgIdRef.current) return
      setMessages((prev: ChatMessage[]) => {
        const last = prev[prev.length - 1]
        if (!last || last.id !== streamId) return prev
        return [
          ...prev.slice(0, -1),
          { ...last, content: `âŒ ${error}`, isStreaming: false, error: true },
        ]
      })
      setIsStreaming(false)
      setActiveStreamId(null)
      streamingMsgIdRef.current = null
      addNotification(`AI error: ${error}`, 'error')
    })

    return () => { unChunk(); unEnd(); unErr() }
  }, [addNotification, setMessages])

  // â”€â”€ Favorites & Recents Persistence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = favorites.includes(id)
      ? favorites.filter(x => x !== id)
      : [...favorites, id]
    setFavorites(updated)
    localStorage.setItem('nexus-fav-models', JSON.stringify(updated))
  }

  const addRecent = useCallback((id: string) => {
    setRecents((prev) => {
      const updated = [id, ...prev.filter((x) => x !== id)].slice(0, 5)
      localStorage.setItem('nexus-recent-models', JSON.stringify(updated))
      return updated
    })
  }, [])

  const dedupedModels = models.filter((m, idx, arr) => arr.findIndex((x) => x.id === m.id) === idx)

  const filteredModels = dedupedModels.filter(m => {
    const matchesSearch = m.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          m.name.toLowerCase().includes(searchQuery.toLowerCase())
    if (!matchesSearch) return false

    if (filterType === 'all') return true
    if (filterType === 'coding') {
      return m.id.includes('coder') || m.id.includes('code') || m.description.toLowerCase().includes('code')
    }
    if (filterType === 'reasoning') {
      return m.id.includes('reasoning') || m.id.includes('thought') || m.description.toLowerCase().includes('reason')
    }
    if (filterType === 'vision') {
      return m.architecture?.modality?.includes('image') || m.description.toLowerCase().includes('vision') || m.description.toLowerCase().includes('multimodal')
    }
    if (filterType === 'long-context') {
      return m.context_length >= 100000
    }
    if (filterType === 'fast') {
      return m.id.includes('flash') || m.id.includes('haiku') || m.id.includes('mini')
    }
    if (filterType === 'cheap') {
      return parseFloat(m.pricing.prompt) === 0 || parseFloat(m.pricing.prompt) < 0.000001
    }
    return true
  })

  // â”€â”€ Smart Context Packer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const listedModels = filteredModels.filter((m) => {
    if (searchQuery !== '' || filterType !== 'all') return true
    return !favorites.includes(m.id) && !recents.includes(m.id)
  })

  const buildPrompt = useCallback((userText: string) => {
    const modelInfo = dedupedModels.find((m) => m.id === openrouterModel)
    const contextLimit = modelInfo?.context_length ?? 128000
    const reservedForReply = Math.min(maxTokens, Math.floor(contextLimit * 0.25))
    let remainingBudget = Math.max(4096, contextLimit - reservedForReply - estimateTokens(systemPrompt))

    const parts: string[] = []
    const pack = (section: string, share = 0.35) => {
      const budget = Math.floor(remainingBudget * share)
      const packed = truncateToTokenBudget(section, budget)
      remainingBudget -= estimateTokens(packed)
      parts.push(packed)
    }

    if (projectContextMode && rootPath) {
      pack(`[Project root: ${rootPath}]`, 0.05)
    }

    if (projectContextMode && openTabs.length > 0) {
      const tabLines = openTabs.slice(0, 8).map((tab) => `- ${tab}`).join('\n')
      pack(`--- Open Editor Tabs ---\n${tabLines}`, 0.08)
    }

    if (selectedFilePath) {
      const content = getFileContent(selectedFilePath) ?? ''
      const imports = extractImports(content)
      if (imports.length > 0) {
        pack(`--- Related imports (${getBaseName(selectedFilePath)}) ---\n${imports.join('\n')}`, 0.1)
      }
    }

    if (projectContextMode && openTabs.length > 0) {
      for (const tab of openTabs.slice(0, 4)) {
        if (remainingBudget < 1024) break
        const content = getFileContent(tab)
        if (content) {
          pack(`File: ${tab}\n\`\`\`\n${content}\n\`\`\``, 0.12)
        }
      }
    }

    for (const f of attachedFiles) {
      if (remainingBudget < 512) break
      const content = getFileContent(f)
      if (content) pack(`Attached â€” ${f}:\n\`\`\`\n${content}\n\`\`\``, 0.15)
    }

    if (selectedFilePath) {
      const content = getFileContent(selectedFilePath) ?? ''
      const lineCtx = selectedLineNumber ? ` (cursor line ${selectedLineNumber})` : ''
      pack(`Active file${lineCtx}: ${selectedFilePath}\n\`\`\`\n${content}\n\`\`\``, 0.35)
    }

    if (userText.startsWith('/fix') && selectedFilePath) {
      parts.push('Focus: Diagnose and fix bugs, syntax errors, and runtime issues. Output corrected code blocks.')
    } else if (userText.startsWith('/refactor') && selectedFilePath) {
      parts.push('Focus: Refactor for readability and maintainability without changing behavior.')
    } else if (userText.startsWith('/debug') && selectedFilePath) {
      parts.push('Focus: Add strategic debug logging, trace execution paths, and explain likely failure points.')
    } else if (userText.startsWith('/optimize') && selectedFilePath) {
      parts.push('Focus: Improve performance, reduce allocations/complexity, and explain trade-offs.')
    } else if (userText.startsWith('/generate')) {
      parts.push('Focus: Generate production-ready code matching project conventions.')
    } else if (userText.startsWith('/test') && selectedFilePath) {
      parts.push('Focus: Generate comprehensive unit tests covering edge cases for this file.')
    } else if (userText.startsWith('/document') && selectedFilePath) {
      parts.push('Focus: Add JSDoc/TSDoc and inline documentation for public APIs.')
    }

    parts.push(`User Request:\n${userText}`)
    return parts.join('\n\n')
  }, [
    selectedFilePath, selectedLineNumber, rootPath, projectContextMode,
    attachedFiles, openTabs, openrouterModel, dedupedModels, maxTokens, systemPrompt,
  ])

  // â”€â”€ Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleAction = useCallback((actionId: string) => {
    const fileContent = selectedFilePath ? getFileContent(selectedFilePath) ?? '' : ''
    const prompts: Record<string, string> = {
      fix: `/fix Fix issues in ${selectedFilePath ? getBaseName(selectedFilePath) : 'file'}`,
      explain: `/explain Explain this code`,
      refactor: `/refactor Refactor this file for cleaner modular code`,
      generate: '/generate Generate a new component',
      project: rootPath
        ? `/project Explain key files and directory structure at ${rootPath}`
        : 'Open a project workspace folder to analyze it.',
    }
    const prompt = prompts[actionId]
    if (prompt) {
      setInput(prompt)
      inputRef.current?.focus()
    }
  }, [selectedFilePath, rootPath])

  const handleChipClick = useCallback((chip: string) => {
    setInput(`${chip}: `)
    inputRef.current?.focus()
  }, [])

  const handleStop = useCallback(async () => {
    if (!activeStreamId) return
    await window.electronAPI?.ai.streamStop(activeStreamId)
    setIsStreaming(false)
    setActiveStreamId(null)
    streamingMsgIdRef.current = null
    setMessages((prev: ChatMessage[]) => {
      const last = prev[prev.length - 1]
      if (!last?.isStreaming) return prev
      return [...prev.slice(0, -1), { ...last, isStreaming: false, content: last.content + '\n\n*[Stopped by user]*' }]
    })
  }, [activeStreamId, setMessages])

  const sendQuery = useCallback(async (text: string) => {
    if (!text || isStreaming) return
    setInput('')
    setShowSlash(false)

    const userMsg: ChatMessage = {
      id: newId(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    const currentHistory = useAppStore.getState().aiChatHistory as ChatMessage[]
    const updatedMsgs = [...currentHistory, userMsg]
    setMessages(updatedMsgs)

    // License check
    const allowed = await window.electronAPI?.license.canUseAI()
    if (!allowed && text.toLowerCase() !== 'im the owner') {
      addNotification('AI usage limit reached. Upgrade to Pro.', 'warning')
      setMessages([...updatedMsgs, {
        id: newId(), role: 'assistant',
        content: 'âš ï¸ AI usage limit reached for Free tier. Upgrade to Pro to continue.',
        timestamp: new Date().toISOString(), error: true,
      }])
      return
    }

    // Create streaming placeholder
    const streamId = newId()
    const assistantMsg: ChatMessage = {
      id: streamId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: new Date().toISOString(),
    }
    setMessages([...updatedMsgs, assistantMsg])
    streamingMsgIdRef.current = streamId
    setIsStreaming(true)
    setActiveStreamId(streamId)
    queryStartTimeRef.current = Date.now()

    // Add to recents
    addRecent(openrouterModel)

    const payload = {
      streamId,
      prompt: buildPrompt(text),
      systemPrompt,
      model: openrouterModel,
      projectPath: rootPath,
      temperature,
      maxTokens,
      topP
    }

    try {
      const res = await window.electronAPI?.ai.streamStart(payload)
      if (res && 'error' in res) {
        setMessages([...updatedMsgs, {
          id: streamId, role: 'assistant',
          content: `âŒ ${(res as any).error}`,
          timestamp: new Date().toISOString(), error: true,
        }])
        setIsStreaming(false)
        setActiveStreamId(null)
        streamingMsgIdRef.current = null
      }
      window.electronAPI?.license.recordAIRequest().then((s: any) => {
        if (s && !s.error) setLicenseStatus(s)
      }).catch(() => {})
    } catch (err) {
      setMessages([...updatedMsgs, {
        id: streamId, role: 'assistant',
        content: `âŒ ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toISOString(), error: true,
      }])
      setIsStreaming(false)
      setActiveStreamId(null)
      streamingMsgIdRef.current = null
    }
  }, [
    isStreaming, openrouterModel, rootPath, buildPrompt, systemPrompt,
    temperature, maxTokens, topP, addNotification, setMessages, setLicenseStatus, addRecent
  ])

  const handleSend = useCallback(() => {
    sendQuery(input)
  }, [input, sendQuery])

  const handleRetry = useCallback(async (msgId: string) => {
    const currentHistory = useAppStore.getState().aiChatHistory as ChatMessage[]
    const idx = currentHistory.findIndex(m => m.id === msgId)
    if (idx === -1) return
    
    let userPromptText = ''
    for (let i = idx - 1; i >= 0; i--) {
      if (currentHistory[i].role === 'user') {
        userPromptText = currentHistory[i].content
        break
      }
    }
    
    if (!userPromptText) return
    const truncatedMessages = currentHistory.slice(0, idx)
    setMessages(truncatedMessages)
    await sendQuery(userPromptText)
  }, [sendQuery, setMessages])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const filteredSlash = SLASH_COMMANDS.filter(s => s.cmd.startsWith(input))
    if (showSlash && filteredSlash.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => (i + 1) % filteredSlash.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx(i => (i - 1 + filteredSlash.length) % filteredSlash.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        setInput(filteredSlash[slashIdx].cmd + ' ')
        setShowSlash(false)
        return
      }
      if (e.key === 'Escape') { setShowSlash(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)
    if (val.startsWith('/')) {
      setShowSlash(true)
      setSlashIdx(0)
    } else {
      setShowSlash(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    const paths = files.map((f: any) => f.path).filter(Boolean)
    if (paths.length) {
      setAttachedFiles(prev => [...new Set([...prev, ...paths])])
      addNotification(`Attached ${paths.length} file(s) as context.`, 'info')
    }
  }

  const selectedModelInfo = dedupedModels.find(m => m.id === openrouterModel)
  const currentModelLabel = selectedModelInfo?.name || openrouterModel
  const budgetWarning = dailySpend >= dailyBudgetLimit * 0.8

  return (
    <div
      className="relative flex flex-col h-full min-h-0 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #090a12 0%, #050608 100%)' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Background accent */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-purple-500/25 to-transparent" />
        <div className="absolute inset-0 opacity-[0.015]"
          style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, #8b5cf6 0%, transparent 70%)' }} />
      </div>

      {/* â”€â”€ Header â”€â”€ */}
      <div className="shrink-0 relative z-20">
        <div className="flex items-center justify-between px-3 py-2.5 bg-black/20 border-b border-white/[0.04] backdrop-blur-md">
          {/* Brand + model dropdown selector */}
          <div className="flex items-center gap-2" ref={selectorRef}>
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#06b6d4] flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0">
              <Bot size={13} className="text-white" />
            </div>
            
            <button
              onClick={() => !isStreaming && setShowSelectorDropdown(!showSelectorDropdown)}
              disabled={isStreaming}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] text-[10px] font-semibold text-white transition-all max-w-[140px] sm:max-w-[180px] disabled:opacity-50"
            >
              <Circle size={5} className="fill-[#f59e0b] color-[#f59e0b] animate-pulse" />
              <span className="truncate">{currentModelLabel}</span>
              <ChevronDown size={9} className="text-[#475569] shrink-0" />
            </button>

            {/* Model Selector Dropdown */}
            <AnimatePresence>
              {showSelectorDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.12 }}
                  className="absolute left-0 top-full mt-1.5 w-64 bg-[#0c0d16]/95 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col backdrop-blur-md"
                >
                  <div className="p-2 border-b border-white/[0.06] flex items-center gap-1.5">
                    <Search size={10} className="text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search OpenRouter models..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-transparent border-none text-[10px] text-white focus:outline-none placeholder-slate-500 flex-1"
                    />
                    {loadingModels ? (
                      <RefreshCw size={10} className="animate-spin text-[#8b5cf6]" />
                    ) : (
                      <button onClick={() => loadModelsList(true)} title="Force Refresh List">
                        <RefreshCw size={10} className="text-slate-400 hover:text-white" />
                      </button>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div className="flex gap-1 p-2 overflow-x-auto border-b border-white/[0.04] scrollbar-none shrink-0">
                    {(['all', 'coding', 'reasoning', 'vision', 'long-context', 'fast', 'cheap'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setFilterType(tab)}
                        className={`px-1.5 py-0.5 rounded text-[8px] font-semibold whitespace-nowrap transition ${
                          filterType === tab ? 'bg-[#8b5cf6]/20 text-[#c084fc]' : 'bg-white/[0.02] text-slate-400 hover:text-white'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <div className="max-h-56 overflow-y-auto py-1">
                    {/* Favorites list */}
                    {favorites.length > 0 && searchQuery === '' && filterType === 'all' && (
                      <div className="px-2.5 py-1 text-[8px] text-[#8b5cf6] font-bold tracking-wider uppercase border-b border-white/[0.04]">
                        Favorites
                      </div>
                    )}
                    {searchQuery === '' && filterType === 'all' && favorites.map(favId => {
                      const m = dedupedModels.find(x => x.id === favId)
                      if (!m) return null
                      return (
                        <button
                          key={favId}
                          onClick={() => { setOpenrouterModel(favId); setShowSelectorDropdown(false) }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left text-[9px] hover:bg-white/[0.04] ${
                            openrouterModel === favId ? 'text-[#a855f7] bg-white/[0.02]' : 'text-slate-300'
                          }`}
                        >
                          <span className="truncate flex-1 font-medium">{m.name}</span>
                          <Star size={9} className="fill-[#f59e0b] text-[#f59e0b]" onClick={(e) => toggleFavorite(favId, e)} />
                        </button>
                      )
                    })}

                    {/* Recents */}
                    {recents.length > 0 && searchQuery === '' && filterType === 'all' && (
                      <div className="px-2.5 py-1 mt-1 text-[8px] text-cyan-400 font-bold tracking-wider uppercase border-b border-white/[0.04]">
                        Recent
                      </div>
                    )}
                    {searchQuery === '' && filterType === 'all' && recents.map(rId => {
                      if (favorites.includes(rId)) return null
                      const m = dedupedModels.find(x => x.id === rId)
                      if (!m) return null
                      return (
                        <button
                          key={rId}
                          onClick={() => { setOpenrouterModel(rId); setShowSelectorDropdown(false) }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left text-[9px] hover:bg-white/[0.04] ${
                            openrouterModel === rId ? 'text-[#a855f7] bg-white/[0.02]' : 'text-slate-300'
                          }`}
                        >
                          <span className="truncate flex-1 font-medium">{m.name}</span>
                          <History size={9} className="text-slate-500" />
                        </button>
                      )
                    })}

                    {/* All models */}
                    <div className="px-2.5 py-1 mt-1 text-[8px] text-slate-500 font-bold tracking-wider uppercase border-b border-white/[0.04]">
                      Models ({listedModels.length})
                    </div>
                    {listedModels.map(m => (
                      <button
                        key={m.id}
                        onClick={() => { setOpenrouterModel(m.id); setShowSelectorDropdown(false) }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 text-left text-[9.5px] hover:bg-white/[0.04] ${
                          openrouterModel === m.id ? 'text-[#a855f7] bg-white/[0.02]' : 'text-slate-300'
                        }`}
                      >
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="truncate font-semibold text-white">{m.name}</div>
                          <div className="text-[7.5px] text-slate-400 font-mono truncate">{m.id}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[7px] text-emerald-400/80 font-mono hidden sm:inline">
                            {formatPricePerMillion(m.pricing.prompt)}
                          </span>
                          <span className="text-[7.5px] text-slate-500 font-mono">
                            {(m.context_length / 1000).toFixed(0)}k
                          </span>
                          <Star
                            size={9}
                            className={favorites.includes(m.id) ? 'fill-[#f59e0b] text-[#f59e0b]' : 'text-slate-600 hover:text-white'}
                            onClick={(e) => toggleFavorite(m.id, e)}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              title="Advanced Generation Settings"
              className={`p-1.5 rounded-md transition-all ${
                showAdvanced ? 'bg-[#8b5cf6]/15 text-[#a855f7] border border-[#8b5cf6]/20' : 'text-[#475569] hover:text-[#94a3b8] hover:bg-white/[0.04]'
              }`}
            >
              <Sliders size={12} />
            </button>
            <button
              onClick={() => setProjectContextMode(v => !v)}
              title="Toggle Project Context Mode"
              className={`p-1.5 rounded-md transition-all text-[10px] ${
                projectContextMode
                  ? 'bg-[#8b5cf6]/15 text-[#a855f7] border border-[#8b5cf6]/20'
                  : 'text-[#475569] hover:text-[#94a3b8] hover:bg-white/[0.04]'
              }`}
            >
              <Layers size={12} />
            </button>
            <button
              onClick={() => setMessages([])}
              title="Clear Chat"
              className="p-1.5 rounded-md text-[#475569] hover:text-[#94a3b8] hover:bg-white/[0.04] transition-all"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Advanced Parameter Controls */}
        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-black/30 border-b border-white/[0.04] overflow-hidden"
            >
              <div className="p-3 space-y-3 text-[10px]">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <span className="text-slate-400 block">Temperature: {temperature}</span>
                    <input
                      type="range" min="0" max="1" step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="w-full accent-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-400 block">Max Tokens: {maxTokens}</span>
                    <input
                      type="range" min="512" max="16384" step="512"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                      className="w-full accent-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-400 block">Top P: {topP}</span>
                    <input
                      type="range" min="0.1" max="1" step="0.05"
                      value={topP}
                      onChange={(e) => setTopP(parseFloat(e.target.value))}
                      className="w-full accent-[#8b5cf6]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-slate-400">System Instruction Editor</span>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={2}
                    className="w-full bg-black/60 border border-white/10 rounded-lg p-1.5 text-[9.5px] text-slate-300 focus:outline-none focus:border-[#8b5cf6] resize-none"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Context bar */}
        <div className="flex flex-wrap items-center gap-1 px-2.5 py-1.5 bg-black/10 border-b border-white/[0.025] overflow-x-auto scrollbar-none">
          {selectedFilePath ? (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#8b5cf6]/8 border border-[#8b5cf6]/12 text-[9px] text-[#c084fc]">
              <FileText size={8} />
              <span className="truncate max-w-[120px]">{getBaseName(selectedFilePath)}</span>
            </div>
          ) : (
            <span className="text-[9px] text-[#3d4461]">No active file</span>
          )}
          {selectedLineNumber && (
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/8 border border-cyan-500/12 text-[9px] text-cyan-400">
              <Code2 size={8} />
              <span>Ln {selectedLineNumber}</span>
            </div>
          )}
          {projectContextMode && rootPath && (
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-500/8 border border-purple-500/12 text-[9px] text-purple-400">
              <FolderSearch size={8} />
              <span>Project Context</span>
            </div>
          )}
          {budgetWarning && (
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/8 border border-amber-500/12 text-[9px] text-amber-400">
              <AlertCircle size={8} />
              <span>Budget ${dailySpend.toFixed(2)}/${dailyBudgetLimit.toFixed(2)}</span>
            </div>
          )}
          {attachedFiles.map(f => (
            <div key={f} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.06] text-[9px] text-[#94a3b8]">
              <span className="truncate max-w-[80px]">{getBaseName(f)}</span>
              <button onClick={() => setAttachedFiles(p => p.filter(x => x !== f))} className="hover:text-rose-400 transition-colors ml-0.5">
                <X size={7} />
              </button>
            </div>
          ))}
        </div>

        {/* Action bar */}
        <div className="border-b border-white/[0.025]">
          <ActionBar
            onAction={handleAction}
            hasFile={!!selectedFilePath}
            disabled={isStreaming}
          />
        </div>
      </div>

      {/* â”€â”€ Messages â”€â”€ */}
      <div ref={messageListRef} onScroll={handleMessageListScroll} className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 space-y-3 nexus-scrollbar-visible">
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-center py-10"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#8b5cf6]/10 to-cyan-500/10 border border-white/[0.06] flex items-center justify-center mb-4">
                <Sparkles size={22} className="text-[#a855f7]" />
              </div>
              <p className="text-[12px] font-semibold text-[#cbd5e1] mb-1">Nexus AI Assistant</p>
              <p className="text-[10px] text-[#475569] max-w-[200px] leading-relaxed">
                OpenRouter engine activated. Stream live from 100+ models. Use commands below:
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-1">
                {['/fix', '/explain', '/refactor', '/generate'].map(cmd => (
                  <button
                    key={cmd}
                    onClick={() => { setInput(cmd + ' '); inputRef.current?.focus() }}
                    className="px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-[9px] text-[#6b7280] hover:text-[#94a3b8] hover:bg-white/[0.06] transition-all font-mono"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role === 'user'
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                className={`flex flex-col gap-0.5 ${isUser ? 'items-end' : 'items-start'}`}
              >
                {/* Meta row */}
                <div className="flex items-center gap-1.5 px-0.5 text-[8.5px] text-[#3d4461] select-none">
                  {!isUser && <Bot size={9} className="text-[#a855f7]" />}
                  <span className="font-medium">{isUser ? 'You' : 'Nexus'}</span>
                  <span>Â·</span>
                  <span className="font-mono text-[8px]">{formatTime(msg.timestamp)}</span>
                </div>

                {/* Bubble */}
                <div
                  className={`px-3 py-2 rounded-xl text-[11px] leading-relaxed max-w-[92%] border shadow-md ${
                    isUser
                      ? 'text-white rounded-tr-none bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] border-purple-500/20'
                      : msg.error
                      ? 'text-rose-300 rounded-tl-none bg-rose-500/5 border-rose-500/15'
                      : 'text-[#d1d5db] rounded-tl-none bg-[#080b12]/80 border-white/[0.04] backdrop-blur-sm'
                  }`}
                >
                  {isUser
                    ? <p className="whitespace-pre-wrap">{msg.content}</p>
                    : renderContent(msg.content, selectedFilePath)}
                  {msg.isStreaming && (
                    <span className="inline-block w-1.5 h-3.5 bg-[#a855f7]/80 ml-0.5 animate-pulse align-text-bottom rounded-sm" />
                  )}
                </div>

                {/* Usage Metrics Under Assistant Bubble */}
                {!isUser && !msg.isStreaming && (
                  <div className="flex flex-col gap-0.5 px-1 mt-0.5 select-none text-[8px] text-[#475569] font-mono">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {msg.timingMs !== undefined && (
                        <span>Time: {(msg.timingMs / 1000).toFixed(2)}s</span>
                      )}
                      {msg.metrics && (
                        <>
                          <span>Â·</span>
                          <span>In: {msg.metrics.inputTokens}</span>
                          <span>Â·</span>
                          <span>Out: {msg.metrics.outputTokens}</span>
                          {msg.metrics.cost > 0 && (
                            <>
                              <span>Â·</span>
                              <span className="text-[#c084fc] font-semibold">Cost: ${msg.metrics.cost.toFixed(4)}</span>
                            </>
                          )}
                          {msg.metrics.speed > 0 && (
                            <>
                              <span>Â·</span>
                              <span>Speed: {msg.metrics.speed} tok/s</span>
                            </>
                          )}
                        </>
                      )}
                      <span>Â·</span>
                      <button 
                        onClick={() => handleRetry(msg.id)}
                        className="text-[#a855f7] hover:text-[#c084fc] flex items-center gap-0.5 font-sans hover:underline cursor-pointer"
                      >
                        <RefreshCw size={8} /> Retry
                      </button>
                    </div>
                  </div>
                )}

                {/* Action chips after assistant messages */}
                {!isUser && !msg.isStreaming && !msg.error && msg.actionChips && (
                  <div className="flex flex-wrap gap-1 px-0.5 mt-0.5">
                    {msg.actionChips.map(chip => (
                      <button
                        key={chip}
                        onClick={() => handleChipClick(chip)}
                        className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] bg-purple-500/5 border border-purple-500/10 text-[#a855f7] hover:bg-purple-500/10 transition-all font-medium"
                      >
                        <Sparkles size={7} />
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>

        {/* Typing indicator when stream is starting */}
        {isStreaming && messages.length > 0 && !(messages[messages.length - 1] as ChatMessage).content && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-start gap-0.5">
            <div className="flex items-center gap-1 text-[8.5px] text-[#3d4461] px-0.5 select-none">
              <Bot size={9} className="text-[#a855f7] animate-pulse" />
              <span>Thinkingâ€¦</span>
            </div>
            <TypingDots />
          </motion.div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* â”€â”€ Input Composer â”€â”€ */}
      <div className="shrink-0 p-2.5 border-t border-white/[0.03] bg-[#050609]/90 backdrop-blur-md relative z-10">

        {/* Slash command autocomplete */}
        <AnimatePresence>
          {showSlash && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.1 }}
              className="absolute bottom-full left-2.5 right-2.5 mb-1 bg-[#0b0c15] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden py-1 z-50"
            >
              {SLASH_COMMANDS.filter(s => s.cmd.startsWith(input)).map((s, i) => (
                <button
                  key={s.cmd}
                  onClick={() => { setInput(s.cmd + ' '); setShowSlash(false); inputRef.current?.focus() }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-[10px] transition-colors ${
                    i === slashIdx ? 'bg-purple-500/10 text-white' : 'text-[#94a3b8] hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[12px]">{s.icon}</span>
                    <span className="text-[#a855f7] font-semibold font-mono">{s.cmd}</span>
                  </div>
                  <span className="text-[#475569] text-[8.5px]">{s.desc}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Composer box */}
        <div className="flex flex-col gap-1.5 rounded-xl border border-white/[0.06] bg-[#040507]/70 focus-within:border-[#8b5cf6]/30 focus-within:ring-1 focus-within:ring-[#8b5cf6]/10 transition-all p-2.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything, type '/' for commandsâ€¦"
            disabled={isStreaming}
            rows={1}
            className="w-full bg-transparent border-none text-[11px] text-[#cbd5e1] placeholder-[#3d4461] focus:outline-none resize-none min-h-[28px] max-h-[120px] leading-relaxed scrollbar-none"
            style={{ fieldSizing: 'content' } as any}
          />

          {/* Bottom row: status + send/stop */}
          <div className="flex items-center justify-between border-t border-white/[0.03] pt-1.5">
            <div className="flex items-center gap-2 text-[8.5px] text-[#3d4461] select-none font-mono">
              <span className="bg-white/[0.01] border border-white/[0.03] px-1.5 py-0.5 rounded text-[7.5px] truncate max-w-[100px]">
                {currentModelLabel}
              </span>
              {isStreaming && (
                <span className="flex items-center gap-1 text-[#a855f7] animate-pulse">
                  <Zap size={8} />
                  Streamingâ€¦
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {isStreaming ? (
                <button
                  onClick={handleStop}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 border border-rose-500/25 text-rose-400 text-[9.5px] font-semibold hover:bg-rose-500/25 transition-all"
                >
                  <Square size={9} />
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#8b5cf6]/90 hover:bg-[#7c3aed] disabled:opacity-30 disabled:cursor-not-allowed text-white text-[9.5px] font-semibold transition-all shadow-lg shadow-purple-500/20"
                >
                  <Send size={9} />
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

