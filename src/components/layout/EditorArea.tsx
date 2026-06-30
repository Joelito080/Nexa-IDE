import { motion } from 'framer-motion'
import Editor from '@monaco-editor/react'
import {
  FolderOpen, FilePlus, GitBranch, Terminal as TerminalIcon,
  Zap, Code2, Bot, Sparkles, ArrowRight, Command,
  Cpu, Layers, X, FileText, Bug, Wand2, Loader2, AlertTriangle,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useAppModal } from '../ui/ModalDialog'
import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import SettingsEditor from '../ui/SettingsEditor'
import { syncOpenFilesToEngine } from '../../lib/workspaceBridge'
import { loadGitStatus } from '../../lib/gitUtils'
import {
  isLargeFilePath,
} from '../../lib/fileCache'
import {
  openFile as openFileFs,
  saveFile as saveFileFs,
  closeFile as closeFileFs,
  updateFileContentDebounced,
  flushPendingChanges,
  saveAllDirtyFiles,
  invalidateDirCache,
} from '../../lib/fileSystem'
import LargeFileViewer from './LargeFileViewer'
import FileDiffViewer from '../git/FileDiffViewer'
import {
  getRecentProjects,
  togglePinProject,
  removeRecentProject,
  addRecentProject,
  RecentProject,
} from '../../lib/recentProjects'

const parseGitDiffUrl = (url: string) => {
  const parts = url.slice('gitdiff://'.length).split('/')
  const commitHash = parts[0]
  const filePath = parts.slice(1).join('/')
  return { commitHash, filePath }
}

// â”€â”€ Hero Hexagon Logo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function HeroLogo() {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="hero-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"    stopColor="#c4b5fd" />
          <stop offset="40%"   stopColor="#818cf8" />
          <stop offset="100%"  stopColor="#60a5fa" />
        </linearGradient>
        <filter id="hero-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="inner-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.3)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      {/* Outer hexagon */}
      <polygon
        points="50,3 95,26.5 95,73.5 50,97 5,73.5 5,26.5"
        fill="url(#hero-grad)"
        filter="url(#hero-glow)"
      />

      {/* Inner ring */}
      <polygon
        points="50,14 84,33 84,67 50,86 16,67 16,33"
        fill="none"
        stroke="url(#inner-grad)"
        strokeWidth="1.5"
      />

      {/* Second inner ring */}
      <polygon
        points="50,22 78,39 78,61 50,78 22,61 22,39"
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />

      {/* N letter */}
      <text
        x="50" y="65"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight="800"
        fontSize="42"
        fill="white"
        letterSpacing="-3"
      >
        N
      </text>
    </svg>
  )
}

// â”€â”€ Quick Action Row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface QuickAction {
  icon: React.ReactNode
  label: string
  shortcut: string
  color: string
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: <FolderOpen size={15} />, label: 'Open Folder',        shortcut: 'Ctrl+K O',  color: '#a78bfa' },
  { icon: <FilePlus size={15} />,   label: 'New File',           shortcut: 'Ctrl+N',    color: '#60a5fa' },
  { icon: <GitBranch size={15} />,  label: 'Clone Repository',   shortcut: '',          color: '#4ade80' },
  { icon: <Sparkles size={15} />,   label: 'Create Project',      shortcut: '',          color: '#8b5cf6' },
  { icon: <TerminalIcon size={15}/>, label: 'Open Terminal',     shortcut: 'Ctrl+`',    color: '#fbbf24' },
]

// â”€â”€ Feature Badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface Feature {
  icon: React.ReactNode
  title: string
  desc: string
}

const FEATURES: Feature[] = [
  { icon: <Bot size={15} />,     title: 'AI-First',     desc: 'NEXUS Â· OpenRouter' },
  { icon: <Code2 size={15} />,   title: 'Monaco',       desc: 'VS Code engine'          },
  { icon: <Zap size={15} />,     title: 'Fast',         desc: 'Vite + Electron'         },
  { icon: <Cpu size={15} />,     title: '100+ Models',  desc: 'OpenRouter catalog'      },
  { icon: <Sparkles size={15}/>, title: 'Refactor',     desc: 'AI-assisted editing'     },
  { icon: <Layers size={15} />,  title: 'Multi-model',  desc: 'Switch models live'      },
]

// â”€â”€ Uncontrolled Monaco Editor â€” no controlled-prop diff during typing â”€â”€â”€â”€â”€
interface FileEditorProps {
  filePath: string | null
  language: string
  onContentChange: (content: string) => void
  setAIPanelOpen: (open: boolean) => void
  setPendingAiPrompt: (prompt: string | null) => void
  /** Parent writes a ref; child fills it with the fixAll implementation after mount */
  fixAllCallbackRef: React.MutableRefObject<(() => void) | null>
}

