import os from 'node:os'
import path from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { BrowserWindow } from 'electron'
import log from 'electron-log'
import { sanitizeCommand } from './safetyRules'

// ── Output Buffering ──────────────────────────────────────────────────────────
// Batches chunks per session and flushes every 16ms (~60fps) to avoid flooding
// the renderer with individual IPC messages for every stdout/stderr chunk.
const outputBuffers = new Map<string, { buffer: string[]; window: BrowserWindow | null }>()
let flushInterval: ReturnType<typeof setInterval> | null = null

function addToBuffer(sessionId: string, chunk: string, win: BrowserWindow | null) {
  let entry = outputBuffers.get(sessionId)
  if (!entry) {
    entry = { buffer: [], window: win }
    outputBuffers.set(sessionId, entry)
  }
  entry.buffer.push(chunk)
  if (!flushInterval) {
    flushInterval = setInterval(flushAllBuffers, 16)
  }
}

function flushAllBuffers() {
  for (const [sessionId, entry] of outputBuffers) {
    if (entry.buffer.length === 0) continue
    const data = entry.buffer.join('')
    entry.buffer.length = 0
    entry.window?.webContents.send('terminal:data', { sessionId, data })
  }
  if (outputBuffers.size === 0 && flushInterval !== null) {
    clearInterval(flushInterval)
    flushInterval = null
  }
}

function removeBuffer(sessionId: string) {
  outputBuffers.delete(sessionId)
  stopFlushIfIdle()
}

function stopFlushIfIdle() {
  if (outputBuffers.size === 0 && flushInterval !== null) {
    clearInterval(flushInterval)
    flushInterval = null
  }
}

export function clearWindowBuffers() {
  for (const entry of outputBuffers.values()) {
    entry.window = null
  }
}

export interface TerminalSessionMeta {
  id: string
  cwd: string
  shell: string
  createdAt: number
  mode: 'pty' | 'spawn'
}

interface SessionHandle {
  meta: TerminalSessionMeta
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
}

const MAX_SESSIONS = 20
const sessions = new Map<string, SessionHandle>()

let ptyModule: typeof import('node-pty') | null = null
let ptyLoadAttempted = false

async function loadPtyModule(): Promise<typeof import('node-pty') | null> {
  if (ptyLoadAttempted) return ptyModule
  ptyLoadAttempted = true
  try {
    ptyModule = await import('node-pty')
    log.info('[Terminal] node-pty loaded successfully')
  } catch (err) {
    log.warn('[Terminal] node-pty unavailable, using spawn fallback:', (err as Error).message)
    ptyModule = null
  }
  return ptyModule
}

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

function getShellArgs(shell: string): string[] {
  const base = path.basename(shell).toLowerCase()
  if (base.includes('powershell') || base === 'pwsh.exe') {
    return ['-NoLogo', '-NoExit', '-Command', '-']
  }
  if (base === 'bash' || base === 'zsh') {
    return ['-l']
  }
  return []
}

function createSpawnSession(
  id: string,
  cwd: string,
  shell: string,
  mainWindow: BrowserWindow | null,
): SessionHandle {
  const shellArgs = getShellArgs(shell)
  const child = spawn(shell, shellArgs, {
    cwd,
    shell: false,
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>,
    stdio: 'pipe',
  }) as ChildProcessWithoutNullStreams

  const meta: TerminalSessionMeta = {
    id,
    cwd,
    shell,
    createdAt: Date.now(),
    mode: 'spawn',
  }

  const onStdout = (chunk: Buffer) => { addToBuffer(id, chunk.toString(), mainWindow) }
  const onStderr = (chunk: Buffer) => { addToBuffer(id, chunk.toString(), mainWindow) }
  const cleanup = () => {
    child.stdout.removeListener('data', onStdout)
    child.stderr.removeListener('data', onStderr)
    sessions.delete(id)
    removeBuffer(id)
  }
  child.stdout.on('data', onStdout)
  child.stderr.on('data', onStderr)
  child.on('close', (code) => {
    cleanup()
    mainWindow?.webContents.send('terminal:close', { sessionId: id, code })
  })
  child.on('error', (error) => {
    cleanup()
    mainWindow?.webContents.send('terminal:data', { sessionId: id, data: `\r\nTerminal error: ${error.message}\r\n` })
  })

  return {
    meta,
    write: (data) => { child.stdin.write(data) },
    resize: () => {},
    kill: () => { try { child.kill('SIGTERM') } catch { /* ignore */ } },
  }
}

