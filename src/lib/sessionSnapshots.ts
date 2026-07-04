// Session snapshot management for saving and restoring AI chat states
// Stores snapshots in localStorage with timestamps and metadata

const SNAPSHOTS_STORAGE_KEY = 'nexus-session-snapshots'
const LATEST_SNAPSHOT_KEY = 'nexus-latest-snapshot'
const MAX_SNAPSHOTS = 20
const SNAPSHOT_ID_LENGTH = 8

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  timestamp?: string
  commandChips?: string[]
}

export interface SessionSnapshot {
  id: string
  name: string
  timestamp: number
  savedAt: string
  data: {
    chatHistory: ChatMessage[]
    model: string
    provider: string
    attachedFiles: string[]
    parameters: {
      temperature: number
      maxTokens: number
      topP: number
    }
    systemPrompt: string
    mode: 'chat' | 'code' | 'project' | 'agent' | 'refactor'
    visibility: {
      showSystemPrompt: boolean
      showUserPrompt: boolean
      showSelectedFile: boolean
      showAttachedFiles: boolean
      showImportedFiles: boolean
      showWorkspaceContext: boolean
    }
  }
}

// Generate a unique snapshot ID
function generateSnapshotId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < SNAPSHOT_ID_LENGTH; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

// Get all snapshots from localStorage
function getAllSnapshots(): SessionSnapshot[] {
  try {
    const data = localStorage.getItem(SNAPSHOTS_STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

// Save snapshots to localStorage
function saveSnapshots(snapshots: SessionSnapshot[]): void {
  try {
    localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots))
  } catch (err) {
    console.warn('Failed to save session snapshots:', err)
  }
}

// Create a new snapshot
export function createSnapshot(
  chatHistory: ChatMessage[],
  model: string,
  provider: string,
  attachedFiles: string[],
  parameters: { temperature: number; maxTokens: number; topP: number },
  systemPrompt: string,
  mode: 'chat' | 'code' | 'project' | 'agent' | 'refactor',
  visibility: {
    showSystemPrompt: boolean
    showUserPrompt: boolean
    showSelectedFile: boolean
    showAttachedFiles: boolean
    showImportedFiles: boolean
    showWorkspaceContext: boolean
  },
  name?: string
): SessionSnapshot {
  const now = new Date()
  const snapshot: SessionSnapshot = {
    id: generateSnapshotId(),
    name: name || `Snapshot ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    timestamp: now.getTime(),
    savedAt: now.toISOString(),
    data: {
      chatHistory,
      model,
      provider,
      attachedFiles,
      parameters,
      systemPrompt,
      mode,
      visibility,
    },
  }
  return snapshot
}

// Save a snapshot to localStorage
export function saveSnapshot(snapshot: SessionSnapshot): void {
  const snapshots = getAllSnapshots()
  snapshots.unshift(snapshot) // Add to beginning
  
  // Keep only the latest MAX_SNAPSHOTS
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots.length = MAX_SNAPSHOTS
  }
  
  saveSnapshots(snapshots)
}

// Auto-save the latest snapshot (updates or creates)
export function autoSaveLatest(
  chatHistory: ChatMessage[],
  model: string,
  provider: string,
  attachedFiles: string[],
  parameters: { temperature: number; maxTokens: number; topP: number },
  systemPrompt: string,
  mode: 'chat' | 'code' | 'project' | 'agent' | 'refactor',
  visibility: {
    showSystemPrompt: boolean
    showUserPrompt: boolean
    showSelectedFile: boolean
    showAttachedFiles: boolean
    showImportedFiles: boolean
    showWorkspaceContext: boolean
  }
): SessionSnapshot {
  const snapshot = createSnapshot(
    chatHistory,
    model,
    provider,
    attachedFiles,
    parameters,
    systemPrompt,
    mode,
    visibility,
    'Auto-saved'
  )
  
  try {
    localStorage.setItem(LATEST_SNAPSHOT_KEY, JSON.stringify(snapshot))
  } catch (err) {
    console.warn('Failed to auto-save session snapshot:', err)
  }
  
  return snapshot
}

// Get the latest auto-saved snapshot
export function getLatestSnapshot(): SessionSnapshot | null {
  try {
    const data = localStorage.getItem(LATEST_SNAPSHOT_KEY)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

export function clearLatestSnapshot(): void {
  try {
    localStorage.removeItem(LATEST_SNAPSHOT_KEY)
  } catch {
    // ignore
  }
}

// Get a specific snapshot by ID
export function getSnapshot(snapshotId: string): SessionSnapshot | null {
  const snapshots = getAllSnapshots()
  return snapshots.find((s) => s.id === snapshotId) || null
}

// List all saved snapshots (with optional limit)
export function listSnapshots(limit?: number): SessionSnapshot[] {
  const snapshots = getAllSnapshots()
  return limit ? snapshots.slice(0, limit) : snapshots
}

// Delete a snapshot by ID
export function deleteSnapshot(snapshotId: string): boolean {
  const snapshots = getAllSnapshots()
  const index = snapshots.findIndex((s) => s.id === snapshotId)
  
  if (index === -1) return false
  
  snapshots.splice(index, 1)
  saveSnapshots(snapshots)
  return true
}

// Delete all snapshots
export function deleteAllSnapshots(): void {
  try {
    localStorage.removeItem(SNAPSHOTS_STORAGE_KEY)
  } catch (err) {
    console.warn('Failed to delete session snapshots:', err)
  }
}

// Get total number of snapshots
export function getSnapshotCount(): number {
  return getAllSnapshots().length
}

// Export snapshots as JSON for backup
export function exportSnapshots(): string {
  const snapshots = getAllSnapshots()
  return JSON.stringify(snapshots, null, 2)
}

// Import snapshots from JSON backup
export function importSnapshots(jsonData: string): number {
  try {
    const imported = JSON.parse(jsonData) as SessionSnapshot[]
    if (!Array.isArray(imported)) return 0
    
    const snapshots = getAllSnapshots()
    const newSnapshots = [...imported, ...snapshots]
    
    // Remove duplicates by ID
    const uniqueSnapshots = Array.from(
      new Map(newSnapshots.map((s) => [s.id, s])).values()
    )
    
    // Keep only MAX_SNAPSHOTS
    if (uniqueSnapshots.length > MAX_SNAPSHOTS) {
      uniqueSnapshots.length = MAX_SNAPSHOTS
    }
    
    saveSnapshots(uniqueSnapshots)
    return imported.length
  } catch {
    return 0
  }
}
