import fs from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'

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

interface BackupEntry {
  filePath: string
  backupPath: string
  timestamp: string
  sessionId: string
  task: string
}

interface ApplyResult {
  success: boolean
  backupPath: string | null
  error?: string
}

const BACKUP_DIR = '.nexus/backups'

function lineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')

  const oldLen = oldLines.length
  const newLen = newLines.length
  const maxDist = oldLen + newLen

  const v: number[] = new Array(2 * maxDist + 1).fill(0)
  const trace: number[][] = []

  let d = 0
  for (; d <= maxDist; d++) {
    const prevV = [...v]
    for (let k = -d; k <= d; k += 2) {
      const idx = k + maxDist
      const down = k === -d || (k !== d && prevV[idx - 1] < prevV[idx + 1])
      let x = down ? prevV[idx + 1] : prevV[idx - 1] + 1
      let y = x - k
      while (x < oldLen && y < newLen && oldLines[x] === newLines[y]) {
        x++
        y++
      }
      v[idx] = x
      if (x >= oldLen && y >= newLen) break
    }
    trace.push([...v])
    if (v[maxDist + (newLen - oldLen)] >= oldLen && v[maxDist + (newLen - oldLen)] - (newLen - oldLen) >= newLen) break
  }

  const result: DiffLine[] = []
  let x = oldLen, y = newLen

  const editScript: { type: 'added' | 'removed'; x: number; y: number }[] = []

  for (let d = trace.length - 1; d >= 0; d--) {
    const vRow = trace[d]
    const k = x - y
    const idx = k + maxDist
    const prevK = d === 0 ? 0 : (
      k === -d || (k !== d && vRow[idx - 1] < vRow[idx + 1])
        ? k + 1
        : k - 1
    )
    const prevIdx = prevK + maxDist
    const prevX = d === 0 ? 0 : vRow[prevIdx]
    const prevY = prevX - prevK

    while (x > prevX && y > prevY) {
      result.unshift({ type: 'unchanged', oldLineNum: x, newLineNum: y, content: oldLines[x - 1] })
      x--
      y--
    }

    if (d > 0) {
      if (y > prevY) {
        result.unshift({ type: 'added', oldLineNum: null, newLineNum: y, content: newLines[y - 1] })
        y--
      } else if (x > prevX) {
        result.unshift({ type: 'removed', oldLineNum: x, newLineNum: null, content: oldLines[x - 1] })
        x--
      }
    }
  }

  return result
}

async function computeDiff(filePath: string, newContent: string): Promise<FileDiff> {
  let oldContent = ''
  try {
    oldContent = await fs.readFile(filePath, 'utf-8')
  } catch { /* new file */ }

  const lines = lineDiff(oldContent, newContent)
  return { filePath, lines, oldContent, newContent }
}

async function applyChange(filePath: string, newContent: string, sessionId: string, task: string): Promise<ApplyResult> {
  try {
    const backupPath = await saveBackup(filePath, sessionId, task)
    await fs.writeFile(filePath, newContent, 'utf-8')
    return { success: true, backupPath }
  } catch (err: any) {
    return { success: false, backupPath: null, error: err.message }
  }
}

async function saveBackup(filePath: string, sessionId: string, task: string): Promise<string> {
  const projectRoot = findProjectRoot(filePath)
  if (!projectRoot) throw new Error('Cannot determine project root')

  const backupDir = path.join(projectRoot, BACKUP_DIR)
  await fs.mkdir(backupDir, { recursive: true })

  const relPath = path.relative(projectRoot, filePath)
  const safeName = relPath.replace(/[^a-zA-Z0-9_\-./\\]/g, '_').replace(/[\\/]/g, '__')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupName = `${timestamp}__${safeName}`
  const backupPath = path.join(backupDir, backupName)

  if (existsSync(filePath)) {
    await fs.copyFile(filePath, backupPath)
  }

  const metaPath = path.join(backupDir, `${backupName}.meta.json`)
  const meta: BackupEntry = { filePath, backupPath, timestamp, sessionId, task }
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8')

  return backupPath
}

async function getBackups(projectPath: string): Promise<BackupEntry[]> {
  const backupDir = path.join(projectPath, BACKUP_DIR)
  const entries: BackupEntry[] = []
  try {
    const files = await fs.readdir(backupDir)
    for (const file of files) {
      if (file.endsWith('.meta.json')) {
        const meta = JSON.parse(await fs.readFile(path.join(backupDir, file), 'utf-8'))
        entries.push(meta)
      }
    }
  } catch { /* no backups */ }
  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

async function rollbackChange(backupPath: string): Promise<boolean> {
  try {
    const metaDir = path.dirname(backupPath)
    const metaName = path.basename(backupPath) + '.meta.json'
    const metaPath = path.join(metaDir, metaName)
    const meta: BackupEntry = JSON.parse(await fs.readFile(metaPath, 'utf-8'))

    if (existsSync(backupPath)) {
      await fs.copyFile(backupPath, meta.filePath)
      return true
    }
    return false
  } catch {
    return false
  }
}

async function rollbackLastChange(projectPath: string): Promise<BackupEntry | null> {
  const backups = await getBackups(projectPath)
  if (backups.length === 0) return null

  const latest = backups[0]
  const ok = await rollbackChange(latest.backupPath)
  return ok ? latest : null
}

function findProjectRoot(filePath: string): string | null {
  let dir = path.dirname(filePath)
  while (dir.length > 0) {
    if (existsSync(path.join(dir, '.nexus'))) return dir
    if (existsSync(path.join(dir, 'package.json'))) return dir
    if (existsSync(path.join(dir, '.git'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

async function deleteBackup(backupPath: string): Promise<boolean> {
  try {
    const metaDir = path.dirname(backupPath)
    const metaName = path.basename(backupPath) + '.meta.json'
    const metaPath = path.join(metaDir, metaName)

    await fs.unlink(backupPath).catch(() => {})
    await fs.unlink(metaPath).catch(() => {})
    return true
  } catch {
    return false
  }
}

export { computeDiff, applyChange, getBackups, rollbackChange, rollbackLastChange, saveBackup, deleteBackup }
export type { DiffLine, FileDiff, BackupEntry, ApplyResult }
