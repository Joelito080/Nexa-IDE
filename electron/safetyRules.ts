import path from 'node:path'
import fs from 'node:fs'

const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|password|token|credential)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{8,}/i,
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
]

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\s+\/(?!tmp\b)/i,
  /\bformat\s+[a-z]:/i,
  /\bdel\s+\/[sfq]/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\breg\s+(delete|add)\b/i,
  /\bpowershell.*-enc/i,
  /\bcurl.*\|\s*(ba)?sh/i,
  /\bwget.*\|\s*(ba)?sh/i,
  /\bchmod\s+777\s+\//,
  /\bsudo\s+rm\b/i,
]

const ALLOWED_PROGRAMS = new Set([
  'npm', 'npx', 'node', 'pnpm', 'yarn', 'git', 'python', 'python3', 'pip', 'pip3',
  'tsc', 'vite', 'next', 'eslint', 'jest', 'vitest', 'cargo', 'go', 'dotnet',
])

import os from 'node:os'

const ALLOWED_ROOTS = new Set<string>()

export function allowPath(targetPath: string): void {
  if (!targetPath) return
  try {
    const resolved = path.resolve(targetPath)
    ALLOWED_ROOTS.add(resolved)
  } catch {
    // ignore
  }
}

// Pre-allow system temp directory
try {
  allowPath(os.tmpdir())
} catch {}

function getRealPath(p: string): string {
  try {
    if (fs.existsSync(p)) {
      return fs.realpathSync.native(p)
    }
    const dir = path.dirname(p)
    if (fs.existsSync(dir)) {
      return path.join(fs.realpathSync.native(dir), path.basename(p))
    }
  } catch {}
  return path.resolve(p)
}

/**
 * Checks whether `targetPath` is inside the active `workspaceRoot` (or any
 * path explicitly registered via `allowPath()`).
 *
 * Design decisions:
 *  • fs.realpathSync.native() — resolves symlinks using the OS native API so
 *    that junctions, directory symlinks and WSL mounts all resolve correctly.
 *  • Parent-directory fallback — when the target does not yet exist (new file
 *    being created, cloned repo not yet on disk) we resolve its parent instead,
 *    so the check still works for creation-time validation.
 *  • Lowercase on Windows — `D:\` and `d:\` must compare equal; native NTFS
 *    is case-insensitive but path.relative() is not.
 *  • path.relative() containment — `relative` starts with `..` iff target is
 *    outside root; this handles trailing-separator edge cases correctly.
 *  • ALLOWED_ROOTS fallback — paths registered via allowPath() (temp dir, cloned
 *    repos, newly created project directories) are checked after the workspace root.
 */
export function isPathInsideWorkspace(targetPath: string, workspaceRoot: string): boolean {
  if (!targetPath) return false

  let allowed = false
  try {
    const resolvedTarget = getRealPath(targetPath)
    const resolvedRoot   = workspaceRoot ? getRealPath(workspaceRoot) : ''

    // Normalise to lowercase on Windows so drive-letter case never matters
    const isWin       = process.platform === 'win32'
    const cmpTarget   = isWin ? resolvedTarget.toLowerCase() : resolvedTarget
    const cmpRoot     = isWin ? resolvedRoot.toLowerCase()   : resolvedRoot

    // ── Primary check: target is inside the active workspace root ─────────
    if (cmpRoot) {
      const rel = path.relative(cmpRoot, cmpTarget)
      // rel === '' means target IS the root itself; no leading '..' means inside
      allowed = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
    }

    // ── Fallback check: target is inside an explicitly allowed path ────────
    if (!allowed) {
      for (const allowedPath of ALLOWED_ROOTS) {
        try {
          const resolvedAllowed = getRealPath(allowedPath)
          const cmpAllowed = isWin ? resolvedAllowed.toLowerCase() : resolvedAllowed
          const rel = path.relative(cmpAllowed, cmpTarget)
          if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
            allowed = true
            break
          }
        } catch {
          // skip unresolvable allowed path
        }
      }
    }
  } catch (err) {
    console.error('[isPathInsideWorkspace] Resolution error:', err)
  }

  if (!allowed) {
    console.warn('[isPathInsideWorkspace] DENIED  root=%s  target=%s', workspaceRoot, targetPath)
  }

  return allowed
}

export function resolveWorkspacePath(relativeOrAbsolute: string, workspaceRoot: string): string | null {
  if (!workspaceRoot) return null
  const resolved = path.isAbsolute(relativeOrAbsolute)
    ? path.resolve(relativeOrAbsolute)
    : path.resolve(workspaceRoot, relativeOrAbsolute)
  return isPathInsideWorkspace(resolved, workspaceRoot) ? resolved : null
}

export function sanitizeCommand(command: string): { safe: boolean; reason?: string } {
  const trimmed = command.trim()
  if (!trimmed) return { safe: false, reason: 'Empty command' }

  // Strip quoted strings before pattern matching to avoid false positives
  // on dangerous-looking strings inside git commit messages, etc.
  const unquoted = trimmed.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '')

  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(unquoted)) {
      return { safe: false, reason: 'Command blocked by safety policy' }
    }
  }

  return { safe: true }
}

export function isAllowedProgram(command: string): boolean {
  const trimmed = command.trim()
  const first = trimmed.split(/\s+/)[0]?.replace(/\.cmd$|\.exe$/i, '').toLowerCase()
  if (!first) return false
  return ALLOWED_PROGRAMS.has(first)
}

export function redactSecrets(text: string): string {
  let result = text
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match) => {
      const key = match.split(/[:=]/)[0]
      return `${key}=***REDACTED***`
    })
  }
  return result
}

export function maskEnvForOutput(env: Record<string, string | undefined>): Record<string, string> {
  const masked: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue
    if (/key|secret|token|password|credential/i.test(key)) {
      masked[key] = '***REDACTED***'
    } else {
      masked[key] = value
    }
  }
  return masked
}
