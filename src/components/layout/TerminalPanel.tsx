import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal, Square, X, Brain } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'

// Error patterns to detect in terminal output
const ERROR_PATTERNS = [
  /\b(Error|TypeError|SyntaxError|ReferenceError|RangeError)\s*:/,
  /\bnpm ERR!/i,
  /\bfailed\b.*\berror\b/i,
  /\bexited with code [^0\s]/i,
  /ENOENT|EACCES|EADDRINUSE/,
  /\bModuleNotFoundError\b/,
  /\bTraceback \(most recent call last\)/,
  /\bpanic:/,
]

// Strip ANSI escape codes from terminal output for error matching
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
}

export default function TerminalPanel({ onClose }: { onClose: () => void }) {
  const rootPath = useAppStore((s) => s.rootPath)
  const currentFolder = useAppStore((s) => s.currentFolder)
  const terminalFocusRequest = useAppStore((s) => s.terminalFocusRequest)
  const setPendingAiPrompt = useAppStore((s) => s.setPendingAiPrompt)
  const setAIPanelOpen = useAppStore((s) => s.setAIPanelOpen)

  const [isRunning, setIsRunning] = useState(false)
  const [shellInfo, setShellInfo] = useState('')
  const [lastError, setLastError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const pendingOutputRef = useRef('')
  const rafIdRef = useRef<number | null>(null)
  // Rolling plain-text error context buffer (last 4 KB)
  const errorBufferRef = useRef('')

  const cwd = currentFolder || rootPath || ''

  const checkForErrors = useCallback((plain: string) => {
    errorBufferRef.current = (errorBufferRef.current + plain).slice(-4096)
    const buf = errorBufferRef.current
    for (const pat of ERROR_PATTERNS) {
      if (pat.test(buf)) {
        setLastError(buf.slice(-2000).trim())
        return
      }
    }
  }, [])

  const initSession = useCallback(async () => {
    if (!cwd || !window.electronAPI?.terminal || !xtermRef.current) return

    if (sessionIdRef.current) {
      await window.electronAPI.terminal.killSession(sessionIdRef.current)
      sessionIdRef.current = null
    }

    errorBufferRef.current = ''
    setLastError(null)

    const result = await window.electronAPI.terminal.create(cwd)
    if (!result || (result as any).error) {
      xtermRef.current.writeln(`\r\n\x1b[31mFailed to start terminal: ${(result as any)?.error ?? 'Unknown error'}\x1b[0m`)
      setIsRunning(false)
      return
    }

    const { id, shell, mode } = result as { id: string; shell: string; mode: string }
    sessionIdRef.current = id
    setShellInfo(`${shell} (${mode})`)
    setIsRunning(true)
    xtermRef.current.clear()
    
    // Restore history if present (Crash Recovery)
    const restored = useAppStore.getState().terminalHistory
    if (restored) {
      xtermRef.current.write(restored)
      xtermRef.current.writeln('\r\n\x1b[90m[Session restored from crash recovery]\x1b[0m\r\n')
    } else {
      xtermRef.current.writeln(`\x1b[90mNEXUS Terminal — ${shell} [${mode}]\x1b[0m`)
      xtermRef.current.writeln(`\x1b[90mWorkspace: ${cwd}\x1b[0m\r\n`)
    }
    
    xtermRef.current.focus()

    if (fitAddonRef.current && xtermRef.current) {
      fitAddonRef.current.fit()
      window.electronAPI.terminal.resize(id, xtermRef.current.cols, xtermRef.current.rows)
    }
  }, [cwd])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
      theme: {
        background: '#08090e',
        foreground: '#e2e8f0',
        cursor: '#a78bfa',
        selectionBackground: 'rgba(139, 92, 246, 0.3)',
      },
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    term.onData((data) => {
      const sid = sessionIdRef.current
      if (sid) window.electronAPI?.terminal.write(sid, data)
    })

    let rafId: number | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        rafId = null
        fitAddon.fit()
        const sid = sessionIdRef.current
        if (sid && xtermRef.current) {
          window.electronAPI?.terminal.resize(sid, term.cols, term.rows)
        }
      })
    })
    resizeObserver.observe(containerRef.current)

    const unsubData = window.electronAPI?.terminal.onData(({ sessionId, data }) => {
      if (sessionId !== sessionIdRef.current) return
      pendingOutputRef.current += data
      // Check for errors in stripped output
      checkForErrors(stripAnsi(data))
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null
          const batch = pendingOutputRef.current
          term.write(batch)
          
          // Save output to terminalHistory (Crash Recovery)
          const current = useAppStore.getState().terminalHistory || ''
          const next = (current + batch).slice(-5000)
          useAppStore.setState({ terminalHistory: next })

          pendingOutputRef.current = ''
        })
      }
    })

    const unsubClose = window.electronAPI?.terminal.onClose(({ sessionId, code }) => {
      if (sessionId === sessionIdRef.current) {
        term.writeln(`\r\n\x1b[90mProcess exited with code ${code}\x1b[0m`)
        setIsRunning(false)
        if (code !== 0 && code !== null) {
          checkForErrors(`Process exited with code ${code}`)
        }
      }
    })

    if (cwd) initSession()

    return () => {
      resizeObserver.disconnect()
      unsubData?.()
      unsubClose?.()
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      if (sessionIdRef.current) {
        window.electronAPI?.terminal.killSession(sessionIdRef.current)
        sessionIdRef.current = null
      }
      term.dispose()
      xtermRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (xtermRef.current && cwd) initSession()
  }, [cwd, initSession])

  useEffect(() => {
    fitAddonRef.current?.fit()
  }, [terminalFocusRequest])

  useEffect(() => {
    if (terminalFocusRequest) xtermRef.current?.focus()
  }, [terminalFocusRequest])

  const stopSession = async () => {
    const sid = sessionIdRef.current
    if (!sid) return
    await window.electronAPI?.terminal.killSession(sid)
    sessionIdRef.current = null
    xtermRef.current?.writeln('\r\n\x1b[33m[Stopped]\x1b[0m')
    setIsRunning(false)
  }

  const clearTerminal = () => {
    xtermRef.current?.clear()
    errorBufferRef.current = ''
    setLastError(null)
    useAppStore.setState({ terminalHistory: '' })
  }

  const sendErrorToAI = () => {
    if (!lastError) return
    setAIPanelOpen(true)
    setPendingAiPrompt(
      `I have an error in my terminal. Please explain what went wrong and how to fix it.\n\nTerminal output:\n\`\`\`\n${lastError}\n\`\`\``
    )
    setLastError(null)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#090a10]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Terminal size={16} />
          <div>
            <p className="text-[11px] text-white font-semibold">Terminal</p>
            <p className="text-[10px] text-[#a78bfa] font-bold truncate" style={{ maxWidth: 380 }}>
              {cwd || 'No workspace'}{shellInfo ? ` · ${shellInfo}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={clearTerminal} className="btn-outline text-[10px] px-2 py-1">
            Clear
          </button>
          <button
            type="button"
            onClick={stopSession}
            disabled={!isRunning}
            className="btn-outline text-[10px] px-2 py-1 disabled:opacity-40"
          >
            <Square size={12} /> Stop
          </button>
          <button type="button" onClick={onClose} className="btn-outline text-[10px] px-2 py-1">
            <X size={12} /> Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div ref={containerRef} className="h-full w-full px-1 py-1" />
      </div>

      <div className="px-4 py-2 border-t border-white/10">
        <div className="flex items-center justify-between text-[10px] text-[#94a3b8]">
          <span>PowerShell · bash · node, npm, git, python</span>
          <div className="flex items-center gap-3">
            {lastError && (
              <button
                type="button"
                onClick={sendErrorToAI}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all duration-150"
                style={{
                  background: 'rgba(139,92,246,0.18)',
                  border: '1px solid rgba(139,92,246,0.4)',
                  color: '#a78bfa',
                }}
                title="Send terminal error to AI assistant"
              >
                <Brain size={10} /> Fix Error with AI
              </button>
            )}
            <span>{isRunning ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