const FileEditor = memo(function FileEditor({
  filePath, language, onContentChange, setAIPanelOpen, setPendingAiPrompt, fixAllCallbackRef,
}: FileEditorProps) {
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<any>(null)

  const [content, setContent] = useState<string>('')
  const [isLoading, setIsLoading] = useState(!!filePath)
  const [hasError, setHasError] = useState(false)

  const selectedLineNumber = useAppStore((s) => s.selectedLineNumber)
  const setSelectedLineNumber = useAppStore((s) => s.setSelectedLineNumber)

  const editorTheme = useAppStore((s) => s.editorTheme)
  const editorFontSize = useAppStore((s) => s.editorFontSize)
  const editorTabSize = useAppStore((s) => s.editorTabSize)
  const editorWordWrap = useAppStore((s) => s.editorWordWrap)
  const editorMinimap = useAppStore((s) => s.editorMinimap)

  const options = useMemo(() => ({
    minimap: { enabled: editorMinimap === 'on' },
    fontSize: editorFontSize,
    tabSize: editorTabSize,
    wordWrap: editorWordWrap as 'on' | 'off',
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Courier New', monospace",
    lineHeight: 1.6,
    automaticLayout: true,
    contextmenu: true,
    renderLineHighlight: 'none' as const,
    scrollBeyondLastLine: false,
    glyphMargin: true,
  }), [editorFontSize, editorTabSize, editorWordWrap, editorMinimap])

  const jumpToLine = useCallback((line: number) => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    const model = editor.getModel()
    if (!model) return
    const lineCount = model.getLineCount()
    const targetLine = Math.max(1, Math.min(line, lineCount))

    editor.revealLineInCenter(targetLine)
    editor.setPosition({ lineNumber: targetLine, column: 1 })
    editor.focus()

    const range = new monaco.Range(targetLine, 1, targetLine, 1)
    const newDecorations = [{
      range: range,
      options: {
        isWholeLine: true,
        className: 'search-match-highlight'
      }
    }]
    const decs = editor.deltaDecorations([], newDecorations)
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.deltaDecorations(decs, [])
      }
    }, 2000)

    setSelectedLineNumber(null)
  }, [setSelectedLineNumber])



  const handleMount = useCallback((editor: monacoEditor.IStandaloneCodeEditor, monaco: any) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Provide a fixAll implementation to the parent via the ref
    fixAllCallbackRef.current = () => {
      const model = editor.getModel()
      if (!model) return
      const markers = monaco.editor.getModelMarkers({ resource: model.uri })
        .filter((m: any) => m.severity >= 8)
      if (markers.length > 0) {
        setAIPanelOpen(true)
        setPendingAiPrompt(
          `Fix all errors in ${filePath}:\n\n` +
          markers.map((m: any, i: number) => `${i + 1}. ${m.message} at line ${m.startLineNumber}`).join('\n')
        )
      }
    }

    // Check for pending selected line number on mount
    const pendingLine = useAppStore.getState().selectedLineNumber
    if (pendingLine !== null) {
      setTimeout(() => {
        const model = editor.getModel()
        if (model) {
          const lineCount = model.getLineCount()
          const targetLine = Math.max(1, Math.min(pendingLine, lineCount))
          editor.revealLineInCenter(targetLine)
          editor.setPosition({ lineNumber: targetLine, column: 1 })
          editor.focus()

          const range = new monaco.Range(targetLine, 1, targetLine, 1)
          const newDecorations = [{
            range: range,
            options: {
              isWholeLine: true,
              className: 'search-match-highlight'
            }
          }]
          const decs = editor.deltaDecorations([], newDecorations)
          setTimeout(() => {
            if (editorRef.current) {
              editorRef.current.deltaDecorations(decs, [])
            }
          }, 2000)
          useAppStore.getState().setSelectedLineNumber(null)
        }
      }, 50)
    }
  }, [filePath, fixAllCallbackRef, setAIPanelOpen, setPendingAiPrompt])

  // â”€â”€ Diagnostics and Autofix Gutter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor.getModel()
    if (!model) return

    let decorations: string[] = []

    const updateDecorations = () => {
      const markers = monaco.editor.getModelMarkers({ resource: model.uri })
        .filter((m: any) => m.severity >= 8) // MarkerSeverity.Error

      const newDecorations = markers.map((m: any) => ({
        range: new monaco.Range(m.startLineNumber, 1, m.startLineNumber, 1),
        options: {
          isWholeLine: true,
          glyphMarginClassName: 'autofix-gutter-icon',
          glyphMarginHoverMessage: { value: 'âš¡ Click to fix with AI' }
        }
      }))

      decorations = editor.deltaDecorations(decorations, newDecorations)
    }

    const markerDisposable = monaco.editor.onDidChangeMarkers((uris: any[]) => {
      if (uris.some(uri => uri.toString() === model.uri.toString())) {
        updateDecorations()
      }
    })

    const mouseDownDisposable = editor.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const line = e.target.position!.lineNumber
        const markers = monaco.editor.getModelMarkers({ resource: model.uri })
          .filter((m: any) => m.severity >= 8 && m.startLineNumber === line)

        if (markers.length > 0) {
          const marker = markers[0]
          const codeBlock = model.getLineContent(line)
          setAIPanelOpen(true)
          setPendingAiPrompt(`Fix the following error in ${filePath} at line ${line}:\n\nError: ${marker.message}\n\nCode:\n${codeBlock}`)
        }
      }
    })

    updateDecorations()

    return () => {
      markerDisposable.dispose()
      mouseDownDisposable.dispose()
      editor.deltaDecorations(decorations, [])
    }
  }, [filePath, setAIPanelOpen, setPendingAiPrompt])

  const handleChange = useCallback((value: string | undefined) => {
    onContentChange(value ?? '')
  }, [onContentChange])

  // Restore and track cursor position (Crash Recovery)
  useEffect(() => {
    if (!filePath || !editorRef.current) return
    const editor = editorRef.current

    // Restore last position
    const savedPos = useAppStore.getState().cursorPositions[filePath]
    if (savedPos) {
      setTimeout(() => {
        if (editorRef.current && editorRef.current.getModel()) {
          editorRef.current.setPosition({ lineNumber: savedPos.line, column: savedPos.column })
          editorRef.current.revealPositionInCenter({ lineNumber: savedPos.line, column: savedPos.column })
        }
      }, 50)
    }

    // Listen for changes
    const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
      const pos = e.position
      useAppStore.getState().updateCursorPosition(filePath, pos.lineNumber, pos.column)
    })

    return () => {
      cursorDisposable.dispose()
    }
  }, [filePath])

  // Scroll and highlight on changes to selectedLineNumber state
  useEffect(() => {
    if (selectedLineNumber !== null && editorRef.current) {
      jumpToLine(selectedLineNumber)
    }
  }, [selectedLineNumber, jumpToLine])

  useEffect(() => {
    let active = true
    if (filePath) {
      setIsLoading(true)
      setHasError(false)
      const load = async () => {
        try {
          const res = await openFileFs(filePath)
          if (!active) return
          setContent(res)
        } catch (err) {
          if (!active) return
          console.error("Failed loading file:", err)
          setHasError(true)
          setContent("// Failed to load file")
        } finally {
          if (active) setIsLoading(false)
        }
      }
      load()
    }
    return () => {
      active = false
    }
  }, [filePath])

  return (
    <div className="relative w-full h-full bg-[#08090e]">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#08090e]/80 backdrop-blur-sm">
          <Loader2 className="w-6 h-6 text-purple-500 animate-spin mb-2" />
          <span className="text-xs text-slate-400 font-medium">Loading file content...</span>
        </div>
      )}
      {hasError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#08090e] p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-rose-500 mb-2" />
          <h4 className="text-sm font-bold text-white mb-1">Failed to load file</h4>
          <p className="text-xs text-slate-400 mb-4 truncate max-w-xs">{filePath}</p>
          <button 
            onClick={() => {
              setContent('')
              setIsLoading(true)
              setHasError(false)
              if (filePath) {
                openFileFs(filePath).then((res) => {
                  setContent(res)
                }).catch(() => setHasError(true)).finally(() => setIsLoading(false))
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs font-semibold transition-all cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}
      {!isLoading && !hasError && (
        <Editor
          key={filePath || 'empty'}
          height="100%"
          defaultLanguage={language}
          language={language}
          path={filePath || undefined}
          value={content}
          onChange={handleChange}
          onMount={handleMount}
          theme={editorTheme}
          options={options}
        />
      )}
    </div>
  )
})