function createPtySession(
  id: string,
  cwd: string,
  shell: string,
  pty: typeof import('node-pty'),
  mainWindow: BrowserWindow | null,
): SessionHandle {
  const shellArgs = getShellArgs(shell)
  const ptyProcess = pty.spawn(shell, shellArgs.filter((a) => a !== '-'), {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd,
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>,
  })

  const meta: TerminalSessionMeta = {
    id,
    cwd,
    shell,
    createdAt: Date.now(),
    mode: 'pty',
  }

  ptyProcess.onData((data) => {
    addToBuffer(id, data, mainWindow)
  })
  ptyProcess.onExit(({ exitCode }) => {
    sessions.delete(id)
    removeBuffer(id)
    mainWindow?.webContents.send('terminal:close', { sessionId: id, code: exitCode })
  })

  return {
    meta,
    write: (data) => ptyProcess.write(data),
    resize: (cols, rows) => ptyProcess.resize(Math.max(cols, 1), Math.max(rows, 1)),
    kill: () => { try { ptyProcess.kill() } catch { /* ignore */ } },
  }
}

export async function createTerminalSession(
  cwd: string,
  mainWindow: BrowserWindow | null,
  sessionId?: string,
): Promise<{ id: string; shell: string; cwd: string; mode: string } | { error: string }> {
  if (!cwd || !path.isAbsolute(cwd)) {
    return { error: 'Working directory must be an absolute path.' }
  }

  const id = sessionId ?? `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const shell = getDefaultShell()

  try {
    const pty = await loadPtyModule()
    const session = pty
      ? createPtySession(id, cwd, shell, pty, mainWindow)
      : createSpawnSession(id, cwd, shell, mainWindow)

    // Evict oldest session if at capacity
    if (sessions.size >= MAX_SESSIONS) {
      const oldest = sessions.keys().next().value
      if (oldest) killTerminalSession(oldest)
    }
    sessions.set(id, session)
    log.info(`[Terminal] Session ${id} started (${session.meta.mode}, ${shell}) in ${cwd}`)
    return { id, shell, cwd, mode: session.meta.mode }
  } catch (err) {
    log.error('[Terminal] Failed to spawn session:', err)
    return { error: (err as Error).message }
  }
}

export function writeToTerminal(sessionId: string, data: string): { success: boolean; error?: string } {
  const session = sessions.get(sessionId)
  if (!session) return { success: false, error: `Session ${sessionId} not found` }
  session.write(data)
  return { success: true }
}

export function resizeTerminal(sessionId: string, cols: number, rows: number): { success: boolean } {
  const session = sessions.get(sessionId)
  if (!session) return { success: false }
  session.resize(cols, rows)
  return { success: true }
}

export function killTerminalSession(sessionId: string): { success: boolean; error?: string } {
  const session = sessions.get(sessionId)
  if (!session) return { success: false, error: `Session ${sessionId} not found` }
  try {
    session.kill()
    sessions.delete(sessionId)
    removeBuffer(sessionId)
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export function runCommandInSession(
  sessionId: string,
  command: string,
  mainWindow: BrowserWindow | null,
): { success: boolean; error?: string } {
  const session = sessions.get(sessionId)
  if (!session) return { success: false, error: `Session ${sessionId} not found` }

  const check = sanitizeCommand(command)
  if (!check.safe) return { success: false, error: check.reason }

  session.write(`${command}\r`)
  log.info(`[Terminal] Executed in ${sessionId}: ${command}`)
  mainWindow?.webContents.send('terminal:command', { sessionId, command })
  return { success: true }
}

export function killAllSessions(): void {
  for (const [id, session] of sessions) {
    try { session.kill() } catch (err) {
      log.warn(`[Terminal] Failed to kill session ${id}`, err)
    }
  }
  sessions.clear()
  outputBuffers.clear()
  if (flushInterval !== null) {
    clearInterval(flushInterval)
    flushInterval = null
  }
}

export function listSessions(): Array<{ id: string; cwd: string; shell: string; mode: string }> {
  return [...sessions.values()].map((s) => ({
    id: s.meta.id,
    cwd: s.meta.cwd,
    shell: s.meta.shell,
    mode: s.meta.mode,
  }))
}

export function getPlatformInfo() {
  return {
    platform: process.platform,
    shell: getDefaultShell(),
    homedir: os.homedir(),
  }
}

export async function warmUpTerminal(): Promise<void> {
  await loadPtyModule()
}
