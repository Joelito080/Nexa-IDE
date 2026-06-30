/**
 * fileSystem.ts — NEXA IDE renderer-side filesystem layer
 *
 * Responsibilities:
 *  - Open / save / close file tabs
 *  - Retry-with-backoff for transient OS errors
 *  - Deduplication of concurrent readDir / readFile calls
 *  - Dev-mode performance logging
 *  - Cache invalidation helpers for create / delete / rename / clone
 */

import { useAppStore } from '../store/appStore'
import {
  getFileContent as getCacheContent,
  setFileContent as setCacheContent,
  removeFileContent as removeCacheContent,
  LARGE_FILE_THRESHOLD,
  markLargeFile,
  clearLargeFileStatus,
} from './fileCache'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Folders that are never shown in the explorer tree. Checked at EVERY depth level. */
export const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  '.vite',
  'coverage',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  '.nx',
  '.angular',
  'out',
  '.output',
  '.nuxt',
  '.svelte-kit',
  'target',        // Rust / Maven
  'vendor',        // Go / PHP
  'Pods',          // iOS
  '.idea',
  '.vs',
  'obj',
  'bin',
])

/** Max entries returned from a single readDir. Above this the tree is capped and a warning shown. */
export const MAX_FOLDER_ENTRIES = 2000

/** Max recursion depth for full-tree scans (does NOT apply to lazy expand — only bulk ops). */
export const MAX_DEPTH = 8

/** Retryable errno codes. We do NOT retry ENOENT (file gone). */
const RETRYABLE_ERRORS = new Set(['EBUSY', 'EPERM', 'EMFILE', 'EAGAIN', 'EACCES'])
const MAX_RETRIES = 3
const RETRY_BASE_MS = 150

// ─── Dev logging ─────────────────────────────────────────────────────────────

const DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true

function fsLog(msg: string, ...args: unknown[]) {
  if (DEV) console.debug(`[FS] ${msg}`, ...args)
}

// ─── Dedup maps ───────────────────────────────────────────────────────────────
// All in-flight IPC calls are stored here so a second caller just awaits the
// existing promise rather than firing a duplicate IPC.

const pendingReadDir = new Map<string, Promise<ExplorerEntryRaw[] | null>>()
const pendingReadFile = new Map<string, Promise<string>>()

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExplorerEntryRaw {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const start = DEV ? performance.now() : 0
      const result = await fn()
      if (DEV) fsLog(`${label}: ${(performance.now() - start).toFixed(1)}ms`)
      return result
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code ?? ''
      if (attempt < retries && RETRYABLE_ERRORS.has(code)) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt)
        fsLog(`retry #${attempt + 1} for ${label} (${code}), waiting ${delay}ms`)
        await new Promise((res) => setTimeout(res, delay))
        continue
      }
      throw err
    }
  }
  throw new Error(`[FS] Exhausted retries for ${label}`)
}

function withTimeout<T>(promise: Promise<T>, ms: number, message = 'Operation timed out'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer))
}

// ─── readDir (deduped + retried + filtered) ───────────────────────────────────

/**
 * Read a directory's immediate children via IPC.
 * - Deduplicates concurrent calls for the same path.
 * - Retries on EBUSY / EPERM / EMFILE.
 * - Filters IGNORE_DIRS and hidden files.
 * - Caps at MAX_FOLDER_ENTRIES and shows a notification if exceeded.
 */
