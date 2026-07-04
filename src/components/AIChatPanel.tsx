import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Bot, Send, Sparkles, Terminal, FileCode, Clock, 
  Settings, Copy, Check, CornerDownLeft, Play, Cpu, 
  RefreshCw, Trash2, ArrowUpRight, ChevronDown, Circle,
  Paperclip, X, FileText, Code2, AlertTriangle, Layers, Bug, Save, RotateCcw, History
} from 'lucide-react'
import { useAppStore, type AIProvider, buildAiSessionKey, getAiSessionState, DEFAULT_AI_SESSION_STATE } from '../store/appStore'
import { calculatePromptBudget, buildTokenBudgetedPrompt, PromptSection, estimateTokens } from '../lib/aiTokenBudget'
import { useAppModal } from './ui/ModalDialog'
import { getFileContent, clearFileCache, clearAllLargeFileStatuses } from '../lib/fileCache'
import { AiDebugInfoBuilder, isDebugMode, setLastDebugInfo, getLastDebugInfo } from '../lib/aiDebugStore'
import { AiDebugModal } from './ai/AiDebugModal'
import SessionTimeline, { type TimelineEvent } from './ai/SessionTimeline'
import { 
  createSnapshot, saveSnapshot, getSnapshot, listSnapshots, deleteSnapshot, autoSaveLatest,
  getLatestSnapshot, clearLatestSnapshot, type SessionSnapshot
} from '../lib/sessionSnapshots'

// Message interface
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  timestamp?: string
  commandChips?: string[]
  error?: boolean
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

const FILE_COMMANDS = new Set(['/fix', '/explain', '/optimize', '/debug', '/test', '/document', '/refactor'])

type AIMode = 'chat' | 'code' | 'project' | 'agent' | 'refactor'

const AI_MODES: Array<{ id: AIMode; label: string; description: string }> = [
  { id: 'chat', label: 'Chat Mode', description: 'No file or workspace context, just plain conversation.' },
  { id: 'code', label: 'Code Mode', description: 'Include the selected file only for targeted code work.' },
  { id: 'project', label: 'Project Mode', description: 'Use workspace context and imports to understand the project.' },
  { id: 'agent', label: 'Agent Mode', description: 'Route to the local agent with tool/action orchestration.' },
  { id: 'refactor', label: 'Refactor Mode', description: 'Transform the selected file only.' },
]

const AI_MODE_CONFIG: Record<AIMode, {
  includeSelectedFile: boolean
  includeWorkspaceContext: boolean
  includeImportedFiles: boolean
  includeAttachedFiles: boolean
  provider: AIProvider
  modeHint: string
}> = {
  chat: {
    includeSelectedFile: false,
    includeWorkspaceContext: false,
    includeImportedFiles: false,
    includeAttachedFiles: false,
    provider: 'openrouter',
    modeHint: 'Chat without injecting file or workspace context.',
  },
  code: {
    includeSelectedFile: true,
    includeWorkspaceContext: false,
    includeImportedFiles: false,
    includeAttachedFiles: false,
    provider: 'openrouter',
    modeHint: 'Include only the selected file content for code-focused requests.',
  },
  project: {
    includeSelectedFile: false,
    includeWorkspaceContext: true,
    includeImportedFiles: true,
    includeAttachedFiles: false,
    provider: 'openrouter',
    modeHint: 'Use workspace structure and imports to understand project context.',
  },
  agent: {
    includeSelectedFile: false,
    includeWorkspaceContext: false,
    includeImportedFiles: false,
    includeAttachedFiles: false,
    provider: 'free-agent',
    modeHint: 'Run the local agent with tool/action orchestration.',
  },
  refactor: {
    includeSelectedFile: true,
    includeWorkspaceContext: false,
    includeImportedFiles: false,
    includeAttachedFiles: false,
    provider: 'openrouter',
    modeHint: 'Transform the selected file only.',
  },
}

const MAX_AI_ATTACHED_FILES = 5
const MAX_AI_FILE_BYTES = 200 * 1024
const MAX_AI_FILE_LINES = 3000

function truncateFileContent(content: string): { content: string; truncated: boolean } {
  const lines = content.split('\n')
  if (lines.length > MAX_AI_FILE_LINES) {
    return {
      content: lines.slice(0, MAX_AI_FILE_LINES).join('\n') + '\n...[truncated after 3000 lines]...',
      truncated: true,
    }
  }
  if (new Blob([content]).size > MAX_AI_FILE_BYTES) {
    const allowed = Math.floor((MAX_AI_FILE_BYTES / content.length) * content.length)
    const truncated = content.slice(0, allowed)
    return {
      content: truncated + '\n...[truncated after 200KB]...',
      truncated: true,
    }
  }
  return { content, truncated: false }
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
  filePath: string | null
  onToolExecuted?: () => void
}

