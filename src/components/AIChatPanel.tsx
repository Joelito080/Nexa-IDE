import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Bot, Send, Sparkles, Terminal, FileCode, Clock, 
  Settings, Copy, Check, CornerDownLeft, Play, Cpu, 
  RefreshCw, Trash2, ArrowUpRight, ChevronDown, Circle,
  Paperclip, X, FileText, Code2, AlertTriangle, Layers
} from 'lucide-react'
import { useAppStore, type AIProvider } from '../store/appStore'
import { getFileContent } from '../lib/fileCache'

// Message interface
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  timestamp?: string
  commandChips?: string[]
}

const PRELOAD_CONVERSATION: ChatMessage[] = [
  {
    id: 'pre-1',
    role: 'user',
    content: 'Fix this binary search function, it is causing an infinite loop when the target is missing.',
    timestamp: new Date(Date.now() - 60000).toISOString()
  },
  {
    id: 'pre-2',
    role: 'assistant',
    content: `Here is the corrected binary search implementation. The infinite loop occurred because the search boundary pointers did not advance properly when the target was absent. Adding \`mid + 1\` and \`mid - 1\` boundary offsets fixes it:

\`\`\`typescript
function binarySearch(arr: number[], target: number): number {
  let left = 0;
  let right = arr.length - 1;

  while (left <= right) {
    const mid = Math.floor(left + (right - left) / 2);
    
    if (arr[mid] === target) {
      return mid; // Target found
    }
    
    if (arr[mid] < target) {
      left = mid + 1; // Correct: move left boundary forward
    } else {
      right = mid - 1; // Correct: move right boundary backward
    }
  }

  return -1; // Target not in array
}
\`\`\`

I also optimized the midpoint calculation \`left + (right - left) / 2\` to avoid potential integer overflow on large arrays.`,
    timestamp: new Date(Date.now() - 45000).toISOString(),
    commandChips: ['Explain', 'Optimize', 'Verify']
  }
]

const PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', subtitle: '100+ cloud models', dot: '#a855f7' },
  { id: 'free-agent', name: 'Agent Mode', subtitle: 'Local planner + repair engine', dot: '#22c55e' },
]

const SLASH_COMMANDS = [
  { cmd: '/explain', desc: 'Explain the active file or selected block' },
  { cmd: '/fix', desc: 'Find and fix bugs in this file' },
  { cmd: '/optimize', desc: 'Optimize performance and readability' },
  { cmd: '/debug', desc: 'Add debug logs and identify runtime errors' },
  { cmd: '/test', desc: 'Write comprehensive unit tests for this code' },
]

function GridPattern() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none opacity-20">
      <svg className="absolute left-[50%] top-0 h-[64rem] w-[128rem] -translate-x-[50%] stroke-[#8b5cf6]/10 [mask-image:radial-gradient(64rem_64rem_at_top,white,transparent)]" aria-hidden="true">
        <defs>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse" x="50%">
            <path d="M.5 24V.5H24" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" strokeWidth="0" fill="url(#grid)" />
      </svg>
    </div>
  )
}

interface CodeBlockProps {
  language: string
  code: string
  selectedFilePath: string | null
}