export async function readDir(
  dirPath: string,
  opts?: { silent?: boolean }
): Promise<ExplorerEntryRaw[] | null> {
  const norm = normalizeDirKey(dirPath)
  const api = window.electronAPI
  if (!api) return null

  // Dedup: return existing in-flight promise
  if (pendingReadDir.has(norm)) {
    fsLog(`cache hit (in-flight) readDir: ${norm}`)
    return pendingReadDir.get(norm)!
  }

  const promise = withRetry(`readDir(${norm})`, async () => {
    const start = DEV ? performance.now() : 0
    const response = await api.fs.readDir(dirPath)

    if (!response || (response as any).error) {
      const errMsg = (response as any)?.error ?? 'Unknown error'
      if (!opts?.silent) {
        useAppStore.getState().addNotification(`Unable to read folder: ${errMsg}`, 'error')
      }
      return null
    }

    const raw = response as any[]
    const sep = dirPath.includes('\\') ? '\\' : '/'
    const base = dirPath.endsWith(sep) ? dirPath.slice(0, -1) : dirPath

    // Filter ignored and hidden entries
    const filtered = raw.filter((e: any) => {
      if (e.isDirectory && IGNORE_DIRS.has(e.name)) return false
      if (e.name.startsWith('.') && e.name !== '.env.example' && e.name !== '.env') return false
      return true
    })

    // Cap entries
    let capped = false
    let entries = filtered
    if (filtered.length > MAX_FOLDER_ENTRIES) {
      entries = filtered.slice(0, MAX_FOLDER_ENTRIES)
      capped = true
    }

    // Map to typed entries
    const result: ExplorerEntryRaw[] = entries.map((e: any) => ({
      name: e.name,
      path: `${base}${sep}${e.name}`,
      isDirectory: Boolean(e.isDirectory),
      isFile: Boolean(e.isFile),
    }))

    if (capped && !opts?.silent) {
      fsLog(`readDir capped at ${MAX_FOLDER_ENTRIES} for ${norm}`)
      useAppStore.getState().addNotification(
        `Folder contains more than ${MAX_FOLDER_ENTRIES} entries — showing first ${MAX_FOLDER_ENTRIES} only.`,
        'warning'
      )
    }

    if (DEV) fsLog(`readDir: ${norm} → ${result.length} entries in ${(performance.now() - start).toFixed(1)}ms`)
    return result
  }).finally(() => {
    pendingReadDir.delete(norm)
  })

  pendingReadDir.set(norm, promise)
  return promise
}

// ─── Cache invalidation ───────────────────────────────────────────────────────

// The Sidebar keeps its own dirCacheRef. These helpers let other code signal
// that specific paths need to be re-read. We store invalidated paths in a Set
// and export a subscribe mechanism so Sidebar can hook in.

type InvalidationListener = (paths: string[]) => void
const invalidationListeners = new Set<InvalidationListener>()

export function onDirCacheInvalidation(fn: InvalidationListener): () => void {
  invalidationListeners.add(fn)
  return () => invalidationListeners.delete(fn)
}

/**
 * Invalidate cached directory entries for the given paths.
 * Call this after: file create, delete, rename, git clone, project create.
 */
export function invalidateDirCache(...paths: string[]): void {
  const norms = paths.map(normalizeDirKey)
  if (paths.length === 0) {
    pendingReadDir.clear()
  } else {
    for (const n of norms) pendingReadDir.delete(n)
  }
  fsLog(`invalidateDirCache: ${norms.join(', ')}`)
  for (const fn of invalidationListeners) {
    try { fn(norms) } catch { /* listener errors must not break invalidation */ }
  }
}

/**
 * Invalidate the parent directory of a given file/folder path.
 * Convenience wrapper for create/delete/rename operations.
 */
export function invalidateParent(filePath: string): void {
  const sep = filePath.includes('\\') ? '\\' : '/'
  const parent = filePath.replace(/[/\\][^/\\]+$/, '')
  if (parent && parent !== filePath) invalidateDirCache(parent)
}

// ─── Module-level storage for unsaved content ─────────────────────────────────

const latestContentMap = new Map<string, string>()
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>()

// ─── Path helpers ─────────────────────────────────────────────────────────────

/** Normalise a directory path as a dedup / cache key. */
export function normalizeDirKey(p: string): string {
  return p.replace(/[/\\]+$/, '').toLowerCase().replace(/\\/g, '/')
}

/** Normalise a path for case-insensitive comparison. */
export const normalizePath = (p: string): string =>
  p.toLowerCase().replace(/\\/g, '/')

// ─── flushPendingChanges ──────────────────────────────────────────────────────

export function flushPendingChanges(filePath: string): void {
  const timer = debounceTimers.get(filePath)
  if (timer) {
    clearTimeout(timer)
    debounceTimers.delete(filePath)
  }
  const latestContent = latestContentMap.get(filePath)
  if (latestContent !== undefined) {
    setCacheContent(filePath, latestContent)
    const store = useAppStore.getState()
    const unsaved = { ...store.unsavedChanges }
    unsaved[filePath] = latestContent
    useAppStore.setState({ unsavedChanges: unsaved })
    latestContentMap.delete(filePath)
  }
}

// ─── updateFileContentDebounced ────────────────────────────────────────────────