// â”€â”€ Editor Area â€” Welcome Screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const EditorArea = memo(function EditorArea() {
  // State selectors â€” fine-grained to prevent cascading re-renders
  const rootPath = useAppStore((s) => s.rootPath)
  const selectedFilePath = useAppStore((s) => s.selectedFilePath)
  const openTabs = useAppStore((s) => s.openTabs)
  const firstRunComplete = useAppStore((s) => s.firstRunComplete)
  const unsavedChanges = useAppStore((s) => s.unsavedChanges)
  const editorWordWrap = useAppStore((s) => s.editorWordWrap)
  const editorMinimap = useAppStore((s) => s.editorMinimap)
  const setRootPath = useAppStore((s) => s.setRootPath)
  const setCurrentFolder = useAppStore((s) => s.setCurrentFolder)
  const setExplorerEntries = useAppStore((s) => s.setExplorerEntries)
  // Action selectors â€” Zustand action functions are stable references (same
  // identity across every render), so these are safe in useEffect dependency
  // arrays and do NOT cause hooks-count instability between render branches.
  // Using useAppStore.getState() inside useCallback was the root cause of the
  // "Rendered more hooks than during the previous render" crash.
  const setSelectedFilePath = useAppStore((s) => s.setSelectedFilePath)
  const setBottomPanelOpen  = useAppStore((s) => s.setBottomPanelOpen)
  const setAIPanelOpen      = useAppStore((s) => s.setAIPanelOpen)
  const setPendingAiPrompt  = useAppStore((s) => s.setPendingAiPrompt)
  const requestTerminalFocus = useAppStore((s) => s.requestTerminalFocus)
  const setFirstRunComplete = useAppStore((s) => s.setFirstRunComplete)
  const setOpenTabs         = useAppStore((s) => s.setOpenTabs)
  const addNotification     = useAppStore((s) => s.addNotification)
  const { prompt, confirm } = useAppModal()
  const [isSaving, setIsSaving] = useState(false)

  // Split-view editor states
  const [isSplit, setIsSplit] = useState(false)
  const [activePane, setActivePane] = useState<'left' | 'right'>('left')
  const [leftFilePath, setLeftFilePath] = useState<string | null>(null)
  const [rightFilePath, setRightFilePath] = useState<string | null>(null)

  // Sync leftFilePath with store's selectedFilePath
  useEffect(() => {
    if (selectedFilePath) {
      if (!isSplit) {
        setLeftFilePath(selectedFilePath)
      } else {
        if (activePane === 'left') {
          setLeftFilePath(selectedFilePath)
        } else {
          // If activePane is right, we intercept the clicked file path
          // and load it in the right pane, then restore selectedFilePath
          // to leftFilePath so that the left pane editor remains stable.
          if (selectedFilePath !== leftFilePath) {
            setRightFilePath(selectedFilePath)
            if (leftFilePath) {
              setSelectedFilePath(leftFilePath)
            }
          }
        }
      }
    } else {
      setLeftFilePath(null)
    }
  }, [selectedFilePath, isSplit, activePane, leftFilePath, setSelectedFilePath])

  // Clear right pane if file is closed
  useEffect(() => {
    if (isSplit && rightFilePath && !openTabs.includes(rightFilePath)) {
      setRightFilePath(null)
    }
  }, [openTabs, isSplit, rightFilePath])

  // Recent projects state and handlers
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])

  useEffect(() => {
    const list = getRecentProjects()
    setRecentProjects(list)
    if (window.electronAPI?.app.allowPath) {
      list.forEach((p) => window.electronAPI?.app.allowPath(p.path))
    }
  }, [rootPath])

  const getGlobalLoadDirectory = () => {
    return (window as any).loadDirectory || loadDirectory
  }

  const handleOpenRecentProject = async (projectPath: string) => {
    const api = window.electronAPI
    if (!api) return
    const stat = await api.fs.stat(projectPath)
    if (stat && !('error' in stat) && stat.isDirectory) {
      await getGlobalLoadDirectory()(projectPath)
    } else {
      const remove = await confirm({
        title: 'Project folder not found',
        message: `The folder "${projectPath}" could not be opened. It may have been moved or deleted. Remove it from your recent projects list?`,
        confirmText: 'Remove',
        cancelText: 'Keep',
      })
      if (remove) {
        const updated = removeRecentProject(projectPath)
        setRecentProjects(updated)
      }
    }
  }

  const handleTogglePin = (projectPath: string) => {
    const updated = togglePinProject(projectPath)
    setRecentProjects(updated)
  }

  const handleRemoveRecent = (projectPath: string) => {
    const updated = removeRecentProject(projectPath)
    setRecentProjects(updated)
  }

  // Separate fix-all callback refs for left and right panes â€” a single shared ref
  // caused a race condition in split-view where the right pane's mount would clobber
  // the left pane's callback.
  const fixAllCallbackRef      = useRef<(() => void) | null>(null)
  const fixAllCallbackRefRight = useRef<(() => void) | null>(null)

  // Ref to track the previous selected file for flushing changes on tab switch
  const prevFilePathRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevFilePathRef.current && prevFilePathRef.current !== selectedFilePath) {
      const path = prevFilePathRef.current
      if (!path.startsWith('nexus://') && !path.startsWith('gitdiff://')) {
        flushPendingChanges(path)
        saveFileFs(path).catch((err) => {
          console.error('[Autosave] Failed to save on tab switch:', path, err)
        })
      }
    }
    prevFilePathRef.current = selectedFilePath
  }, [selectedFilePath])
  // Sync open files to workspace engine and clean up closed tab Monaco models to prevent leaks
  useEffect(() => {
    syncOpenFilesToEngine()

    const monaco = (window as any).monaco
    if (monaco) {
      try {
        const openTabsSet = new Set(openTabs.map((t) => monaco.Uri.file(t).toString()))
        const models = monaco.editor.getModels()
        for (const model of models) {
          const uriStr = model.uri.toString()
          if (model.uri.scheme === 'file' && !openTabsSet.has(uriStr)) {
            model.dispose()
            console.log(`[MemoryAudit] Disposed closed tab Monaco model: ${uriStr}`)
          }
        }
      } catch (err) {
        console.error('[MemoryAudit] Failed to prune Monaco models:', err)
      }
    }
  }, [openTabs])


  const handleContentChange = useCallback((content: string) => {
    if (selectedFilePath) {
      updateFileContentDebounced(selectedFilePath, content)
    }
  }, [selectedFilePath])

  const getPathSeparator = (value: string) => (value.includes('\\') ? '\\' : '/')
  const ensureTrailingSeparator = (value: string) => {
    const sep = getPathSeparator(value)
    return value.endsWith(sep) ? value : `${value}${sep}`
  }

  const loadDirectory = async (folderPath: string) => {
    // Set root on main process BEFORE any fs call â€” same fix as AppShell.loadDirectory
    if (window.electronAPI?.app?.allowPath) {
      window.electronAPI.app.allowPath(folderPath)
    }
    await window.electronAPI?.workspace.setRoot(folderPath)

    const response = await window.electronAPI?.fs.readDir(folderPath)
    if (!response || (response as any).error) {
      addNotification(`Unable to read folder: ${(response as any).error ?? 'Unknown error'}`, 'error')
      await window.electronAPI?.workspace.setRoot(null).catch(() => {})
      return
    }

    const entries = (response as any[]).map((entry) => ({
      name: entry.name,
      path: `${ensureTrailingSeparator(folderPath)}${entry.name}`,
      isDirectory: entry.isDirectory,
      isFile: entry.isFile,
    }))

    setRootPath(folderPath)
    setCurrentFolder(folderPath)
    setExplorerEntries(entries)
    setSelectedFilePath(null)

    addRecentProject(folderPath)
    await loadGitStatus(folderPath)
  }

  const openFolder = async () => {
    const folderPath = await window.electronAPI?.dialog.openFolder()
    if (folderPath) {
      await getGlobalLoadDirectory()(folderPath)
    }
  }

  const createFile = async () => {
    const filePath = await window.electronAPI?.dialog.createFile()
    if (filePath) {
      const dir = filePath.replace(/[/\\][^/\\]+$/, '')
      if (rootPath) {
        invalidateDirCache(dir)
      } else {
        await getGlobalLoadDirectory()(dir)
      }
      try {
        await openFileFs(filePath)
      } catch (err) {
        addNotification(`Unable to open created file: ${err instanceof Error ? err.message : String(err)}`, 'error')
      }
    }
  }

  const cloneRepository = async () => {
    const repoUrl = (await prompt({
      title: 'Repository URL',
      message: 'Enter the repository URL you want to clone.',
      placeholder: 'https://github.com/owner/repo.git',
      confirmText: 'Clone',
      cancelText: 'Cancel',
    }))?.trim()
    if (!repoUrl) return
    const response = await window.electronAPI?.project.clone(repoUrl)
    if (response && !(response as any).error && (response as any).path) {
      addNotification(`Repository cloned to ${(response as any).path}`, 'success')
      await getGlobalLoadDirectory()((response as any).path)
    } else {
      addNotification(`Clone failed: ${(response as any).error ?? 'Unknown error'}`, 'error')
    }
  }

  const createProject = async () => {
    const projectFolder = await window.electronAPI?.project.new()
    if (!projectFolder || (projectFolder as any).error || (projectFolder as any).canceled) return
    const root = (projectFolder as any).path
    const descriptionRaw = await prompt({
      title: 'Describe the project',
      message: 'Describe the project you want to create.',
      placeholder: 'A React app starter',
      defaultValue: 'A React app starter',
      confirmText: 'Next',
      cancelText: 'Cancel',
    })
    if (descriptionRaw === null) return
    const description = descriptionRaw.trim()
    if (!description) return
    const templateId = String((await window.electronAPI?.project.findTemplate(description)) || 'react')
    const suggestedName = description.split(/\s+/).slice(0, 3).join('-') || templateId
    const projectNameRaw = await prompt({
      title: 'Project name',
      message: 'Enter a name for the project.',
      placeholder: suggestedName,
      defaultValue: suggestedName,
      confirmText: 'Create',
      cancelText: 'Cancel',
    })
    if (projectNameRaw === null) return
    const projectName = projectNameRaw.trim() || suggestedName
    const created = await window.electronAPI?.project.create(root, templateId, projectName)
    if (!created || (created as any).error) {
      addNotification(`Project creation failed: ${(created as any).error ?? 'Unknown error'}`, 'error')
      return
    }
    const projectPath = (created as any).path
    addNotification(`Project created at ${projectPath}`, 'success')
    await getGlobalLoadDirectory()(projectPath)
    const installDependencies = await confirm({
      title: 'Install dependencies?',
      message: 'Install dependencies for this project now?',
      confirmText: 'Install',
      cancelText: 'Later',
    })
    if (installDependencies) {
      const installResult = await window.electronAPI?.project.installDependencies(projectPath)
      if (installResult && !(installResult as any).error) {
        addNotification((installResult as any).message ?? 'Dependencies installed successfully.', 'success')
      } else {
        addNotification(`Dependency install failed: ${(installResult as any).error ?? 'Unknown error'}`, 'error')
      }
    }
  }

  const saveFile = async () => {
    const fileToSave = (isSplit && activePane === 'right') ? rightFilePath : selectedFilePath
    if (!fileToSave) return
    setIsSaving(true)
    try {
      await saveFileFs(fileToSave)
      addNotification('File saved successfully.', 'success')
    } catch (err) {
      addNotification(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const openFile = async (filePath: string) => {
    try {
      await openFileFs(filePath)
    } catch (err) {
      addNotification(`Error opening file: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }


  const closeTab = useCallback(async (filePath: string) => {
    // If this tab has unsaved changes (purple dot), prompt before discarding
    const hasUnsaved = useAppStore.getState().unsavedChanges[filePath] !== undefined
    if (hasUnsaved) {
      const save = await confirm({
        title: 'Unsaved changes',
        message: `"${filePath.split(/[/\\]/).pop()}" has unsaved changes. Save before closing?`,
        confirmText: 'Save',
        cancelText: 'Discard',
      })
      if (save) {
        // Attempt save first; abort close if save fails
        try {
          await saveFileFs(filePath)
        } catch (err) {
          addNotification(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
          return
        }
      }
    }
    closeFileFs(filePath)
  }, [confirm, addNotification])


  const getFileLanguage = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase()
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      h: 'c',
      hpp: 'cpp',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      xml: 'xml',
      html: 'html',
      css: 'css',
      scss: 'scss',
      md: 'markdown',
      txt: 'plaintext',
    }
    return langMap[ext ?? ''] ?? 'plaintext'
  }

  if (selectedFilePath) {
    return (
      <div className="relative flex flex-col h-full overflow-hidden" style={{ background: '#08090e' }}>

        <div className="relative z-10 flex flex-col h-full">
          {/* File tabs */}
          <div className="flex items-center justify-between border-b border-white/10 bg-[#0a0b10]/50">
            <div className="flex items-center overflow-x-auto flex-1">
              {openTabs.map((tabPath) => (
                <div
                  key={tabPath}
                  onClick={() => openFile(tabPath)}
                  className={`flex items-center gap-2 px-4 py-3 border-r border-white/5 cursor-pointer transition ${
                    selectedFilePath === tabPath
                      ? 'bg-[#1a1b25] text-white border-b-2 border-[#8b5cf6]'
                      : 'bg-transparent text-[#94a3b8] hover:bg-white/5'
                  }`}
                >
                  <Code2 size={14} />
                  <span className="text-sm whitespace-nowrap max-w-[200px] truncate">
                    {tabPath === 'nexus://settings' 
                      ? 'Settings' 
                      : tabPath.startsWith('gitdiff://')
                        ? `Diff: ${tabPath.split('/').pop()} (${tabPath.slice('gitdiff://'.length).split('/')[0].slice(0, 7)})`
                        : tabPath.split(/[/\\]/).pop()}
                  </span>
                  <div className="flex items-center gap-1">
                    {unsavedChanges[tabPath] !== undefined && (
                      <div 
                        className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0 ml-1.5 animate-pulse" 
                        title="Unsaved changes"
                      />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        closeTab(tabPath)
                      }}
                      className="ml-1 hover:text-white transition p-0.5 rounded hover:bg-white/5"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Editor Actions */}
            <div className="flex items-center gap-1.5 px-4 shrink-0 border-l border-white/10 h-full py-1">
              <button
                type="button"
                onClick={() => {
                  if (isSplit) {
                    setIsSplit(false)
                    setRightFilePath(null)
                    setActivePane('left')
                  } else {
                    setIsSplit(true)
                    setActivePane('right')
                    const otherTabs = openTabs.filter(t => t !== leftFilePath && t !== 'nexus://settings')
                    setRightFilePath(otherTabs[0] || leftFilePath)
                  }
                }}
                className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs font-semibold flex items-center gap-1.5 border border-transparent ${isSplit ? 'text-purple-400 bg-purple-500/10 border-purple-500/20' : ''}`}
                title={isSplit ? "Merge Editors" : "Split Editor"}
              >
                <Layers size={13} />
                <span>{isSplit ? "Unsplit" : "Split"}</span>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  const currentWordWrap = useAppStore.getState().editorWordWrap
                  useAppStore.getState().setEditorWordWrap(currentWordWrap === 'on' ? 'off' : 'on')
                }}
                className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs font-semibold flex items-center gap-1.5 border border-transparent ${editorWordWrap === 'on' ? 'text-purple-400 bg-purple-500/10 border-purple-500/20' : ''}`}
                title="Toggle Word Wrap"
              >
                <Code2 size={13} />
                <span>Wrap</span>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  const currentMinimap = useAppStore.getState().editorMinimap
                  useAppStore.getState().setEditorMinimap(currentMinimap === 'on' ? 'off' : 'on')
                }}
                className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs font-semibold flex items-center gap-1.5 border border-transparent ${editorMinimap === 'on' ? 'text-purple-400 bg-purple-500/10 border-purple-500/20' : ''}`}
                title="Toggle Minimap"
              >
                <Sparkles size={13} />
                <span>Minimap</span>
              </button>
            </div>
          </div>

          {/* File header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-white/10">
            <div className="flex-1">
              <p className="text-[11px] text-[#94a3b8] uppercase tracking-[0.3em]">
                {selectedFilePath === 'nexus://settings' ? 'System' : 'Editing'}
              </p>
              <p className="text-sm font-semibold text-white truncate">
                {isSplit 
                  ? `Split View: ${leftFilePath?.split(/[/\\]/).pop() || ''} | ${rightFilePath?.split(/[/\\]/).pop() || 'Empty'}`
                  : selectedFilePath === 'nexus://settings' 
                    ? 'Account Settings' 
                    : selectedFilePath}
              </p>
            </div>
            {(() => {
              const activeFile = (isSplit && activePane === 'right') ? rightFilePath : selectedFilePath
              if (activeFile && activeFile !== 'nexus://settings' && !isLargeFilePath(activeFile) && !activeFile.startsWith('gitdiff://')) {
                return (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setAIPanelOpen(true)
                        setPendingAiPrompt('Explain this code in detail, focusing on its purpose, architecture, and key patterns.')
                      }}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-150"
                      style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)', color: '#a78bfa' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.16)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.08)' }}
                      title="Explain this code"
                    >
                      <FileText size={12} /> Explain
                    </button>
                    <button
                      type="button"
                      onClick={() => fixAllCallbackRef.current?.()}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-150"
                      style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', color: '#f87171' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.16)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.08)' }}
                      title="Fix all errors in this file"
                    >
                      <Bug size={12} /> Fix All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAIPanelOpen(true)
                        setPendingAiPrompt('Refactor this code for better clarity, maintainability, and performance. Apply modern best practices.')
                      }}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-150"
                      style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)', color: '#fbbf24' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(251,191,36,0.16)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(251,191,36,0.08)' }}
                      title="Refactor this code"
                    >
                      <Wand2 size={12} /> Refactor
                    </button>
                    <div className="w-px h-5 mx-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
                    <button
                      type="button"
                      onClick={saveFile}
                      disabled={isSaving}
                      className="btn-outline text-[11px] py-2 disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )
              }
              return null
            })()}
          </div>

          {/* Main Content Area */}
          {selectedFilePath === 'nexus://settings' ? (
            <SettingsEditor />
          ) : isSplit ? (
            <div className="flex-1 flex min-h-0 divide-x divide-white/10">
              {/* Left Editor Column */}
              <div 
                className={`flex-1 flex flex-col min-w-0 transition-all ${activePane === 'left' ? 'bg-[#0f111a] border border-[#8b5cf6]/20' : 'bg-[#08090e]'}`}
                onClickCapture={() => setActivePane('left')}
              >
                <div className="flex-1 min-h-0 overflow-hidden">
                  {leftFilePath?.startsWith('gitdiff://') ? (
                    <FileDiffViewer
                      projectPath={rootPath || ''}
                      filePath={parseGitDiffUrl(leftFilePath).filePath}
                      commitHash={parseGitDiffUrl(leftFilePath).commitHash}
                    />
                  ) : leftFilePath && isLargeFilePath(leftFilePath) ? (
                    <LargeFileViewer filePath={leftFilePath} />
                  ) : (
                    <FileEditor
                      filePath={leftFilePath}
                      language={leftFilePath ? getFileLanguage(leftFilePath) : 'plaintext'}
                      onContentChange={handleContentChange}
                      setAIPanelOpen={setAIPanelOpen}
                      setPendingAiPrompt={setPendingAiPrompt}
                      fixAllCallbackRef={fixAllCallbackRef}
                    />
                  )}
                </div>
              </div>

              {/* Right Editor Column */}
              <div 
                className={`flex-1 flex flex-col min-w-0 transition-all ${activePane === 'right' ? 'bg-[#0f111a] border border-[#8b5cf6]/20' : 'bg-[#08090e]'}`}
                onClickCapture={() => setActivePane('right')}
              >
                <div className="px-4 py-1.5 bg-[#06070a] border-b border-white/5 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 truncate max-w-xs">
                    {rightFilePath ? rightFilePath.split(/[/\\]/).pop() : 'Empty Pane'}
                  </span>
                  {rightFilePath && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        setRightFilePath(null)
                      }}
                      className="text-slate-500 hover:text-white transition"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  {rightFilePath ? (
                    rightFilePath.startsWith('gitdiff://') ? (
                      <FileDiffViewer
                        projectPath={rootPath || ''}
                        filePath={parseGitDiffUrl(rightFilePath).filePath}
                        commitHash={parseGitDiffUrl(rightFilePath).commitHash}
                      />
                    ) : isLargeFilePath(rightFilePath) ? (
                      <LargeFileViewer filePath={rightFilePath} />
                    ) : (
                      <FileEditor
                        filePath={rightFilePath}
                        language={getFileLanguage(rightFilePath)}
                        onContentChange={(val) => {
                          updateFileContentDebounced(rightFilePath, val)
                        }}
                        setAIPanelOpen={setAIPanelOpen}
                        setPendingAiPrompt={setPendingAiPrompt}
                        fixAllCallbackRef={fixAllCallbackRefRight}
                      />
                    )
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-500 bg-[#08090e]">
                      No File Selected in Right Pane. Click files in sidebar or tabs to load here.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : selectedFilePath?.startsWith('gitdiff://') ? (
            <div className="flex-1 min-h-0">
              {(() => {
                const { commitHash, filePath } = parseGitDiffUrl(selectedFilePath)
                return (
                  <FileDiffViewer
                    projectPath={rootPath || ''}
                    filePath={filePath}
                    commitHash={commitHash}
                  />
                )
              })()}
            </div>
          ) : isLargeFilePath(selectedFilePath) ? (
            <div className="flex-1 min-h-0">
              <LargeFileViewer filePath={selectedFilePath} />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-hidden">
              <FileEditor
                filePath={selectedFilePath}
                language={getFileLanguage(selectedFilePath)}
                onContentChange={handleContentChange}
                setAIPanelOpen={setAIPanelOpen}
                setPendingAiPrompt={setPendingAiPrompt}
                fixAllCallbackRef={fixAllCallbackRef}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col h-full overflow-hidden" style={{ background: '#08090e' }}>

      {/* â”€â”€ Welcome Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 gap-6 px-8 py-8 overflow-y-auto w-full max-w-[900px] mx-auto">

        {/* Hero Logo + Title */}
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
          className="flex flex-col items-center gap-4"
        >
          {/* Animated floating logo */}
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
            className="relative"
          >
            <HeroLogo />
          </motion.div>

          {/* Title + subtitle */}
          <div className="text-center">
            <h1 className="text-[2.2rem] font-black tracking-tight leading-none mb-1">
              <span className="gradient-text">NEXA IDE</span>
            </h1>
            <p className="text-[12px] text-[#6b7280] tracking-[0.08em] uppercase">
              AI-First Development Environment
            </p>

            {/* AI status row */}
            <div className="flex items-center justify-center gap-2 mt-2.5">
              <div className="active-dot" />
              <span className="text-[10px] text-[#4ade80] font-semibold tracking-wide">
                NEXUS AI Â· OpenRouter Â· active
              </span>
            </div>
          </div>
        </motion.div>

        {/* Two Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full mt-4 items-start">
          
          {/* Left Column: Quick Actions */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15, duration: 0.45 }}
            className="w-full"
          >
            <p className="text-[9.5px] font-bold tracking-[0.22em] text-[#475569] uppercase mb-3 text-center md:text-left">
              Quick Start
            </p>

            <div className="space-y-2">
              {QUICK_ACTIONS.map((action, i) => (
                <motion.button
                  key={action.label}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25 + i * 0.08, duration: 0.25 }}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    if (action.label === 'Open Folder') return openFolder()
                    if (action.label === 'New File') return createFile()
                    if (action.label === 'Create Project') return createProject()
                    if (action.label === 'Open Terminal') {
                      setBottomPanelOpen(true)
                      requestTerminalFocus()
                      return
                    }
                    if (action.label === 'Clone Repository') return cloneRepository()
                  }}
                  className="group w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-150 outline-none"
                  style={{
                    background: 'rgba(13, 14, 22, 0.65)',
                    border: '1px solid rgba(139, 92, 246, 0.08)',
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(139, 92, 246, 0.3)'
                    ;(e.currentTarget as HTMLElement).style.background  = 'rgba(139, 92, 246, 0.06)'
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(139, 92, 246, 0.08)'
                    ;(e.currentTarget as HTMLElement).style.background  = 'rgba(13, 14, 22, 0.65)'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span style={{ color: action.color }}>{action.icon}</span>
                    <span className="text-[12px] text-[#94a3b8] group-hover:text-[#f1f5f9] transition-colors font-medium">
                      {action.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {action.shortcut && (
                      <span className="text-[9.5px] text-[#475569] font-mono group-hover:text-slate-400 transition-colors">
                        {action.shortcut}
                      </span>
                    )}
                    <ArrowRight
                      size={11}
                      className="text-[#475569] group-hover:text-[#8b5cf6] transition-colors"
                    />
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Right Column: Recent Projects */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15, duration: 0.45 }}
            className="w-full flex flex-col"
          >
            <p className="text-[9.5px] font-bold tracking-[0.22em] text-[#475569] uppercase mb-3 text-center md:text-left">
              Recent Projects
            </p>

            {recentProjects.length === 0 ? (
              <div 
                className="flex flex-col items-center justify-center rounded-xl p-8 text-center text-[#475569] text-xs h-[230px]"
                style={{
                  background: 'rgba(13, 14, 22, 0.45)',
                  border: '1px dashed rgba(139, 92, 246, 0.08)',
                }}
              >
                <FolderOpen size={24} className="opacity-20 mb-2.5 text-purple-400" />
                <span>No recent projects opened.</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-[230px] overflow-y-auto pr-1">
                {recentProjects.map((project, i) => (
                  <motion.div
                    key={project.path}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25 + i * 0.05, duration: 0.25 }}
                    className="group flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all duration-150 border cursor-pointer"
                    style={{
                      background: 'rgba(13, 14, 22, 0.65)',
                      borderColor: 'rgba(139, 92, 246, 0.08)',
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(139, 92, 246, 0.3)'
                      ;(e.currentTarget as HTMLElement).style.background  = 'rgba(139, 92, 246, 0.06)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(139, 92, 246, 0.08)'
                      ;(e.currentTarget as HTMLElement).style.background  = 'rgba(13, 14, 22, 0.65)'
                    }}
                    onClick={() => handleOpenRecentProject(project.path)}
                  >
                    <div className="flex flex-col min-w-0 flex-1 mr-3">
                      <span className="text-[12px] font-bold text-slate-200 group-hover:text-white truncate">
                        {project.name}
                      </span>
                      <span className="text-[10px] text-slate-500 truncate" title={project.path}>
                        {project.path}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleTogglePin(project.path)}
                        className={`p-1 rounded hover:bg-white/5 transition-colors ${project.pinned ? 'text-[#a78bfa]' : 'text-[#475569] hover:text-[#94a3b8]'}`}
                        title={project.pinned ? 'Unpin Project' : 'Pin Project'}
                      >
                        <Zap size={12} fill={project.pinned ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => handleRemoveRecent(project.path)}
                        className="p-1 rounded hover:bg-white/5 text-[#475569] hover:text-rose-400 transition-colors"
                        title="Remove from List"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>

        </div>

        {/* Feature Badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.45 }}
          className="flex flex-wrap justify-center gap-2 max-w-[620px] mt-2"
        >
          {FEATURES.map((feat, i) => (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 + i * 0.08, duration: 0.25 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10.5px]"
              style={{
                background: 'rgba(13, 14, 22, 0.85)',
                border: '1px solid rgba(139, 92, 246, 0.13)',
              }}
            >
              <span className="text-[#8b5cf6]">{feat.icon}</span>
              <span className="text-[#94a3b8] font-semibold">{feat.title}</span>
              <span className="text-[#3d4661]">Â·</span>
              <span className="text-[#3d4661]">{feat.desc}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Command palette hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="flex items-center gap-2 text-[10.5px] text-[#3d4661] mt-1"
        >
          <Command size={10} className="text-[#8b5cf6]/50" />
          <span>Press</span>
          <kbd
            className="px-1.5 py-0.5 rounded text-[9.5px] font-mono font-semibold"
            style={{
              background: 'rgba(139, 92, 246, 0.1)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              color: '#a78bfa',
            }}
          >
            Ctrl+Shift+P
          </kbd>
          <span>to open Command Palette</span>
        </motion.div>

      </div>
    </div>
  )
})

export default EditorArea

