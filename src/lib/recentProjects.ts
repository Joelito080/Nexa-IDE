export interface RecentProject {
  path: string
  name: string
  lastOpened: number
  pinned: boolean
}

const STORAGE_KEY = 'nexus-recent-projects'

export function getRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentProject[]
    if (!Array.isArray(parsed)) return []
    
    // Sort: pinned first (by lastOpened descending), then unpinned (by lastOpened descending)
    return parsed.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.lastOpened - a.lastOpened
    })
  } catch (err) {
    console.error('[RecentProjects] Failed to load recent projects:', err)
    return []
  }
}

export function addRecentProject(projectPath: string, name?: string): void {
  try {
    if (!projectPath) return
    const projects = getRecentProjects()
    const normPath = projectPath.replace(/\\/g, '/')
    const projectName = name || projectPath.split(/[/\\]/).pop() || 'Unnamed Project'
    
    const existingIndex = projects.findIndex((p) => p.path.replace(/\\/g, '/') === normPath)
    
    if (existingIndex >= 0) {
      // Update existing entry
      projects[existingIndex].lastOpened = Date.now()
      if (name) {
        projects[existingIndex].name = projectName
      }
    } else {
      // Add new entry
      projects.push({
        path: projectPath,
        name: projectName,
        lastOpened: Date.now(),
        pinned: false,
      })
    }
    
    // Enforce max 10 projects (excluding pinned items if we exceed, but let's keep it simple: keep pinned items, limit total to 10)
    // Sort first
    const sorted = projects.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.lastOpened - a.lastOpened
    })
    
    // Keep first 10
    const limited = sorted.slice(0, 10)
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(limited))
    
    // Register the path in safety whitelist dynamically
    if (window.electronAPI?.app.allowPath) {
      window.electronAPI.app.allowPath(projectPath)
    }
  } catch (err) {
    console.error('[RecentProjects] Failed to add recent project:', err)
  }
}

export function togglePinProject(projectPath: string): RecentProject[] {
  try {
    const projects = getRecentProjects()
    const normPath = projectPath.replace(/\\/g, '/')
    const updated = projects.map((p) => {
      if (p.path.replace(/\\/g, '/') === normPath) {
        return { ...p, pinned: !p.pinned }
      }
      return p
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    return getRecentProjects()
  } catch (err) {
    console.error('[RecentProjects] Failed to toggle pin status:', err)
    return getRecentProjects()
  }
}

export function removeRecentProject(projectPath: string): RecentProject[] {
  try {
    const projects = getRecentProjects()
    const normPath = projectPath.replace(/\\/g, '/')
    const filtered = projects.filter((p) => p.path.replace(/\\/g, '/') !== normPath)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
    return getRecentProjects()
  } catch (err) {
    console.error('[RecentProjects] Failed to remove recent project:', err)
    return getRecentProjects()
  }
}