export function updateFileContentDebounced(filePath: string, content: string): void {
  latestContentMap.set(filePath, content)
  const oldTimer = debounceTimers.get(filePath)
  if (oldTimer) clearTimeout(oldTimer)
  const timer = setTimeout(() => {
    debounceTimers.delete(filePath)
    const currentLatest = latestContentMap.get(filePath)
    if (currentLatest !== undefined) {
      setCacheContent(filePath, currentLatest)
      const store = useAppStore.getState()
      const unsaved = { ...store.unsavedChanges }
      unsaved[filePath] = currentLatest
      useAppStore.setState({ unsavedChanges: unsaved })
      latestContentMap.delete(filePath)
    }
  }, 300)
  debounceTimers.set(filePath, timer)

  // 1.5s idle autosave
  const oldAutoTimer = autosaveTimers.get(filePath)
  if (oldAutoTimer) clearTimeout(oldAutoTimer)
  const autoTimer = setTimeout(async () => {
    autosaveTimers.delete(filePath)
    try {
      await saveFile(filePath)
    } catch (err) {
      console.error('[Autosave] Failed to save file:', filePath, err)
    }
  }, 1500)
  autosaveTimers.set(filePath, autoTimer)
}

// ─── openFile ────────────────────────────────────────────────────────────────

export async function openFile(filePath: string): Promise<string> {
  const norm = normalizePath(filePath)
  const store = useAppStore.getState()

  // Special URLs
  if (filePath.startsWith('gitdiff://') || filePath === 'nexus://settings') {
    store.setSelectedFilePath(filePath)
    if (!store.openTabs.some((t) => normalizePath(t) === norm)) {
      store.setOpenTabs([...store.openTabs, filePath])
    }
    return ''
  }

  const existingTab = store.openTabs.find((t) => normalizePath(t) === norm)
  const targetPath = existingTab || filePath
  if (!store.openTabs.some((t) => normalizePath(t) === norm)) {
    store.setOpenTabs([...store.openTabs, targetPath])
  }
  store.setSelectedFilePath(targetPath)

  // Unsaved changes (crash recovery)
  const unsaved = store.unsavedChanges[targetPath]
  if (unsaved !== undefined) {
    setCacheContent(targetPath, unsaved)
    return unsaved
  }

  // Memory cache
  const cached = getCacheContent(targetPath)
  if (cached !== undefined) {
    fsLog(`cache hit readFile: ${targetPath}`)
    return cached
  }

  // Disk — deduped + retried
  if (pendingReadFile.has(targetPath)) {
    fsLog(`cache hit (in-flight) readFile: ${targetPath}`)
    return pendingReadFile.get(targetPath)!
  }

  const api = window.electronAPI
  if (!api) throw new Error('Electron API not available')

  // Only the caller that initiates the IPC owns the loading state.
  // Callers that join an already in-flight promise must NOT set/clear
  // loading — the owner's finally() will handle it.
  const isOwner = !pendingReadFile.has(targetPath)
  if (isOwner) {
    store.setLoading(true)
  }

  const promise = (isOwner
    ? withTimeout(
        withRetry(`readFile(${targetPath})`, async () => {
          const stat = await api.fs.stat(targetPath)
          if ('error' in stat) throw new Error(stat.error)

          if (stat.size > LARGE_FILE_THRESHOLD) {
            markLargeFile(targetPath)
            return ''
          }
          clearLargeFileStatus(targetPath)

          const res = await api.fs.readFile(targetPath)
          if (!res || !res.success) throw new Error(res?.error || 'Unknown file read error')

          const content = res.content ?? ''
          setCacheContent(targetPath, content)
          return content
        }),
        5000,
        'Read timeout: file reading took too long'
      ).finally(() => {
        pendingReadFile.delete(targetPath)
        store.setLoading(false)
      })
    : pendingReadFile.get(targetPath)!
  )

  pendingReadFile.set(targetPath, promise)
  return promise
}

// ─── saveFile ────────────────────────────────────────────────────────────────

export async function saveFile(filePath: string): Promise<boolean> {
  if (filePath.startsWith('nexus://') || filePath.startsWith('gitdiff://')) {
    return true
  }

  const store = useAppStore.getState()
  store.setSaveState('Saving...')

  try {
    flushPendingChanges(filePath)

    // Clear any pending autosave timer for this file
    const autosaveTimer = autosaveTimers.get(filePath)
    if (autosaveTimer) {
      clearTimeout(autosaveTimer)
      autosaveTimers.delete(filePath)
    }

    let content = getCacheContent(filePath)
    if (content === undefined) {
      content = store.unsavedChanges[filePath]
    }
    if (content === undefined) throw new Error('No content found to save')

    const api = window.electronAPI
    if (!api) throw new Error('Electron API not available')

    const res = await withRetry(`writeFile(${filePath})`, () =>
      api.fs.writeFile(filePath, content!) as Promise<any>
    )

    if (res && !(res as any).error) {
      const unsaved = { ...store.unsavedChanges }
      delete unsaved[filePath]
      store.setUnsavedChanges(unsaved)
      // Invalidate parent dir so any watchers can update
      invalidateParent(filePath)
      store.setSaveState('Saved')
      return true
    }
    throw new Error((res as any)?.error || 'Unknown save error')
  } catch (err) {
    store.setSaveState('Failed')
    throw err
  }
}

