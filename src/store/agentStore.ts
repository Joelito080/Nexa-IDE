import { create } from 'zustand'

export type AgentPhase = 'UNDERSTAND' | 'PLAN' | 'ACT' | 'TEST' | 'FIX' | 'COMPLETE'

export interface AgentProgressEntry {
  phase: AgentPhase
  message: string
  detail?: string
  timestamp: number
}

export interface TaskHistoryEntry {
  id: string
  task: string
  phase: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  timestamp: string
  summary?: string
}

export interface AgentMemory {
  currentProject: string | null
  currentGoal: string | null
  recentFiles: string[]
  taskHistory: TaskHistoryEntry[]
  lastTerminalCommands: string[]
  lastPlan: string | null
  updatedAt: string
}

interface AgentState {
  running: boolean
  currentPhase: AgentPhase | null
  currentGoal: string | null
  lastPlan: string | null
  progressLog: AgentProgressEntry[]
  memory: AgentMemory | null
  lastTerminalCommands: string[]

  setRunning: (running: boolean) => void
  setPhase: (phase: AgentPhase | null) => void
  setGoal: (goal: string | null) => void
  setPlan: (plan: string | null) => void
  addProgress: (entry: Omit<AgentProgressEntry, 'timestamp'>) => void
  setMemory: (memory: AgentMemory) => void
  clearProgress: () => void
  reset: () => void
}

export const useAgentStore = create<AgentState>((set) => ({
  running: false,
  currentPhase: null,
  currentGoal: null,
  lastPlan: null,
  progressLog: [],
  memory: null,
  lastTerminalCommands: [],

  setRunning: (running) => set({ running }),
  setPhase: (phase) => set({ currentPhase: phase }),
  setGoal: (goal) => set({ currentGoal: goal }),
  setPlan: (plan) => set({ lastPlan: plan }),
  addProgress: (entry) => set((s) => ({
    progressLog: [...s.progressLog, { ...entry, timestamp: Date.now() }].slice(-200),
    currentPhase: entry.phase,
  })),
  setMemory: (memory) => set({
    memory,
    currentGoal: memory.currentGoal,
    lastPlan: memory.lastPlan,
    lastTerminalCommands: memory.lastTerminalCommands,
  }),
  clearProgress: () => set({ progressLog: [], currentPhase: null }),
  reset: () => set({
    running: false,
    currentPhase: null,
    currentGoal: null,
    lastPlan: null,
    progressLog: [],
    memory: null,
    lastTerminalCommands: [],
  }),
}))
