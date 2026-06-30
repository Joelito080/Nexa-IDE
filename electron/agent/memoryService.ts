import fsPromises from 'node:fs/promises'
import path from 'node:path'
import log from 'electron-log'

export interface GitCommitEntry {
  hash: string
  message: string
  branch: string
  autonomous: boolean
  timestamp: string
}

export interface AgentMemory {
  currentProject: string | null
  currentGoal: string | null
  recentFiles: string[]
  taskHistory: TaskHistoryEntry[]
  lastTerminalCommands: string[]
  lastPlan: string | null
  gitCommits: GitCommitEntry[]
  updatedAt: string
}

export interface TaskHistoryEntry {
  id: string
  task: string
  phase: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  timestamp: string
  summary?: string
}

const MAX_HISTORY = 100
const MAX_COMMANDS = 30
const MAX_RECENT_FILES = 50

export class MemoryService {
  private memory: AgentMemory = {
    currentProject: null,
    currentGoal: null,
    recentFiles: [],
    taskHistory: [],
    lastTerminalCommands: [],
    lastPlan: null,
    gitCommits: [],
    updatedAt: new Date().toISOString(),
  }

  private storagePath: string | null = null

  setStoragePath(userDataPath: string, projectPath: string | null): void {
    if (!projectPath) {
      this.storagePath = null
      return
    }
    this.storagePath = path.join(userDataPath, 'NEXUS', 'agent-memory', Buffer.from(projectPath).toString('base64url').slice(0, 32))
  }

  async load(projectPath: string | null): Promise<AgentMemory> {
    this.memory.currentProject = projectPath
    if (!this.storagePath) return { ...this.memory }

    try {
      const raw = await fsPromises.readFile(path.join(this.storagePath, 'memory.json'), 'utf-8')
      this.memory = { ...this.memory, ...JSON.parse(raw) }
    } catch {
      // fresh memory
    }
    return { ...this.memory }
  }

  async persist(): Promise<void> {
    if (!this.storagePath) return
    this.memory.updatedAt = new Date().toISOString()
    try {
      await fsPromises.mkdir(this.storagePath, { recursive: true })
      await fsPromises.writeFile(
        path.join(this.storagePath, 'memory.json'),
        JSON.stringify(this.memory),
        'utf-8',
      )
    } catch (err) {
      log.warn('[Memory] Failed to persist:', err)
    }
  }

  setGoal(goal: string): void {
    this.memory.currentGoal = goal
    this.persist()
  }

  addTaskEntry(task: string, phase: string, status: TaskHistoryEntry['status'], summary?: string): string {
    const id = `task-${Date.now()}`
    this.memory.taskHistory.unshift({
      id, task, phase, status, timestamp: new Date().toISOString(), summary,
    })
    this.memory.taskHistory = this.memory.taskHistory.slice(0, MAX_HISTORY)
    this.persist()
    return id
  }

  updateTaskEntry(id: string, updates: Partial<TaskHistoryEntry>): void {
    const entry = this.memory.taskHistory.find((t) => t.id === id)
    if (entry) Object.assign(entry, updates)
    this.persist()
  }

  trackFile(filePath: string): void {
    this.memory.recentFiles = [filePath, ...this.memory.recentFiles.filter((f) => f !== filePath)].slice(0, MAX_RECENT_FILES)
    this.persist()
  }

  trackCommand(command: string): void {
    this.memory.lastTerminalCommands = [command, ...this.memory.lastTerminalCommands.filter((c) => c !== command)].slice(0, MAX_COMMANDS)
    this.persist()
  }

  trackGitCommit(hash: string, message: string, branch: string, autonomous: boolean): void {
    const entry: GitCommitEntry = {
      hash,
      message,
      branch,
      autonomous,
      timestamp: new Date().toISOString(),
    }
    this.memory.gitCommits = [entry, ...this.memory.gitCommits.filter((commit) => commit.hash !== hash)].slice(0, MAX_HISTORY)
    this.persist()
  }

  setPlan(plan: string): void {
    this.memory.lastPlan = plan
    this.persist()
  }

  getContextPrompt(): string {
    const parts: string[] = []
    if (this.memory.currentGoal) parts.push(`Current goal: ${this.memory.currentGoal}`)
    if (this.memory.lastPlan) parts.push(`Last plan: ${this.memory.lastPlan}`)
    if (this.memory.recentFiles.length) {
      parts.push(`Recent files: ${this.memory.recentFiles.slice(0, 10).join(', ')}`)
    }
    if (this.memory.lastTerminalCommands.length) {
      parts.push(`Recent commands: ${this.memory.lastTerminalCommands.slice(0, 5).join('; ')}`)
    }
    const recentTasks = this.memory.taskHistory.slice(0, 5)
    if (recentTasks.length) {
      parts.push(`Recent tasks: ${recentTasks.map((t) => `[${t.status}] ${t.task}`).join(' | ')}`)
    }
    if (this.memory.gitCommits.length) {
      parts.push(`Recent git commits: ${this.memory.gitCommits.slice(0, 5).map((c) => `${c.hash.slice(0, 7)}${c.autonomous ? ' [auto]' : ''}: ${c.message}`).join(' | ')}`)
    }
    return parts.join('\n')
  }

  getMemory(): AgentMemory {
    return { ...this.memory }
  }
}

export const memoryService = new MemoryService()