const CodeBlock = ({ language, code, selectedFilePath }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false)
  const [applied, setApplied] = useState(false)
  const addNotification = useAppStore((s) => s.addNotification)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleApply = async () => {
    if (!selectedFilePath) return
    try {
      const api = window.electronAPI || (window as any).electron
      if (!api?.diff) {
        addNotification('Diff engine is not available.', 'error')
        return
      }
      const response = await api.diff.apply(selectedFilePath, code, 'ai-block', 'Apply AI Code Block')
      if (response && !response.error) {
        setApplied(true)
        addNotification('Successfully applied code block changes!', 'success')
        setTimeout(() => setApplied(false), 3000)
      } else {
        addNotification(`Failed to apply changes: ${response?.error ?? 'Unknown error'}`, 'error')
      }
    } catch (err) {
      addNotification(`Failed to apply changes: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const lines = code.split('\n')

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-white/[0.08] bg-[#0b0c13] shadow-2xl font-mono text-[10.5px]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/40 border-b border-white/[0.04] select-none">
        <div className="flex items-center gap-1.5">
          <FileCode size={11} className="text-[#a855f7]" />
          <span className="text-[9px] text-[#8e9aa8] font-bold uppercase tracking-wider font-sans">{language || 'code'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {selectedFilePath && (
            <button
              onClick={handleApply}
              className="text-[9px] text-[#a855f7] hover:text-[#c084fc] transition-colors flex items-center gap-1 font-semibold px-2 py-0.5 rounded bg-purple-500/5 border border-purple-500/10 hover:bg-purple-500/10"
            >
              {applied ? <Check size={9} /> : <Wand2Icon />}
              <span>{applied ? 'Applied' : 'Apply Edit'}</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="text-[9px] text-[#8e9aa8] hover:text-[#cbd5e1] transition-colors flex items-center gap-1 font-semibold px-2 py-0.5 rounded bg-white/[0.02] border border-white/[0.04]"
          >
            {copied ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
      <div className="flex overflow-x-auto bg-[#040508]/95 p-3.5 scrollbar-none leading-relaxed text-[#e2e8f0]">
        <div className="text-right text-[#3f4e64] pr-3.5 select-none border-r border-white/[0.04] text-[9.5px]">
          {lines.map((_, idx) => (
            <div key={idx}>{idx + 1}</div>
          ))}
        </div>
        <pre className="pl-3.5 m-0 font-mono text-[10.5px] select-text">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  )
}

function Wand2Icon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/>
      <path d="m14 7 3 3"/>
      <path d="M5 6v4"/>
      <path d="M19 14v4"/>
      <path d="M10 2v2"/>
      <path d="M7 8H3"/>
      <path d="M21 16H17"/>
      <path d="M12 22v-2"/>
    </svg>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl rounded-tl-none bg-white/[0.015] border border-white/[0.04] max-w-[80px]">
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7] animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7] animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7] animate-bounce" />
      </div>
    </div>
  )
}

export default function AIChatPanel() {
  const messages = useAppStore((s) => s.aiChatHistory)
  const setMessages = useAppStore((s) => s.setAiChatHistory)
  const selectedFilePath = useAppStore((s) => s.selectedFilePath)
  const selectedLineNumber = useAppStore((s) => s.selectedLineNumber)
  const rootPath = useAppStore((s) => s.rootPath)
  const aiProvider = useAppStore((s) => s.aiProvider)
  const setAIProvider = useAppStore((s) => s.setAIProvider)
  const aiModel = useAppStore((s) => s.aiModel)
  const setAiModel = useAppStore((s) => s.setAiModel)
  const addNotification = useAppStore((s) => s.addNotification)
  const setLicenseStatus = useAppStore((s) => s.setLicenseStatus)
  // Consume pending AI prompt injected by editor gutter / header buttons
  const pendingAiPrompt = useAppStore((s) => s.pendingAiPrompt)
  const setPendingAiPrompt = useAppStore((s) => s.setPendingAiPrompt)

  const [inputValue, setInputValue] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<string[]>([])
  const [showCommandMenu, setShowCommandMenu] = useState(false)
  const [commandFilterIdx, setCommandFilterIdx] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  // Guard: only inject the preload demo once per component lifetime, not on every clear.
  const preloadInjectedRef = useRef(false)

  // Prepopulate demo conversation only on first mount if history is empty
  useEffect(() => {
    if (!preloadInjectedRef.current && messages.length === 0) {
      preloadInjectedRef.current = true
      setMessages(PRELOAD_CONVERSATION)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Consume pendingAiPrompt set by editor gutter clicks / header action buttons.
  // When set, pre-fill the input box and focus it so the user can review + send.
  useEffect(() => {
    if (!pendingAiPrompt) return
    setInputValue(pendingAiPrompt)
    setPendingAiPrompt(null)
    // Defer focus so the panel has time to finish animating open
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [pendingAiPrompt, setPendingAiPrompt])

  // Auto-scroll logic (keep bottom in view during streaming)
  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleMessageListScroll = () => {
    const el = messageListRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 40
    setAutoScroll(isAtBottom)
  }

  useEffect(() => {
    if (!autoScroll) return
    scrollToBottom()
  }, [messages, isThinking, scrollToBottom, autoScroll])

  const selectProvider = (provId: AIProvider) => {
    setAIProvider(provId)
    if (provId === 'openrouter') {
      setAiModel('openai/gpt-4o')
    }
    setShowDropdown(false)
  }

  // Handle file Drag/Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const paths = Array.from(files).map((f: any) => f.path).filter(Boolean)
      setAttachedFiles((prev) => {
        const next = [...prev]
        paths.forEach((p) => {
          if (!next.includes(p)) next.push(p)
        })
        return next
      })
      addNotification(`Attached ${paths.length} file(s) as context.`, 'info')
    }
  }

  const handleSend = async () => {
    if (!inputValue.trim() || isThinking || streamingId) return
    const text = inputValue
    setInputValue('')
    setShowCommandMenu(false)
    
    const userId = `user-${Date.now()}`
    const updatedMessages = [
      ...messages,
      {
        id: userId,
        role: 'user' as const,
        content: text,
        timestamp: new Date().toISOString()
      }
    ]
    setMessages(updatedMessages)
    setAutoScroll(true)
    setIsThinking(true)

    // License check
    const allowed = await window.electronAPI?.license.canUseAI()
    if (!allowed && text.trim().toLowerCase() !== 'im the owner') {
      addNotification('AI usage limit reached for Free tier. Upgrade to Pro to continue.', 'warning')
      setMessages([
        ...updatedMessages,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant' as const,
          content: 'AI is unavailable on Free tier. Upgrade to Pro to continue.',
          timestamp: new Date().toISOString()
        }
      ])
      setIsThinking(false)
      return
    }

    const selectedFileContent = selectedFilePath ? getFileContent(selectedFilePath) : null
    
    // Read attached files context
    const attachedContext: string[] = []
    for (const f of attachedFiles) {
      const content = getFileContent(f) || ''
      attachedContext.push(`File: ${f}\nContent:\n${content}`)
    }

    const fullPrompt = [
      attachedContext.length > 0 ? `Context Files:\n${attachedContext.join('\n\n')}\n` : '',
      selectedFilePath ? `Active File: ${selectedFilePath}\nActive Line: ${selectedLineNumber || 'None'}\n` : '',
      selectedFileContent ? `Active File Content:\n${selectedFileContent}\n` : '',
      `User request: ${text}`
    ].filter(Boolean).join('\n')

    const payload = {
      prompt: fullPrompt,
      model: aiModel || 'llama3',
      provider: aiProvider || 'openrouter',
      filePath: selectedFilePath,
      fileContent: selectedFileContent || '',
      projectPath: rootPath,
    }

    try {
      const response = await window.electronAPI?.ai.chat(payload)
      if (response && !(response as any).error) {
        try {
          const rec = await window.electronAPI?.license.recordAIRequest()
          if (rec && !(rec as any).error) setLicenseStatus(rec as any)
        } catch (e) {
          // ignore
        }
      }

      const responseText = response && !(response as any).error
        ? (response as any).response ?? 'AI responded with no message.'
        : `AI request failed: ${(response as any).error ?? 'Unknown error'}`

      setIsThinking(false)

      const assistantId = `ai-${Date.now()}`
      const baseAssistantMessage = {
        id: assistantId,
        role: 'assistant' as const,
        content: '',
        isStreaming: true,
        timestamp: new Date().toISOString(),
        commandChips: ['Fix Code', 'Explain', 'Optimize']
      }

      setMessages([...updatedMessages, baseAssistantMessage])
      setStreamingId(assistantId)

      // Stream text character-by-character for visual feedback
      let currentText = ''
      const chars = responseText.split('')
      for (let i = 0; i < chars.length; i++) {
        await new Promise((r) => setTimeout(r, 6))
        currentText += chars[i]
        setMessages([
          ...updatedMessages,
          {
            ...baseAssistantMessage,
            content: currentText
          }
        ])
      }

      // Finalize message stream
      setMessages([
        ...updatedMessages,
        {
          ...baseAssistantMessage,
          content: responseText,
          isStreaming: false
        }
      ])
      setStreamingId(null)

    } catch (err) {
      console.error('AI chat failed:', err)
      setIsThinking(false)
      setMessages([
        ...updatedMessages,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant' as const,
          content: `AI request failed: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date().toISOString()
        }
      ])
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInputValue(val)

    if (val.startsWith('/')) {
      setShowCommandMenu(true)
      // Filter list or reset index
      const filtered = SLASH_COMMANDS.filter(s => s.cmd.startsWith(val))
      if (filtered.length === 0) setShowCommandMenu(false)
    } else {
      setShowCommandMenu(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommandMenu) {
      const filtered = SLASH_COMMANDS.filter(s => s.cmd.startsWith(inputValue))
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCommandFilterIdx((prev) => (prev + 1) % filtered.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCommandFilterIdx((prev) => (prev - 1 + filtered.length) % filtered.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (filtered[commandFilterIdx]) {
          setInputValue(filtered[commandFilterIdx].cmd + ' ')
          setShowCommandMenu(false)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowCommandMenu(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleChipClick = (chip: string) => {
    if (isThinking || streamingId) return
    setInputValue(`${chip}: `)
    inputRef.current?.focus()
  }

  const removeAttachment = (path: string) => {
    setAttachedFiles((prev) => prev.filter((p) => p !== path))
  }

  const handleOpenFile = (path: string) => {
    useAppStore.getState().setSelectedFilePath(path)
  }

  const handleJumpToSelectedLines = () => {
    if (selectedLineNumber && selectedFilePath) {
      useAppStore.getState().setSelectedLineNumber(selectedLineNumber)
    }
  }

  // Calculate approximate tokens
  const totalTokens = calculateTokens(inputValue, attachedFiles)
  function calculateTokens(text: string, files: string[]) {
    let chars = text.length
    files.forEach((f) => {
      const content = getFileContent(f)
      if (content) chars += content.length
    })
    if (selectedFilePath) {
      const content = getFileContent(selectedFilePath)
      if (content) chars += content.length
    }
    return Math.max(0, Math.round(chars / 4.1))
  }

  const renderMessageContent = (text: string) => {
    const blocks: { type: 'code' | 'text'; lang?: string; content: string }[] = []
    let remaining = text

    while (remaining.length > 0) {
      const codeStart = remaining.indexOf('```')
      if (codeStart === -1) {
        blocks.push({ type: 'text', content: remaining })
        break
      }
      if (codeStart > 0) blocks.push({ type: 'text', content: remaining.slice(0, codeStart) })
      const afterOpen = remaining.slice(codeStart + 3)
      const firstLineEnd = afterOpen.indexOf('\n')
      const lang = firstLineEnd === -1 ? '' : afterOpen.slice(0, firstLineEnd).trim()
      const codeContentStart = firstLineEnd === -1 ? 0 : firstLineEnd + 1
      const closeIdx = afterOpen.indexOf('```')
      const codeContent = closeIdx === -1 ? afterOpen.slice(codeContentStart) : afterOpen.slice(codeContentStart, closeIdx)
      blocks.push({ type: 'code', lang, content: codeContent.trimEnd() })
      remaining = closeIdx === -1 ? '' : afterOpen.slice(closeIdx + 3)
    }

    return blocks.map((block, i) => {
      if (block.type === 'text') {
        return (
          <p key={i} className="whitespace-pre-wrap text-[11px] leading-relaxed mb-1 last:mb-0">
            {block.content}
          </p>
        )
      }
      return (
        <CodeBlock 
          key={i} 
          language={block.lang || 'typescript'} 
          code={block.content} 
          selectedFilePath={selectedFilePath} 
        />
      )
    })
  }

  const formatTime = (isoString?: string) => {
    if (!isoString) return ''
    try {
      const date = new Date(isoString)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  // Get base name of a path
  const getBaseName = (pathStr: string) => {
    return pathStr.replace(/\\/g, '/').split('/').pop() || pathStr
  }

  return (
    <div 
      ref={containerRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative flex flex-col h-full min-h-0 overflow-hidden bg-gradient-to-b from-[#0a0b12] to-[#050608] border border-white/[0.04] rounded-2xl shadow-2xl select-none"
    >
      {/* Background Grid Accent */}
      <GridPattern />
      
      {/* Glowing border edges */}
      <div className="absolute inset-0 pointer-events-none rounded-2xl border border-purple-500/10 shadow-[inset_0_0_20px_rgba(139,92,246,0.02)]" />
      <div className="absolute top-0 left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-[#8b5cf6]/30 to-transparent" />

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3.5 py-2.5 bg-black/20 border-b border-white/[0.04] backdrop-blur-md relative z-20">
        <div className="flex items-center gap-2">
          <div className="w-5.5 h-5.5 rounded-lg flex items-center justify-center bg-gradient-to-br from-[#8b5cf6] to-[#06b6d4] p-1 shadow-md shadow-purple-500/10">
            <Cpu size={12} className="text-white" />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.02] hover:bg-white/[0.07] border border-white/[0.06] text-[10px] text-white font-semibold transition-all cursor-pointer"
            >
              <Circle size={4.5} className="fill-current animate-pulse text-purple-400" />
              <span className="capitalize">
                {PROVIDERS.find((p) => p.id === aiProvider)?.name || 'OpenRouter'}
              </span>
              <ChevronDown size={8} className="text-[#6b7280]" />
            </button>
            
            {showDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                <div className="absolute left-0 mt-1 w-36 bg-[#0d0e16] border border-white/[0.08] rounded-lg shadow-2xl py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => selectProvider(p.id as AIProvider)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/[0.05] text-left text-[10px] text-[#cbd5e1] transition-colors cursor-pointer"
                    >
                      <Circle size={5} style={{ fill: p.dot, color: p.dot }} />
                      <div>
                        <div className="font-semibold leading-none">{p.name}</div>
                        <div className="text-[8px] text-[#475569] mt-0.5">{p.subtitle}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setMessages(PRELOAD_CONVERSATION)}
            title="Reset Conversation"
            className="p-1 rounded-md hover:bg-white/[0.04] text-[#6b7280] hover:text-[#cbd5e1] transition-all cursor-pointer"
          >
            <RefreshCw size={11} />
          </button>
          <button
            onClick={() => setMessages([])}
            title="Clear Chat"
            className="p-1 rounded-md hover:bg-white/[0.04] text-[#6b7280] hover:text-[#cbd5e1] transition-all cursor-pointer"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Dynamic Context Bar */}
      <div className="shrink-0 flex flex-wrap items-center gap-1.5 px-3 py-1.5 bg-black/10 border-b border-white/[0.02] overflow-x-auto scrollbar-none select-none">
        {selectedFilePath ? (
          <button 
            onClick={() => handleOpenFile(selectedFilePath)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#8b5cf6]/5 border border-[#8b5cf6]/10 text-[9px] text-[#c084fc] hover:bg-[#8b5cf6]/10 transition-colors"
          >
            <FileText size={8.5} />
            <span>{getBaseName(selectedFilePath)}</span>
          </button>
        ) : (
          <div className="text-[9px] text-slate-500 font-medium py-0.5 px-1 select-none">No active file</div>
        )}

        {selectedLineNumber !== null && (
          <button 
            onClick={handleJumpToSelectedLines}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/5 border border-cyan-500/10 text-[9px] text-cyan-400 hover:bg-cyan-500/10 transition-colors"
          >
            <Code2 size={8.5} />
            <span>Line {selectedLineNumber}</span>
          </button>
        )}

        {rootPath && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/5 border border-emerald-500/10 text-[9px] text-emerald-400">
            <span>Workspace Active</span>
          </div>
        )}

        {attachedFiles.map((path) => (
          <div 
            key={path}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.06] text-[9px] text-slate-300"
          >
            <button 
              onClick={() => handleOpenFile(path)}
              className="hover:underline hover:text-white"
            >
              {getBaseName(path)}
            </button>
            <button 
              onClick={() => removeAttachment(path)}
              className="text-[#475569] hover:text-rose-400 ml-0.5"
            >
              <X size={8} />
            </button>
          </div>
        ))}
      </div>

      {/* Chat Messagestimeline */}
      <div ref={messageListRef} onScroll={handleMessageListScroll} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 nexus-scrollbar-visible">
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isUser = msg.role === 'user'
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={`flex flex-col gap-0.5 w-full ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 px-1 select-none text-[8.5px] text-[#475569]">
                  {!isUser && <Bot size={9} className="text-[#a855f7]" />}
                  <span className="font-semibold">{isUser ? 'User' : 'Nexus Assistant'}</span>
                  <span>•</span>
                  <span className="font-mono text-[8px]">{formatTime(msg.timestamp)}</span>
                </div>

                <div
                  className={`px-3 py-2 rounded-xl text-[11px] leading-relaxed max-w-[90%] border shadow-md ${
                    isUser
                      ? 'text-white rounded-tr-none bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] border-purple-500/20 shadow-purple-500/5'
                      : 'text-[#d1d5db] rounded-tl-none bg-[#090b12]/80 border-white/[0.04] backdrop-blur-sm shadow-black/20'
                  }`}
                  style={{
                    boxShadow: !isUser && msg.id === streamingId ? '0 0 15px rgba(139,92,246,0.04)' : undefined
                  }}
                >
                  {renderMessageContent(msg.content)}
                  {msg.isStreaming && (
                    <span className="inline-block w-1.5 h-3 bg-[#a855f7] ml-0.5 animate-pulse align-middle" />
                  )}
                </div>

                {!isUser && msg.commandChips && !msg.isStreaming && (
                  <div className="flex items-center gap-1 mt-1 px-1 flex-wrap select-none">
                    {msg.commandChips.map((chip: string) => (
                      <button
                        key={chip}
                        onClick={() => handleChipClick(chip)}
                        className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-purple-500/5 hover:bg-purple-500/10 border border-purple-500/10 hover:border-purple-400/30 text-[9px] text-[#a855f7] transition-all cursor-pointer font-medium"
                      >
                        <Sparkles size={8} />
                        <span>{chip}</span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>

        {isThinking && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-0.5 items-start"
          >
            <div className="flex items-center gap-1 px-1 select-none text-[8.5px] text-[#475569]">
              <Bot size={9} className="text-[#a855f7] animate-spin" />
              <span className="font-semibold">Thinking...</span>
            </div>
            <TypingIndicator />
          </motion.div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input Composer (Sticky Bottom) */}
      <div className="shrink-0 p-3 border-t border-white/[0.03] bg-[#06070b]/90 backdrop-blur-md relative z-10 select-none">
        
        {/* Command Menu Autocomplete Overlay */}
        {showCommandMenu && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-[#0b0c14] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden py-1 z-50 max-h-40 overflow-y-auto">
            {SLASH_COMMANDS.filter(s => s.cmd.startsWith(inputValue)).map((s, idx) => (
              <button
                key={s.cmd}
                onClick={() => {
                  setInputValue(s.cmd + ' ')
                  setShowCommandMenu(false)
                  inputRef.current?.focus()
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors text-[10px] ${
                  idx === commandFilterIdx ? 'bg-purple-500/10 text-white font-medium' : 'text-slate-300 hover:bg-white/[0.02]'
                }`}
              >
                <span className="text-[#a855f7] font-semibold">{s.cmd}</span>
                <span className="text-slate-500 text-[8.5px]">{s.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* Quick Helper Chip Bar */}
        <div className="flex items-center gap-1 px-0.5 pb-2 overflow-x-auto scrollbar-none">
          {['Fix Code', 'Explain', 'Optimize', 'Debug'].map((act) => (
            <button
              key={act}
              onClick={() => handleChipClick(act)}
              className="flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-white/[0.08] text-[9px] text-[#cbd5e1] transition-all cursor-pointer font-medium"
            >
              <span>{act}</span>
            </button>
          ))}
        </div>

        {/* Composer Box */}
        <div className="flex flex-col gap-1 rounded-xl border border-white/[0.06] bg-[#040508]/60 focus-within:border-[#8b5cf6]/30 focus-within:ring-1 focus-within:ring-[#8b5cf6]/10 transition-all p-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything, type '/' for commands..."
            disabled={isThinking || !!streamingId}
            className="w-full bg-transparent border-none text-[11px] text-[#cbd5e1] placeholder-[#475569] focus:outline-none focus:ring-0 resize-none min-h-[32px] max-h-20 leading-relaxed scrollbar-none"
            rows={1}
          />
          
          <div className="flex items-center justify-between border-t border-white/[0.03] pt-1.5 mt-0.5 text-[8px] select-none text-slate-500">
            <div className="flex items-center gap-2">
              <span className="font-mono bg-white/[0.01] border border-white/[0.03] px-1.5 py-0.5 rounded uppercase tracking-wider">
                {PROVIDERS.find((p) => p.id === aiProvider)?.name || 'OpenRouter'} / {aiModel || 'openai/gpt-4o'}
              </span>
              <span>·</span>
              <span className="font-mono text-slate-600">
                {totalTokens} tokens
              </span>
            </div>
            
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isThinking || !!streamingId}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-white transition-all cursor-pointer"
              style={{
                background: inputValue.trim() && !isThinking && !streamingId ? 'linear-gradient(135deg, #a855f7, #06b6d4)' : 'rgba(168,85,247,0.04)',
                boxShadow: inputValue.trim() && !isThinking && !streamingId ? '0 0 10px rgba(168,85,247,0.1)' : 'none',
                opacity: inputValue.trim() && !isThinking && !streamingId ? 1 : 0.3
              }}
            >
              <Send size={10} />
            </button>
          </div>
        </div>
        
        <p className="text-[8px] text-slate-700 mt-2 text-center leading-none">
          Shift+Enter for newline · Enter to send · Drag/drop files to attach
        </p>
      </div>

    </div>
  )
}