// ─── closeFile ────────────────────────────────────────────────────────────────

export function closeFile(filePath: string): void {
  flushPendingChanges(filePath)

  const store = useAppStore.getState()

  if ((window as any).monaco) {
    try {
      const uri = (window as any).monaco.Uri.file(filePath)
      const model = (window as any).monaco.editor.getModel(uri)
      if (model) {
        model.dispose()
        fsLog(`Monaco model disposed: ${filePath}`)
      }
    } catch (err) {
      console.warn('[Monaco] Failed to dispose model:', err)
    }
  }

  const unsaved = { ...store.unsavedChanges }
  delete unsaved[filePath]
  store.setUnsavedChanges(unsaved)

  removeCacheContent(filePath)
  clearLargeFileStatus(filePath)
  latestContentMap.delete(filePath)

  const timer = debounceTimers.get(filePath)
  if (timer) {
    clearTimeout(timer)
    debounceTimers.delete(filePath)
  }

  const autoTimer = autosaveTimers.get(filePath)
  if (autoTimer) {
    clearTimeout(autoTimer)
    autosaveTimers.delete(filePath)
  }

  const newTabs = store.openTabs.filter((t) => t !== filePath)
  store.setOpenTabs(newTabs)

  if (store.selectedFilePath === filePath) {
    if (newTabs.length > 0) {
      openFile(newTabs[newTabs.length - 1]).catch(console.error)
    } else {
      store.setSelectedFilePath(null)
    }
  }
}
export function closeAllTabs(): void {
  const store = useAppStore.getState()
  // Clean up timers, Monaco models and caches for every open tab —
  // but skip the per-tab setOpenTabs() write inside closeFile() to avoid
  // firing N separate store mutations (one per tab) and N React renders.
  for (const tab of store.openTabs) {
    try {
      // Cancel any pending debounce/autosave timers
      const debTimer = debounceTimers.get(tab)
      if (debTimer) { clearTimeout(debTimer); debounceTimers.delete(tab) }
      const autoTimer = autosaveTimers.get(tab)
      if (autoTimer) { clearTimeout(autoTimer); autosaveTimers.delete(tab) }

      // Flush any pending content changes to the cache
      flushPendingChanges(tab)

      // Dispose stale Monaco model so the new workspace starts clean
      if ((window as any).monaco) {
        try {
          const uri = (window as any).monaco.Uri.file(tab)
          const model = (window as any).monaco.editor.getModel(uri)
          if (model) model.dispose()
        } catch { /* ignore model disposal errors */ }
      }

      // Clear renderer-side content cache
      removeCacheContent(tab)
      clearLargeFileStatus(tab)
      latestContentMap.delete(tab)
    } catch (err) {
      console.error('[closeAllTabs] Error cleaning tab:', tab, err)
    }
  }

  // Single atomic store write — one React render instead of N
  store.setOpenTabs([])
  store.setSelectedFilePath(null)
  store.setUnsavedChanges({})
}

// ─── saveAllDirtyFiles ────────────────────────────────────────────────────────

export async function saveAllDirtyFiles(): Promise<void> {
  const store = useAppStore.getState()
  const dirtyFiles = Object.keys(store.unsavedChanges)
  if (dirtyFiles.length === 0) return

  store.setSaveState('Saving...')
  try {
    await Promise.all(dirtyFiles.map((file) => saveFile(file)))
    store.setSaveState('Saved')
  } catch (err) {
    console.error('Failed to save all dirty files:', err)
    store.setSaveState('Failed')
  }
}

// ─── getCachedFileContent ─────────────────────────────────────────────────────

export function getCachedFileContent(filePath: string): string | undefined {
  const latest = latestContentMap.get(filePath)
  if (latest !== undefined) return latest
  const cached = getCacheContent(filePath)
  if (cached !== undefined) return cached
  return useAppStore.getState().unsavedChanges[filePath]
}

