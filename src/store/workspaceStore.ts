import { create } from 'zustand'

export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  children?: FileTreeNode[]
}

export interface WorkspaceSnapshot {
  rootPath: string | null
  projectRoot: string | null
  cwd: string | null
  fileTree: FileTreeNode[]
  openFiles: string[]
  recentFiles: string[]
  detectedType: string | null
  packageManager: 'npm' | 'pnpm' | 'yarn' | null
  summary: string
}

interface WorkspaceState {
  projectRoot: string | null
  cwd: string | null
  fileTree: FileTreeNode[]
  recentFiles: string[]
  detectedType: string | null
  packageManager: 'npm' | 'pnpm' | 'yarn' | null
  summary: string
  loading: boolean

  setSnapshot: (snapshot: WorkspaceSnapshot) => void
  setCwd: (cwd: string | null) => void
  setLoading: (loading: boolean) => void
  reset: () => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  projectRoot: null,
  cwd: null,
  fileTree: [],
  recentFiles: [],
  detectedType: null,
  packageManager: null,
  summary: 'No workspace',
  loading: false,

  setSnapshot: (snapshot) => set({
    projectRoot: snapshot.projectRoot,
    cwd: snapshot.cwd,
    fileTree: snapshot.fileTree,
    recentFiles: snapshot.recentFiles,
    detectedType: snapshot.detectedType,
    packageManager: snapshot.packageManager,
    summary: snapshot.summary,
    loading: false,
  }),
  setCwd: (cwd) => set({ cwd }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({
    projectRoot: null,
    cwd: null,
    fileTree: [],
    recentFiles: [],
    detectedType: null,
    packageManager: null,
    summary: 'No workspace',
    loading: false,
  }),
}))
