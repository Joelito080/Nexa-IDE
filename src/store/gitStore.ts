import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GitFileStatus {
  path: string
  /** Single character: M=modified, A=added, D=deleted, R=renamed, ?=untracked */
  status: string
}

export interface GitCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  email: string
  date: string
}

export type GitView = 'changes' | 'history' | 'branches'

// ── State ─────────────────────────────────────────────────────────────────────

interface GitState {
  // Working tree
  staged: GitFileStatus[]
  unstaged: GitFileStatus[]
  untracked: string[]

  // History
  commits: GitCommit[]

  // Branches
  branches: string[]
  currentBranch: string

  // UI
  isLoading: boolean
  activeView: GitView
  selectedFile: string | null
  selectedFileIsStaged: boolean
  commitMessage: string

  // ── Actions ────────────────────────────────────────────────────────────────
  setActiveView: (view: GitView) => void
  setSelectedFile: (path: string | null, staged: boolean) => void
  setCommitMessage: (msg: string) => void
  setIsLoading: (loading: boolean) => void
  setChanges: (staged: GitFileStatus[], unstaged: GitFileStatus[], untracked: string[]) => void
  setCommits: (commits: GitCommit[]) => void
  setBranches: (branches: string[], current: string) => void
  clearSelection: () => void
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useGitStore = create<GitState>((set) => ({
  staged: [],
  unstaged: [],
  untracked: [],
  commits: [],
  branches: [],
  currentBranch: '',
  isLoading: false,
  activeView: 'changes',
  selectedFile: null,
  selectedFileIsStaged: false,
  commitMessage: '',

  setActiveView: (view) => set({ activeView: view, selectedFile: null }),
  setSelectedFile: (path, staged) => set({ selectedFile: path, selectedFileIsStaged: staged }),
  setCommitMessage: (msg) => set({ commitMessage: msg }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setChanges: (staged, unstaged, untracked) => set({ staged, unstaged, untracked }),
  setCommits: (commits) => set({ commits }),
  setBranches: (branches, current) => set({ branches, currentBranch: current }),
  clearSelection: () => set({ selectedFile: null }),
}))

// ── Async Helpers ──────────────────────────────────────────────────────────────

/** Load changed files (staged, unstaged, untracked) into the git store */
export async function refreshGitChanges(projectPath: string): Promise<void> {
  const store = useGitStore.getState()
  store.setIsLoading(true)
  try {
    const res = await window.electronAPI?.git.changedFiles(projectPath)
    if (res && !('error' in res)) {
      store.setChanges(res.staged, res.unstaged, res.untracked)
    }
  } finally {
    store.setIsLoading(false)
  }
}

/** Load last 50 commits into the git store */
export async function refreshGitLog(projectPath: string): Promise<void> {
  const store = useGitStore.getState()
  try {
    const res = await window.electronAPI?.git.log(projectPath, 50)
    if (res && !('error' in res)) {
      store.setCommits(res.commits)
    }
  } catch {
    // non-fatal
  }
}

/** Load all branches into the git store */
export async function refreshGitBranches(projectPath: string): Promise<void> {
  const store = useGitStore.getState()
  try {
    const res = await window.electronAPI?.git.listBranches(projectPath)
    if (res && !('error' in res)) {
      store.setBranches(res.branches, res.current)
    }
  } catch {
    // non-fatal
  }
}

/** Full refresh — changes + log + branches */
export async function refreshAll(projectPath: string): Promise<void> {
  await Promise.all([
    refreshGitChanges(projectPath),
    refreshGitLog(projectPath),
    refreshGitBranches(projectPath),
  ])
}