const CodeBlock = ({ language, code, filePath, onToolExecuted }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false)
  const [applied, setApplied] = useState(false)
  const addNotification = useAppStore((s) => s.addNotification)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleApply = async () => {
    if (!filePath) return
    try {
      const api = window.electronAPI || (window as any).electron
      if (!api?.diff) {
        addNotification('Diff engine is not available.', 'error')
        return
      }
      const response = await api.diff.apply(filePath, code, 'ai-block', 'Apply AI Code Block')
      if (response && !response.error) {
        setApplied(true)
        addNotification('Successfully applied code block changes!', 'success')
        onToolExecuted?.()
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
          {filePath && (
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
  const openTabs = useAppStore((s) => s.openTabs)
  const aiProvider = useAppStore((s) => s.aiProvider)
  const setAIProvider = useAppStore((s) => s.setAIProvider)
  const aiModel = useAppStore((s) => s.aiModel)
  const setAiModel = useAppStore((s) => s.setAiModel)
  const addNotification = useAppStore((s) => s.addNotification)
  const setLicenseStatus = useAppStore((s) => s.setLicenseStatus)
  const updateAiSession = useAppStore((s) => s.updateAiSession)
  const currentSession = useAppStore((s) => getAiSessionState(s, aiProvider, aiModel || 'llama3'))
  const aiSessionKey = buildAiSessionKey(aiProvider, aiModel || 'llama3')
  const aiRecoveryPending = useAppStore((s) => s.aiRecoveryPending)
  const setAiRecoveryPending = useAppStore((s) => s.setAiRecoveryPending)
  const restoringSnapshotRef = useRef(false)
  const [showRecoveryMenu, setShowRecoveryMenu] = useState(false)
  const [showRecoveryDetails, setShowRecoveryDetails] = useState(false)
  const latestRecoverySnapshot = getLatestSnapshot()
  const recoveryTokenEstimate = latestRecoverySnapshot
    ? estimateTokens(
        `${latestRecoverySnapshot.data.systemPrompt}\n${latestRecoverySnapshot.data.chatHistory.map((m) => m.content).join('\n')}`
      )
    : 0
  // Consume pending AI prompt injected by editor gutter / header buttons
  const pendingAiPrompt = useAppStore((s) => s.pendingAiPrompt)
  const setPendingAiPrompt = useAppStore((s) => s.setPendingAiPrompt)
  const { confirm, prompt } = useAppModal()

  const [inputValue, setInputValue] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<string[]>([])
  const [showCommandMenu, setShowCommandMenu] = useState(false)
  const [commandFilterIdx, setCommandFilterIdx] = useState(0)
  const [systemPrompt, setSystemPrompt] = useState('You are Nexus Assistant, a precise coding assistant for NEXA IDE. Be concise and answer with code examples when appropriate.')
  const [showSystemPrompt, setShowSystemPrompt] = useState(true)
  const [showUserPrompt, setShowUserPrompt] = useState(true)
  const [showSelectedFile, setShowSelectedFile] = useState(true)
  const [showAttachedFiles, setShowAttachedFiles] = useState(true)
  const [showImportedFiles, setShowImportedFiles] = useState(true)
  const [showWorkspaceContext, setShowWorkspaceContext] = useState(true)
  const [aiMode, setAiMode] = useState<AIMode>('chat')
  const [temperature, setTemperature] = useState(0.5)
  const [maxTokens, setMaxTokens] = useState(1024)
  const [topP, setTopP] = useState(1)
  const [debugMode, setDebugMode] = useState(false)
  const [debugInfo, setDebugInfo] = useState(getLastDebugInfo())
  const [showDebugModal, setShowDebugModal] = useState(false)

  // Session snapshots
  const [savedSnapshots, setSavedSnapshots] = useState<SessionSnapshot[]>(listSnapshots(10))
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [showSnapshotMenu, setShowSnapshotMenu] = useState(false)
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  // Guard: only inject the preload demo once per component lifetime, not on every clear.
  const preloadInjectedRef = useRef(false)
  const previousModelRef = useRef<string>(aiModel || '')

  const addTimelineEvent = useCallback((event: Omit<TimelineEvent, 'id' | 'timestamp'>) => {
    setTimelineEvents((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        ...event,
      },
      ...prev,
    ].slice(0, 40))
  }, [])

  const handleToolExecution = useCallback(() => {
    addTimelineEvent({
      type: 'tool_execution',
      description: 'Applied AI-generated code to the active file.',
    })
  }, [addTimelineEvent])

  // Soft Reset: clears messages, temp files, and pending prompts only
  const softResetSession = useCallback(() => {
    // Clear conversation history
    setMessages([])
    
    // Clear context cache and file memory
    clearFileCache()
    clearAllLargeFileStatuses()
    
    // Clear attached files and input
    setAttachedFiles([])
    setInputValue('')
    
    // Clear pending AI prompts
    setPendingAiPrompt(null)
    
    // Scroll to top
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
    
    addNotification('Soft reset: cleared history, attached files, and temporary file cache', 'success')
    addTimelineEvent({
      type: 'reset',
      description: 'Soft reset: cleared history, attached files, and temporary file cache.',
    })
  }, [setMessages, setAttachedFiles, addNotification, setPendingAiPrompt, addTimelineEvent])

  // Hard Reset: clears everything including model memory, tool state, and all settings
  const hardResetSession = useCallback(() => {
    // Clear conversation history
    setMessages([])
    
    // Clear context cache and file memory
    clearFileCache()
    clearAllLargeFileStatuses()
    
    // Clear attached files and input
    setAttachedFiles([])
    setInputValue('')
    
    // Reset model parameters to defaults
    setTemperature(0.5)
    setMaxTokens(1024)
    setTopP(1)
    
    // Reset all visibility toggles to defaults
    setShowSystemPrompt(true)
    setShowUserPrompt(true)
    setShowSelectedFile(true)
    setShowAttachedFiles(true)
    setShowImportedFiles(true)
    setShowWorkspaceContext(true)
    
    // Reset system prompt to default
    setSystemPrompt('You are Nexus Assistant, a precise coding assistant for NEXA IDE. Be concise and answer with code examples when appropriate.')
    
    // Reset AI mode
    setAiMode('chat')
    
    // Reset debug mode and info
    setDebugMode(false)
    setDebugInfo(null)
    setShowDebugModal(false)
    
    // Clear pending AI prompts
    setPendingAiPrompt(null)
    
    // Clear session cache in global store
    const emptyCache = {}
    useAppStore.setState({ aiSessionCache: emptyCache })
    useAppStore.setState({ aiChatHistory: [] })
    
    // Scroll to top
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
    
    addNotification('Hard reset: cleared history, context, memory, tool state, and all settings', 'success')
    addTimelineEvent({
      type: 'reset',
      description: 'Hard reset: cleared AI session state, memory, and personalization.',
    })
  }, [setMessages, setAttachedFiles, addNotification, setPendingAiPrompt, addTimelineEvent])

  // Save current session as a snapshot
  const handleSaveSnapshot = useCallback(async () => {
    const name = await prompt({
      title: 'Save Session Snapshot',
      message: 'Enter a name for this session snapshot:',
      placeholder: `Snapshot ${new Date().toLocaleTimeString()}`,
      confirmText: 'Save',
      cancelText: 'Cancel',
    })

    if (!name) return

    const snapshot = createSnapshot(
      messages,
      aiModel || 'llama3',
      aiProvider,
      attachedFiles,
      { temperature, maxTokens, topP },
      systemPrompt,
      aiMode,
      {
        showSystemPrompt,
        showUserPrompt,
        showSelectedFile,
        showAttachedFiles,
        showImportedFiles,
        showWorkspaceContext,
      },
      name
    )
    
    saveSnapshot(snapshot)
    setSavedSnapshots(listSnapshots(10))
    addNotification(`Saved snapshot: ${name}`, 'success')
  }, [messages, aiModel, aiProvider, attachedFiles, temperature, maxTokens, topP, systemPrompt, aiMode, showSystemPrompt, showUserPrompt, showSelectedFile, showAttachedFiles, showImportedFiles, showWorkspaceContext, addNotification, prompt])

  // Restore a snapshot
  const handleRestoreSnapshot = useCallback((snapshotId: string) => {
    const snapshot = getSnapshot(snapshotId)
    if (!snapshot) {
      addNotification('Snapshot not found', 'error')
      return
    }

    const { data } = snapshot
    
    // Restore chat history
    setMessages(data.chatHistory)
    
    // Restore model
    setAiModel(data.model)
    
    // Restore attached files
    setAttachedFiles(data.attachedFiles)
    
    // Restore parameters
    setTemperature(data.parameters.temperature)
    setMaxTokens(data.parameters.maxTokens)
    setTopP(data.parameters.topP)
    
    // Restore system prompt
    setSystemPrompt(data.systemPrompt)
    
    // Restore mode
    setAiMode(data.mode)
    
    // Restore visibility toggles
    setShowSystemPrompt(data.visibility.showSystemPrompt)
    setShowUserPrompt(data.visibility.showUserPrompt)
    setShowSelectedFile(data.visibility.showSelectedFile)
    setShowAttachedFiles(data.visibility.showAttachedFiles)
    setShowImportedFiles(data.visibility.showImportedFiles)
    setShowWorkspaceContext(data.visibility.showWorkspaceContext)
    
    setShowSnapshotMenu(false)
    addNotification(`Restored snapshot: ${snapshot.name}`, 'success')
    addTimelineEvent({
      type: 'recovery_restore',
      description: `Restored session snapshot: ${snapshot.name}`,
    })
  }, [setMessages, setAiModel, setAttachedFiles, setTemperature, setMaxTokens, setTopP, setSystemPrompt, setAiMode, setShowSystemPrompt, setShowUserPrompt, setShowSelectedFile, setShowAttachedFiles, setShowImportedFiles, setShowWorkspaceContext, addNotification, addTimelineEvent])

  // Delete a snapshot
  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    const snapshot = getSnapshot(snapshotId)
    if (!snapshot) return

    const shouldDelete = await confirm({
      title: 'Delete Snapshot',
      message: `Are you sure you want to delete "${snapshot.name}"?`,
      confirmText: 'Delete',
      cancelText: 'Keep',
    })

    if (shouldDelete) {
      deleteSnapshot(snapshotId)
      setSavedSnapshots(listSnapshots(10))
      addNotification(`Deleted snapshot: ${snapshot.name}`, 'success')
    }
  }, [confirm, addNotification])

  // Auto-save latest snapshot periodically
  useEffect(() => {
    // Clear any existing interval
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current)
    }

    // Auto-save every 30 seconds when there are messages
    if (messages.length > 0) {
      autoSaveIntervalRef.current = setInterval(() => {
        autoSaveLatest(
          messages,
          aiModel || 'llama3',
          aiProvider,
          attachedFiles,
          { temperature, maxTokens, topP },
          systemPrompt,
          aiMode,
          {
            showSystemPrompt,
            showUserPrompt,
            showSelectedFile,
            showAttachedFiles,
            showImportedFiles,
            showWorkspaceContext,
          }
        )
      }, 30000)
    }

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current)
      }
    }
  }, [messages.length, aiModel, aiProvider, attachedFiles, temperature, maxTokens, topP, systemPrompt, aiMode, showSystemPrompt, showUserPrompt, showSelectedFile, showAttachedFiles, showImportedFiles, showWorkspaceContext])

  // Prepopulate demo conversation only on first mount if history is empty
  useEffect(() => {
    if (!preloadInjectedRef.current && messages.length === 0) {
      preloadInjectedRef.current = true
      setMessages(PRELOAD_CONVERSATION)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Restore the last AI session after crash recovery prompt accepted
  useEffect(() => {
    if (!aiRecoveryPending) return

    const snapshot = getLatestSnapshot()
    if (!snapshot) {
      setAiRecoveryPending(false)
      return
    }

    restoringSnapshotRef.current = true
    setAIProvider(snapshot.data.provider as AIProvider)
    setAiModel(snapshot.data.model)
    setMessages(snapshot.data.chatHistory)
    setAttachedFiles(snapshot.data.attachedFiles)
    setTemperature(snapshot.data.parameters.temperature)
    setMaxTokens(snapshot.data.parameters.maxTokens)
    setTopP(snapshot.data.parameters.topP)
    setSystemPrompt(snapshot.data.systemPrompt)
    setAiMode(snapshot.data.mode)
    setShowSystemPrompt(snapshot.data.visibility.showSystemPrompt)
    setShowUserPrompt(snapshot.data.visibility.showUserPrompt)
    setShowSelectedFile(snapshot.data.visibility.showSelectedFile)
    setShowAttachedFiles(snapshot.data.visibility.showAttachedFiles)
    setShowImportedFiles(snapshot.data.visibility.showImportedFiles)
    setShowWorkspaceContext(snapshot.data.visibility.showWorkspaceContext)
    setAiRecoveryPending(false)
    clearLatestSnapshot()
    addNotification('Recovered last AI session after crash.', 'success')
    addTimelineEvent({
      type: 'recovery_restore',
      description: 'Recovered last AI session after crash.',
    })

    requestAnimationFrame(() => {
      restoringSnapshotRef.current = false
    })
  }, [aiRecoveryPending, setAIProvider, setAiModel, setMessages, setAttachedFiles, setTemperature, setMaxTokens, setTopP, setSystemPrompt, setAiMode, setShowSystemPrompt, setShowUserPrompt, setShowSelectedFile, setShowAttachedFiles, setShowImportedFiles, setShowWorkspaceContext, setAiRecoveryPending, addNotification, addTimelineEvent])

  // Load the active model session when switching models/providers
  useEffect(() => {
    if (restoringSnapshotRef.current) {
      return
    }
    const session = currentSession || DEFAULT_AI_SESSION_STATE
    setMessages(session.history)
    setSystemPrompt(session.systemPrompt)
    setShowSystemPrompt(session.showSystemPrompt)
    setShowUserPrompt(session.showUserPrompt)
    setShowSelectedFile(session.showSelectedFile)
    setShowAttachedFiles(session.showAttachedFiles)
    setShowImportedFiles(session.showImportedFiles)
    setShowWorkspaceContext(session.showWorkspaceContext)
    setTemperature(session.temperature)
    setMaxTokens(session.maxTokens)
    setTopP(session.topP)
    setAttachedFiles(session.attachedFiles)
  }, [aiSessionKey, currentSession])

  useEffect(() => {
    if (previousModelRef.current && previousModelRef.current !== aiModel) {
      addTimelineEvent({
        type: 'model_switch',
        description: `Switched from ${previousModelRef.current} to ${aiModel}.`,
      })
    }
    previousModelRef.current = aiModel || ''
  }, [aiModel, addTimelineEvent])

  // Persist active session state to cache
  useEffect(() => {
    updateAiSession(aiSessionKey, {
      history: messages,
      systemPrompt,
      showSystemPrompt,
      showUserPrompt,
      showSelectedFile,
      showAttachedFiles,
      showImportedFiles,
      showWorkspaceContext,
      temperature,
      maxTokens,
      topP,
      attachedFiles,
    })
  }, [aiSessionKey, messages, systemPrompt, showSystemPrompt, showUserPrompt, showSelectedFile, showAttachedFiles, showImportedFiles, showWorkspaceContext, temperature, maxTokens, topP, attachedFiles, updateAiSession])

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

  const selectProvider = async (provId: AIProvider) => {
    const previousProvider = aiProvider
    const isProviderSwitch = previousProvider !== provId
    
    if (isProviderSwitch && messages.length > 0) {
      // Prompt user about context drift when switching providers
      const shouldReset = await confirm({
        title: 'Switch Provider',
        message: `Switching from ${previousProvider} to ${provId}\n\nDifferent providers may cause context incompatibility. Do you want to reset the session and clear hidden context?`,
        confirmText: 'Reset Session',
        cancelText: 'Keep Chat History',
      })

      if (shouldReset) {
        // Clear hidden context but preserve visible chat
        clearFileCache()
        clearAllLargeFileStatuses()
        setAttachedFiles([])
        addNotification(`Switched to ${provId}: hidden context cleared, chat preserved`, 'info')
      } else {
        addNotification(`Switched to ${provId}: keeping chat history`, 'warning')
      }
    }

    setAIProvider(provId)
    addTimelineEvent({
      type: 'model_switch',
      description: `Switched AI provider from ${previousProvider} to ${provId}.`,
    })
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
      let addedCount = 0
      setAttachedFiles((prev) => {
        const next = [...prev]
        const slots = Math.max(0, MAX_AI_ATTACHED_FILES - next.length)
        for (const p of paths) {
          if (addedCount >= slots) break
          if (!next.includes(p)) {
            next.push(p)
            addedCount += 1
          }
        }
        return next
      })
      if (addedCount > 0) {
        addNotification(`Attached ${addedCount} file(s) as context.`, 'info')
      }
      if (addedCount < paths.length) {
        addNotification(`AI supports up to ${MAX_AI_ATTACHED_FILES} attached files. Extra files were ignored.`, 'warning')
      }
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
    const trimmedText = text.trim()
    const commandToken = trimmedText.split(/\s+/)[0].toLowerCase()

    const modeConfig = AI_MODE_CONFIG[aiMode]
    const providerToUse = modeConfig.provider === 'free-agent' ? 'free-agent' : (aiProvider || 'openrouter')
    const selectedFileImports = selectedFileContent ? extractImports(selectedFileContent) : []
    const includeSelectedFileContent = modeConfig.includeSelectedFile && showSelectedFile && selectedFilePath && selectedFileContent && FILE_COMMANDS.has(commandToken)
    const includeWorkspaceContext = modeConfig.includeWorkspaceContext && showWorkspaceContext && rootPath
    const includeImportedFiles = modeConfig.includeImportedFiles && showImportedFiles && selectedFileImports.length > 0 && includeSelectedFileContent
    const includeAttachedFiles = modeConfig.includeAttachedFiles && showAttachedFiles && attachedFiles.length > 0

    const oversizedFiles: string[] = []
    const truncatedFiles: string[] = []
    const attachedFileContexts: { path: string; content: string }[] = []

    for (const filePath of attachedFiles.slice(0, MAX_AI_ATTACHED_FILES)) {
      const stat = await window.electronAPI?.fs.stat(filePath)
      if (stat && 'size' in stat && stat.size > MAX_AI_FILE_BYTES) {
        oversizedFiles.push(filePath)
      }
      const fileResult = await window.electronAPI?.fs.readFile(filePath)
      if (fileResult && 'success' in fileResult && fileResult.success) {
        let content = fileResult.content
        const isTruncate = content.split('\n').length > MAX_AI_FILE_LINES || new Blob([content]).size > MAX_AI_FILE_BYTES
        if (isTruncate) {
          const truncated = truncateFileContent(content)
          content = truncated.content
          truncatedFiles.push(filePath)
        }
        attachedFileContexts.push({ path: filePath, content })
      }
    }

    let wantsToContinue = true
    if (attachedFiles.length > MAX_AI_ATTACHED_FILES) {
      addNotification(`AI can only include up to ${MAX_AI_ATTACHED_FILES} attached files.`, 'warning')
      wantsToContinue = false
    }
    if (oversizedFiles.length > 0 || truncatedFiles.length > 0) {
      const truncatedPaths = [...new Set([...oversizedFiles, ...truncatedFiles])]
      wantsToContinue = await confirm({
        title: 'AI file safety warning',
        message: `Some attached files exceed the safe AI limit (${MAX_AI_FILE_BYTES / 1024}KB or ${MAX_AI_FILE_LINES} lines) and will be truncated before sending. Continue?`,
        confirmText: 'Continue',
        cancelText: 'Cancel',
      })
    }
    if (!wantsToContinue) {
      setIsThinking(false)
      return
    }

    if (aiMode === 'agent' && !rootPath) {
      addNotification('Agent Mode requires an open workspace.', 'warning')
      setIsThinking(false)
      return
    }

    if ((aiMode === 'code' || aiMode === 'refactor') && !selectedFilePath) {
      addNotification(`${aiMode === 'code' ? 'Code' : 'Refactor'} Mode requires a selected file.`, 'warning')
      setIsThinking(false)
      return
    }

    const effectiveSystemPrompt = showSystemPrompt ? systemPrompt : ''
    const attachedContext: string[] = []
    if (includeAttachedFiles) {
      for (const attached of attachedFileContexts) {
        attachedContext.push(`File: ${attached.path}\nContent:\n${attached.content}`)
      }
    }

    const workspaceContext: string[] = []
    if (includeWorkspaceContext && rootPath) {
      workspaceContext.push(`Workspace root: ${rootPath}`)
      if (openTabs.length > 0) {
        workspaceContext.push(`Open editor tabs:\n${openTabs.slice(0, 8).map((tab) => `- ${tab}`).join('\n')}`)
      }
    }

    const contextLimit = 128000
    const { promptBudget, reservedOutputTokens } = calculatePromptBudget(maxTokens, contextLimit, 0.2)

    // Initialize debug info builder if debug mode is enabled
    const debugBuilder = debugMode
      ? new AiDebugInfoBuilder(
          `chat-${Date.now()}`,
          providerToUse,
          aiModel || 'llama3'
        )
      : null

    if (debugBuilder) {
      debugBuilder.setModelParams(temperature, maxTokens, topP)
      debugBuilder.setBudgetInfo(contextLimit, promptBudget, reservedOutputTokens)
      debugBuilder.startRequest()
    }

    const sections: PromptSection[] = []

    if (effectiveSystemPrompt) {
      const sysSection: PromptSection = {
        id: 'system',
        content: `System prompt:\n${effectiveSystemPrompt}`,
        preserve: true,
        allowTruncate: false,
        priority: 0,
        category: 'system'
      }
      sections.push(sysSection)
      if (debugBuilder) {
        debugBuilder.addContextSource({
          id: 'system',
          category: 'system',
          label: 'System Prompt',
          tokenCount: estimateTokens(sysSection.content),
          preserved: true,
          truncated: false
        })
      }
    }

    const userReqSection: PromptSection = {
      id: 'user-request',
      content: `User request: ${text}`,
      preserve: true,
      allowTruncate: false,
      priority: 1,
      category: 'user'
    }
    sections.push(userReqSection)
    if (debugBuilder) {
      debugBuilder.addContextSource({
        id: 'user-request',
        category: 'user',
        label: 'User Request',
        tokenCount: estimateTokens(userReqSection.content),
        preserved: true,
        truncated: false
      })
    }

    if (aiMode === 'refactor') {
      const refSection: PromptSection = {
        id: 'refactor-directive',
        content: 'Focus: transform the selected file only and preserve existing behavior where possible.',
        preserve: true,
        allowTruncate: false,
        priority: 2,
        category: 'directive'
      }
      sections.push(refSection)
      if (debugBuilder) {
        debugBuilder.addContextSource({
          id: 'refactor-directive',
          category: 'directive',
          label: 'Refactor Directive',
          tokenCount: estimateTokens(refSection.content),
          preserved: true,
          truncated: false
        })
      }
    }
    if (aiMode === 'agent') {
      const agentSection: PromptSection = {
        id: 'agent-directive',
        content: 'Focus: evaluate the project and propose actions using local tools and agent tactics.',
        preserve: true,
        allowTruncate: false,
        priority: 2,
        category: 'directive'
      }
      sections.push(agentSection)
      if (debugBuilder) {
        debugBuilder.addContextSource({
          id: 'agent-directive',
          category: 'directive',
          label: 'Agent Directive',
          tokenCount: estimateTokens(agentSection.content),
          preserved: true,
          truncated: false
        })
      }
    }

    if (includeAttachedFiles && attachedContext.length > 0) {
      const attSection: PromptSection = {
        id: 'attached-files',
        content: `Attached files:\n${attachedContext.join('\n\n')}`,
        preserve: true,
        allowTruncate: true,
        priority: 3,
        category: 'attachments'
      }
      sections.push(attSection)
      if (debugBuilder) {
        debugBuilder.addContextSource({
          id: 'attached-files',
          category: 'attachments',
          label: `Attached Files (${attachedFiles.length})`,
          tokenCount: estimateTokens(attSection.content),
          preserved: true,
          truncated: false
        })
      }
    }

    if (includeSelectedFileContent) {
      const fileSection: PromptSection = {
        id: 'selected-file',
        content: `Active file: ${selectedFilePath}\nActive line: ${selectedLineNumber || 'None'}\n\n${selectedFileContent}`,
        preserve: false,
        allowTruncate: true,
        priority: 4,
        category: 'selectedFile'
      }
      sections.push(fileSection)
      if (debugBuilder) {
        debugBuilder.addContextSource({
          id: 'selected-file',
          category: 'selectedFile',
          label: `Active File: ${selectedFilePath?.split('/').pop()}`,
          tokenCount: estimateTokens(fileSection.content),
          preserved: false,
          truncated: false
        })
      }
    }

    if (includeImportedFiles) {
      const impSection: PromptSection = {
        id: 'imported-files',
        content: `Imported references from ${selectedFilePath || 'selected file'}:\n${selectedFileImports.join('\n')}`,
        preserve: false,
        allowTruncate: true,
        priority: 5,
        category: 'importedFiles'
      }
      sections.push(impSection)
      if (debugBuilder) {
        debugBuilder.addContextSource({
          id: 'imported-files',
          category: 'importedFiles',
          label: `Imported References (${selectedFileImports.length})`,
          tokenCount: estimateTokens(impSection.content),
          preserved: false,
          truncated: false
        })
      }
    }

    if (workspaceContext.length > 0) {
      const wsSection: PromptSection = {
        id: 'workspace-context',
        content: `Workspace context:\n${workspaceContext.join('\n\n')}`,
        preserve: false,
        allowTruncate: true,
        priority: 9,
        category: 'workspace'
      }
      sections.push(wsSection)
      if (debugBuilder) {
        debugBuilder.addContextSource({
          id: 'workspace-context',
          category: 'workspace',
          label: 'Workspace Context',
          tokenCount: estimateTokens(wsSection.content),
          preserved: false,
          truncated: false
        })
      }
    }

    const promptResult = buildTokenBudgetedPrompt({
      sections,
      promptBudget,
    })
    const fullPrompt = promptResult.prompt
    const estimatedTokens = estimateTokens(fullPrompt)

    if (promptResult.truncated || (promptResult.truncationEvents?.length ?? 0) > 0) {
      addTimelineEvent({
        type: 'truncation',
        description: `AI prompt truncated: ${promptResult.truncationEvents?.join('; ') || 'Exceeded budget limit'}`,
      })
    }

    if (debugBuilder) {
      if (promptResult.truncated) {
        debugBuilder.addTruncationEvent('Prompt exceeded budget and was truncated')
      }
      promptResult.truncationEvents?.forEach(evt => debugBuilder.addTruncationEvent(evt))
      debugBuilder.setPrompt(fullPrompt, estimatedTokens)
    }

    const payload: any = {
      prompt: fullPrompt,
      model: aiModel || 'llama3',
      provider: providerToUse,
      projectPath: rootPath,
      temperature,
      maxTokens,
      topP,
    }

    if (providerToUse === 'free-agent' && selectedFilePath && selectedFileContent) {
      payload.filePath = selectedFilePath
      payload.fileContent = selectedFileContent
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

      const isError = response && (response as any).error
      const responseText = isError
        ? `AI request failed: ${(response as any).error ?? 'Unknown error'}`
        : (response as any).response ?? 'AI responded with no message.'

      if (debugBuilder) {
        const outputTokens = Math.ceil(responseText.length / 4)
        debugBuilder.endRequest(
          outputTokens,
          responseText,
          isError ? (response as any).error : undefined
        )
        const finalDebugInfo = debugBuilder.build()
        setLastDebugInfo(finalDebugInfo)
        setDebugInfo(finalDebugInfo)
        if (debugMode) {
          setShowDebugModal(true)
        }
      }

      setIsThinking(false)

      const assistantId = `ai-${Date.now()}`
      const baseAssistantMessage = {
        id: assistantId,
        role: 'assistant' as const,
        content: '',
        isStreaming: true,
        timestamp: new Date().toISOString(),
        commandChips: ['Fix Code', 'Explain', 'Optimize'],
        error: isError,
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
          isStreaming: false,
          error: isError,
        }
      ])
      updateAiSession(aiSessionKey, {
        tokenHistory: [
          ...(currentSession.tokenHistory || []),
          {
            inputTokens: estimatedTokens,
            outputTokens: Math.ceil(responseText.length / 4),
            timestamp: new Date().toISOString(),
          }
        ]
      })
      setStreamingId(null)

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error('AI chat failed:', err)
      
      if (debugBuilder) {
        debugBuilder.endRequest(0, '', errorMsg)
        const finalDebugInfo = debugBuilder.build()
        setLastDebugInfo(finalDebugInfo)
        setDebugInfo(finalDebugInfo)
        if (debugMode) {
          setShowDebugModal(true)
        }
      }
      
      setIsThinking(false)
      setMessages([
        ...updatedMessages,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant' as const,
          content: `AI request failed: ${errorMsg}`,
          timestamp: new Date().toISOString(),
          error: true,
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
  const selectedFileContent = selectedFilePath ? getFileContent(selectedFilePath) : null
  const selectedFileImports = selectedFileContent ? extractImports(selectedFileContent) : []
  const modeConfig = AI_MODE_CONFIG[aiMode]
  const previewCommandToken = inputValue.trim().split(/\s+/)[0].toLowerCase()
  const includeSelectedFilePreview = modeConfig.includeSelectedFile && showSelectedFile && selectedFilePath && selectedFileContent && FILE_COMMANDS.has(previewCommandToken)
  const includeImportedFilesPreview = modeConfig.includeImportedFiles && showImportedFiles && selectedFileImports.length > 0
  const includeWorkspaceContextPreview = modeConfig.includeWorkspaceContext && showWorkspaceContext && rootPath
  const includeAttachedFilesPreview = modeConfig.includeAttachedFiles && showAttachedFiles && attachedFiles.length > 0
  const previewPrompt = [
    showSystemPrompt && systemPrompt ? `System prompt:\n${systemPrompt}` : '',
    includeWorkspaceContextPreview ? `Workspace root: ${rootPath}${openTabs.length > 0 ? `\nOpen tabs:\n${openTabs.slice(0, 8).join('\n')}` : ''}` : '',
    includeSelectedFilePreview ? `Active file: ${selectedFilePath}` : '',
    includeImportedFilesPreview ? `Imported files:\n${selectedFileImports.join('\n')}` : '',
    showUserPrompt ? `User request: ${inputValue}` : ''
  ].filter(Boolean).join('\n\n')
  const totalTokens = estimateTokens(previewPrompt)

  function calculateTokens(text: string, files: string[]) {
    let chars = text.length
    files.forEach((f) => {
      const content = getFileContent(f)
      if (content) chars += content.length
    })
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
          filePath={selectedFilePath}
          onToolExecuted={handleToolExecution}
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

  const activeContextFiles = [selectedFilePath, ...attachedFiles].filter(Boolean) as string[]
  const errorCount = messages.filter((msg) => msg.error).length
  const errorRate = messages.length > 0 ? Math.round((errorCount / messages.length) * 100) : 0
  const truncationCount = debugInfo?.truncationEvents?.length ?? 0
  const contextSize = debugInfo ? `${debugInfo.promptTokens.toLocaleString()} / ${debugInfo.contextLimit.toLocaleString()}` : 'N/A'
  const tokenLoad = debugInfo
    ? debugInfo.totalTokens !== undefined
      ? `${debugInfo.totalTokens.toLocaleString()} tokens`
      : `${debugInfo.promptTokens.toLocaleString()} prompt tokens`
    : 'N/A'
  const responseLatency = debugInfo?.latencyMs !== undefined ? `${Math.round(debugInfo.latencyMs)} ms` : 'pending'

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
            onClick={softResetSession}
            title="Soft Reset: clear messages and temporary files"
            className="p-1 rounded-md text-[#6b7280] hover:text-orange-400 transition-all cursor-pointer hover:bg-orange-500/10"
          >
            <Trash2 size={11} />
          </button>
          <button
            onClick={hardResetSession}
            title="Hard Reset: clear everything including memory, state, and settings"
            className="p-1 rounded-md text-[#6b7280] hover:text-red-400 transition-all cursor-pointer hover:bg-red-500/10"
          >
            <AlertTriangle size={11} />
          </button>
          <button
            onClick={handleSaveSnapshot}
            title="Save Session Snapshot"
            className="p-1 rounded-md text-[#6b7280] hover:text-green-400 transition-all cursor-pointer hover:bg-green-500/10"
          >
            <Save size={11} />
          </button>
          {aiRecoveryPending && latestRecoverySnapshot && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowRecoveryMenu(!showRecoveryMenu)
                  if (!showRecoveryMenu) {
                    setShowRecoveryDetails(false)
                  }
                }}
                title="Recovery available"
                className="flex items-center gap-1 px-2 py-1 rounded-full border border-yellow-400/20 bg-yellow-500/10 text-yellow-200 text-[10px] font-semibold hover:bg-yellow-500/15 transition-all"
              >
                <AlertTriangle size={11} className="text-yellow-300" />
                Recovery available
              </button>
              {showRecoveryMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowRecoveryMenu(false)} />
                  <div className="absolute right-0 mt-1 w-72 bg-[#0d0e16] border border-white/[0.08] rounded-lg shadow-2xl py-2 z-50 text-sm">
                    <div className="px-3 pb-2 text-[10px] uppercase tracking-[0.2em] text-yellow-300 font-semibold">
                      AI recovery
                    </div>
                    <div className="px-3 space-y-1">
                      <button
                        onClick={() => {
                          handleRestoreSnapshot(latestRecoverySnapshot.id)
                          setAiRecoveryPending(false)
                          clearLatestSnapshot()
                          setShowRecoveryMenu(false)
                        }}
                        className="w-full rounded-md px-2 py-2 text-left text-[#e2e8f0] bg-white/[0.02] hover:bg-white/[0.06] transition-colors"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => {
                          clearLatestSnapshot()
                          setAiRecoveryPending(false)
                          setShowRecoveryMenu(false)
                          addNotification('AI recovery session dismissed.', 'info')
                        }}
                        className="w-full rounded-md px-2 py-2 text-left text-[#e2e8f0] bg-white/[0.02] hover:bg-white/[0.06] transition-colors"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => setShowRecoveryDetails((prev) => !prev)}
                        className="w-full rounded-md px-2 py-2 text-left text-[#e2e8f0] bg-white/[0.02] hover:bg-white/[0.06] transition-colors"
                      >
                        View Snapshot Details
                      </button>
                    </div>
                    {showRecoveryDetails && (
                      <div className="mt-2 border-t border-white/[0.08] px-3 pt-2 text-[11px] text-slate-300 space-y-2">
                        <div className="text-[#f8bd58] font-semibold">Snapshot details</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <div className="text-[#94a3b8] uppercase tracking-[0.2em]">Saved</div>
                            <div>{new Date(latestRecoverySnapshot.timestamp).toLocaleString()}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-[#94a3b8] uppercase tracking-[0.2em]">Model</div>
                            <div>{latestRecoverySnapshot.data.model}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-[#94a3b8] uppercase tracking-[0.2em]">Messages</div>
                            <div>{latestRecoverySnapshot.data.chatHistory.length}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-[#94a3b8] uppercase tracking-[0.2em]">Files</div>
                            <div>{latestRecoverySnapshot.data.attachedFiles.length}</div>
                          </div>
                        </div>
                        <div className="pt-2 border-t border-white/[0.08] text-[10px] text-slate-400">
                          Estimated tokens: <span className="text-white">{recoveryTokenEstimate}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <div className="relative">
            <button
              onClick={() => setShowSnapshotMenu(!showSnapshotMenu)}
              title={`Restore Snapshot (${savedSnapshots.length} saved)`}
              className="p-1 rounded-md hover:bg-white/[0.04] text-[#6b7280] hover:text-blue-400 transition-all cursor-pointer"
            >
              <History size={11} />
            </button>
            {showSnapshotMenu && savedSnapshots.length > 0 && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSnapshotMenu(false)} />
                <div className="absolute right-0 mt-1 w-48 bg-[#0d0e16] border border-white/[0.08] rounded-lg shadow-2xl py-1 z-50 max-h-60 overflow-y-auto">
                  {savedSnapshots.map((snap) => (
                    <div key={snap.id} className="flex items-center gap-1 px-2 py-1.5 hover:bg-white/[0.05] group">
                      <button
                        onClick={() => handleRestoreSnapshot(snap.id)}
                        className="flex-1 text-left text-[9px] text-[#cbd5e1] truncate"
                      >
                        <div className="font-semibold truncate">{snap.name}</div>
                        <div className="text-[7.5px] text-[#6b7280] truncate">
                          {new Date(snap.timestamp).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </button>
                      <button
                        onClick={() => handleDeleteSnapshot(snap.id)}
                        className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 text-[#6b7280] hover:text-red-400"
                      >
                        <Trash2 size={9} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => {
              setDebugMode(!debugMode)
              if (debugInfo && !debugMode) {
                setShowDebugModal(true)
              }
            }}
            title={debugMode ? 'Disable Debug Mode' : 'Enable Debug Mode'}
            className={`p-1 rounded-md transition-all cursor-pointer ${
              debugMode 
                ? 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30' 
                : 'text-[#6b7280] hover:bg-white/[0.04] hover:text-[#cbd5e1]'
            }`}
          >
            <Bug size={11} />
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

      {/* AI Health Diagnostics */}
      <div className="shrink-0 px-3 py-3 bg-[#090b12]/90 border-b border-white/[0.04]">
        <div className="rounded-2xl border border-white/[0.06] bg-[#09090f]/95 p-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-slate-500 font-semibold">
              <Cpu size={12} /> Context size
            </div>
            <div className="text-sm font-semibold text-white">{contextSize}</div>
            <div className="text-[10px] text-slate-400">Sources: {debugInfo?.contextSources.length ?? 0}</div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-slate-500 font-semibold">
              <FileText size={12} /> Token load
            </div>
            <div className="text-sm font-semibold text-white">{tokenLoad}</div>
            <div className="text-[10px] text-slate-400">Reserved output: {debugInfo?.reservedOutputTokens !== undefined ? debugInfo.reservedOutputTokens.toLocaleString() : '-'} tokens</div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-slate-500 font-semibold">
              <Bug size={12} /> Error rate
            </div>
            <div className="text-sm font-semibold text-white">{errorRate}%</div>
            <div className="text-[10px] text-slate-400">{errorCount} errors of {messages.length} messages</div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-slate-500 font-semibold">
              <Clock size={12} /> Latency
            </div>
            <div className="text-sm font-semibold text-white">{responseLatency}</div>
            <div className="text-[10px] text-slate-400">Model: {aiProvider}/{aiModel}</div>
          </div>

          <div className="space-y-1 sm:col-span-2 xl:col-span-2">
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-slate-500 font-semibold">
              <Layers size={12} /> Active files
            </div>
            <div className="text-sm font-semibold text-white">{activeContextFiles.length} file{activeContextFiles.length === 1 ? '' : 's'}</div>
            {activeContextFiles.length > 0 ? (
              <div className="text-[10px] text-slate-400 space-y-1">
                {activeContextFiles.slice(0, 3).map((path) => (
                  <div key={path} className="truncate">{getBaseName(path)}</div>
                ))}
                {activeContextFiles.length > 3 && (
                  <div>+{activeContextFiles.length - 3} more</div>
                )}
              </div>
            ) : (
              <div className="text-[10px] text-slate-500">No active files attached.</div>
            )}
          </div>

          <div className="space-y-1 sm:col-span-2 xl:col-span-2">
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-slate-500 font-semibold">
              <RefreshCw size={12} /> Truncation count
            </div>
            <div className="text-sm font-semibold text-white">{truncationCount}</div>
            <div className="text-[10px] text-slate-400">Recent truncations from the latest request</div>
          </div>
        </div>
      </div>

      {/* Chat Messagestimeline */}
      <div ref={messageListRef} onScroll={handleMessageListScroll} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 nexus-scrollbar-visible">
        <AnimatePresence initial={false}>
          <SessionTimeline events={timelineEvents} onUndoChange={(path) => {
            if (!path) return
            addNotification(`Undo action for ${path} is not yet implemented.`, 'info')
          }} />
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

      {/* Context Preview Panel */}
      <div className="shrink-0 px-3 py-3 bg-[#090b12]/90 border-t border-white/[0.04]">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {[
            { label: 'System Prompt', enabled: showSystemPrompt, toggle: () => setShowSystemPrompt((v) => !v) },
            { label: 'User Prompt', enabled: showUserPrompt, toggle: () => setShowUserPrompt((v) => !v) },
            { label: 'Selected File', enabled: showSelectedFile, toggle: () => setShowSelectedFile((v) => !v) },
            { label: 'Attached Files', enabled: showAttachedFiles, toggle: () => setShowAttachedFiles((v) => !v) },
            { label: 'Imported Files', enabled: showImportedFiles, toggle: () => setShowImportedFiles((v) => !v) },
            { label: 'Workspace Context', enabled: showWorkspaceContext, toggle: () => setShowWorkspaceContext((v) => !v) },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.toggle}
              className={`text-[10px] px-2 py-1 rounded-full border transition ${item.enabled ? 'bg-[#8b5cf6]/10 border-[#8b5cf6]/20 text-[#c084fc]' : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white'}`}
            >
              {item.label}: {item.enabled ? 'Enabled' : 'Disabled'}
            </button>
          ))}
        </div>

        <div className="text-[9px] text-slate-500 mb-3">Visible preview only includes enabled items. Hidden context will not be sent.</div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-white/[0.05] bg-[#04050a]/80 p-3 text-[10px] text-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-slate-100">System Prompt</div>
              <span className={`text-[9px] px-2 py-0.5 rounded-full ${showSystemPrompt ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-slate-500'}`}>{showSystemPrompt ? 'Enabled' : 'Disabled'}</span>
            </div>
            {showSystemPrompt ? (
              <p className="whitespace-pre-wrap max-h-28 overflow-y-auto text-[10px] leading-relaxed">{systemPrompt || 'No system prompt configured.'}</p>
            ) : (
              <p className="text-slate-500">System prompt is hidden from the AI request.</p>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.05] bg-[#04050a]/80 p-3 text-[10px] text-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-slate-100">User Prompt</div>
              <span className={`text-[9px] px-2 py-0.5 rounded-full ${showUserPrompt ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-slate-500'}`}>{showUserPrompt ? 'Enabled' : 'Disabled'}</span>
            </div>
            {showUserPrompt ? (
              <p className="whitespace-pre-wrap max-h-28 overflow-y-auto text-[10px] leading-relaxed">{inputValue || 'No message yet.'}</p>
            ) : (
              <p className="text-slate-500">The user prompt will be omitted from the AI request.</p>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.05] bg-[#04050a]/80 p-3 text-[10px] text-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-slate-100">Selected File</div>
              <span className={`text-[9px] px-2 py-0.5 rounded-full ${showSelectedFile ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-slate-500'}`}>{showSelectedFile ? 'Enabled' : 'Disabled'}</span>
            </div>
            {showSelectedFile ? (
              selectedFilePath ? (
                <div className="space-y-1 text-[10px] text-slate-300">
                  <p className="break-all">{selectedFilePath}</p>
                  {selectedLineNumber ? <p className="text-slate-500">Cursor line: {selectedLineNumber}</p> : null}
                </div>
              ) : (
                <p className="text-slate-500">No active file selected.</p>
              )
            ) : (
              <p className="text-slate-500">Selected file content will not be sent.</p>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.05] bg-[#04050a]/80 p-3 text-[10px] text-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-slate-100">Imported Files</div>
              <span className={`text-[9px] px-2 py-0.5 rounded-full ${showImportedFiles ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-slate-500'}`}>{showImportedFiles ? 'Enabled' : 'Disabled'}</span>
            </div>
            {showImportedFiles ? (
              selectedFileImports.length > 0 ? (
                <ul className="space-y-1 list-disc list-inside text-[10px] text-slate-300 max-h-28 overflow-y-auto">
                  {selectedFileImports.slice(0, 12).map((imp, idx) => <li key={`${imp}-${idx}`}>{imp}</li>)}
                </ul>
              ) : (
                <p className="text-slate-500">No imported files detected.</p>
              )
            ) : (
              <p className="text-slate-500">Imported dependency file context will not be sent.</p>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.05] bg-[#04050a]/80 p-3 text-[10px] text-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-slate-100">Attached Files</div>
              <span className={`text-[9px] px-2 py-0.5 rounded-full ${showAttachedFiles ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-slate-500'}`}>{showAttachedFiles ? 'Enabled' : 'Disabled'}</span>
            </div>
            {showAttachedFiles ? (
              attachedFiles.length > 0 ? (
                <ul className="space-y-1 text-[10px] text-slate-300 max-h-28 overflow-y-auto">
                  {attachedFiles.slice(0, MAX_AI_ATTACHED_FILES).map((path) => (
                    <li key={path} className="break-all">{getBaseName(path)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">No attached files.</p>
              )
            ) : (
              <p className="text-slate-500">Attached file context will not be sent.</p>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.05] bg-[#04050a]/80 p-3 text-[10px] text-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-slate-100">Workspace Context</div>
              <span className={`text-[9px] px-2 py-0.5 rounded-full ${showWorkspaceContext ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-slate-500'}`}>{showWorkspaceContext ? 'Enabled' : 'Disabled'}</span>
            </div>
            {showWorkspaceContext ? (
              rootPath ? (
                <div className="space-y-1 text-[10px] text-slate-300">
                  <p className="break-all">{rootPath}</p>
                  {openTabs.length > 0 ? (
                    <ul className="list-disc list-inside space-y-1 max-h-24 overflow-y-auto">
                      {openTabs.slice(0, 5).map((tab) => <li key={tab}>{tab}</li>)}
                    </ul>
                  ) : (
                    <p className="text-slate-500">No open tabs.</p>
                  )}
                </div>
              ) : (
                <p className="text-slate-500">No workspace open.</p>
              )
            ) : (
              <p className="text-slate-500">Workspace context will not be sent.</p>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.05] bg-[#04050a]/80 p-3 text-[10px] text-slate-200">
            <div className="font-semibold text-slate-100 mb-2">Estimated Tokens</div>
            <p className="text-slate-300 text-[12px] font-semibold">{totalTokens}</p>
          </div>
        </div>
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

      {/* Debug Modal */}
      <AiDebugModal 
        isOpen={showDebugModal} 
        debugInfo={debugInfo} 
        onClose={() => setShowDebugModal(false)} 
      />
    </div>
  )
}
