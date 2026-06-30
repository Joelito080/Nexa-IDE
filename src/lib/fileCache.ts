// Module-level LRU file content cache.
// NOT in React state — avoids re-render cascades and duplicate string copies.
// Monaco is the single source of truth for the active file buffer; this cache
// exists only to avoid re-reading files from disk on tab switches.
// Files larger than LARGE_FILE_THRESHOLD bytes are NOT cached.

const MAX_ENTRIES = 50
const MAX_LARGE_FILE_TRACKER = 500
export const LARGE_FILE_THRESHOLD = 1_048_576 // 1 MB
const cache = new Map<string, string>()

// Track paths of large files so components can decide how to render
// without re-checking file size (avoids async IPC in render path).
// Ordered insertion to evict oldest when over cap.
const largeFilePaths = new Map<string, true>()

export function markLargeFile(filePath: string): void {
  largeFilePaths.set(filePath, true)
  if (largeFilePaths.size > MAX_LARGE_FILE_TRACKER) {
    const oldest = largeFilePaths.keys().next().value
    if (oldest !== undefined) largeFilePaths.delete(oldest)
  }
}

export function clearLargeFileStatus(filePath: string): void {
  largeFilePaths.delete(filePath)
}

export function isLargeFilePath(filePath: string): boolean {
  return largeFilePaths.has(filePath)
}

export function clearAllLargeFileStatuses(): void {
  largeFilePaths.clear()
}

export function getFileContent(filePath: string): string | undefined {
  const val = cache.get(filePath)
  if (val !== undefined) {
    // Bump to MRU
    cache.delete(filePath)
    cache.set(filePath, val)
  }
  return val
}

export function setFileContent(filePath: string, content: string): void {
  // Skip caching large files to avoid GC pressure
  if (content.length > LARGE_FILE_THRESHOLD) return
  if (cache.has(filePath)) cache.delete(filePath)
  cache.set(filePath, content)
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
}

export function removeFileContent(filePath: string): void {
  cache.delete(filePath)
}

export function pruneFileContent(): void {
  if (cache.size <= MAX_ENTRIES) return
  const excess = cache.size - MAX_ENTRIES
  const keys = [...cache.keys()]
  for (let i = 0; i < excess; i++) {
    cache.delete(keys[i])
  }
}

export function getFileContentSize(): number {
  return cache.size
}

export function clearFileCache(): void {
  cache.clear()
}
