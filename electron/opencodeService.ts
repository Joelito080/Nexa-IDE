import { spawn, execSync, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs/promises'
import log from 'electron-log'

interface OpenCodeSession {
  process: ChildProcess
  cwd: string
  prompt: string
  stdout: string
  stderr: string
  cancelled: boolean
}

const sessions = new Map<string, OpenCodeSession>()

function findOpenCode(): string | null {
  const candidates = process.platform === 'win32'
    ? ['opencode.cmd', 'opencode.exe', 'opencode']
    : ['opencode']
  const origPath = process.env.PATH || ''
  const paths = origPath.split(path.delimiter)
  for (const dir of paths) {
    for (const bin of candidates) {
      const full = path.join(dir, bin)
      try {
        execSync(`"${full}" --version`, { stdio: 'pipe', timeout: 5000 })
        return full
      } catch { /* not found */ }
    }
  }
  return null
}

async function detectOpenCode(): Promise<{ installed: boolean; path: string | null; version: string | null }> {
  const binPath = findOpenCode()
  if (!binPath) return { installed: false, path: null, version: null }
  try {
    const output = execSync(`"${binPath}" --version`, { encoding: 'utf-8', timeout: 5000 }).trim()
    return { installed: true, path: binPath, version: output || 'unknown' }
  } catch {
    return { installed: true, path: binPath, version: null }
  }
}

async function runOpenCode(
  sessionId: string,
  prompt: string,
  projectPath: string,
  onOutput: (text: string) => void,
  onStatus: (status: string) => void,
  onError: (error: string) => void,
  onDone: (exitCode: number | null) => void,
): Promise<void> {
  const binPath = findOpenCode()
  if (!binPath) {
    onError('OpenCode CLI is not installed.')
    onDone(null)
    return
  }

  const proc = spawn(binPath, ['run', prompt], {
    cwd: projectPath,
    shell: process.platform === 'win32',
    env: { ...process.env, OPENCODE_CLIENT: 'nexa-ide', FORCE_COLOR: '0' },
  })

  const session: OpenCodeSession = {
    process: proc,
    cwd: projectPath,
    prompt,
    stdout: '',
    stderr: '',
    cancelled: false,
  }
  sessions.set(sessionId, session)

  onStatus('thinking')

  proc.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8')
    session.stdout += text
    onOutput(text)
  })

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8')
    session.stderr += text
    onOutput(text)
  })

  proc.on('close', (code) => {
    sessions.delete(sessionId)
    if (session.cancelled) {
      onStatus('cancelled')
    } else {
      onStatus(code === 0 ? 'complete' : 'error')
    }
    onDone(code)
  })

  proc.on('error', (err) => {
    sessions.delete(sessionId)
    onError(err.message)
    onDone(null)
  })
}

function cancelRun(sessionId: string): boolean {
  const session = sessions.get(sessionId)
  if (!session || session.cancelled) return false
  session.cancelled = true
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${session.process.pid} /T /F`, { timeout: 3000 })
    } else {
      session.process.kill('SIGTERM')
    }
  } catch { /* already dead */ }
  return true
}

export { detectOpenCode, runOpenCode, cancelRun }
