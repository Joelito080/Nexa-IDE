import crypto from 'node:crypto'
import fsPromises from 'node:fs/promises'
import path from 'node:path'

// ── Store cache: avoids repeated JSON.parse on unchanged files ────────────────
const storeCache = new Map<string, { mtime: number; data: unknown[] }>()

async function loadStoreCached<T>(filePath: string): Promise<T[]> {
  try {
    const stat = await fsPromises.stat(filePath)
    const cached = storeCache.get(filePath)
    if (cached && cached.mtime === stat.mtimeMs) {
      return cached.data as T[]
    }
    const raw = await fsPromises.readFile(filePath, 'utf-8')
    const data = JSON.parse(raw) as T[]
    storeCache.set(filePath, { mtime: stat.mtimeMs, data })
    return data
  } catch {
    return []
  }
}

function invalidateStoreCache(filePath: string) {
  storeCache.delete(filePath)
}

export interface PromptHistoryEntry {
  id: string
  projectPath: string
  prompt: string
  response: string
  createdAt: string
}

export interface SnippetEntry {
  id: string
  projectPath: string
  title: string
  content: string
  createdAt: string
}

function storagePath(userDataPath: string, fileName: string) {
  return path.join(userDataPath, fileName)
}

async function loadStore<T>(filePath: string): Promise<T[]> {
  return loadStoreCached<T>(filePath)
}

async function saveStore<T>(filePath: string, items: T[]) {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
  await fsPromises.writeFile(filePath, JSON.stringify(items, null, 2), 'utf-8')
  invalidateStoreCache(filePath)
}

const MAX_STORE_ENTRIES = 500

export class PromptHistoryService {
  private filePath: string

  constructor(userDataPath: string) {
    this.filePath = storagePath(userDataPath, 'prompt-history.json')
  }

  async addEntry(projectPath: string, prompt: string, response: string) {
    const list = await loadStore<PromptHistoryEntry>(this.filePath)
    const entry: PromptHistoryEntry = {
      id: crypto.randomUUID(),
      projectPath,
      prompt,
      response,
      createdAt: new Date().toISOString(),
    }
    list.unshift(entry)
    if (list.length > MAX_STORE_ENTRIES) list.length = MAX_STORE_ENTRIES
    await saveStore(this.filePath, list)
    return entry
  }

  async getHistory(projectPath: string) {
    const list = await loadStore<PromptHistoryEntry>(this.filePath)
    return list.filter((entry) => entry.projectPath === projectPath)
  }
}

export class SnippetVaultService {
  private filePath: string

  constructor(userDataPath: string) {
    this.filePath = storagePath(userDataPath, 'snippet-vault.json')
  }

  async addSnippet(projectPath: string, title: string, content: string) {
    const list = await loadStore<SnippetEntry>(this.filePath)
    const entry: SnippetEntry = {
      id: crypto.randomUUID(),
      projectPath,
      title,
      content,
      createdAt: new Date().toISOString(),
    }
    list.unshift(entry)
    if (list.length > MAX_STORE_ENTRIES) list.length = MAX_STORE_ENTRIES
    await saveStore(this.filePath, list)
    return entry
  }

  async listSnippets(projectPath: string) {
    const list = await loadStore<SnippetEntry>(this.filePath)
    return list.filter((entry) => entry.projectPath === projectPath)
  }

  async removeSnippet(projectPath: string, snippetId: string) {
    const list = await loadStore<SnippetEntry>(this.filePath)
    const filtered = list.filter((entry) => !(entry.projectPath === projectPath && entry.id === snippetId))
    await saveStore(this.filePath, filtered)
    return { success: true }
  }
}
