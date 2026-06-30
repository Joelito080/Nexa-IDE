/**
 * Renderer-side workspace sync helpers.
 * Bridges Zustand app state with the main-process WorkspaceEngine.
 */
import { useAppStore } from '../store/appStore'
import { useWorkspaceStore } from '../store/workspaceStore'

export async function mountWorkspace(rootPath: string): Promise<void> {
  const snapshot = await window.electronAPI?.workspace.mount(rootPath)
  if (snapshot && !(snapshot as any).error) {
    useWorkspaceStore.getState().setSnapshot(snapshot as any)
  }
  useAppStore.getState().setRootPath(rootPath)
  useAppStore.getState().setCurrentFolder(rootPath)
}

export async function syncOpenFilesToEngine(): Promise<void> {
  const { openTabs } = useAppStore.getState()
  await window.electronAPI?.workspace.syncOpenFiles(openTabs)
}

export async function refreshWorkspaceTree(): Promise<void> {
  const { rootPath } = useAppStore.getState()
  if (!rootPath) return
  useWorkspaceStore.getState().setLoading(true)
  try {
    const result = await window.electronAPI?.workspace.loadTree()
    if (result && !(result as any).error) {
      useWorkspaceStore.getState().setSnapshot((result as any).snapshot)
    }
  } finally {
    useWorkspaceStore.getState().setLoading(false)
  }
}

export async function loadAgentMemory(): Promise<void> {
  const { rootPath } = useAppStore.getState()
  if (!rootPath) return
  const mem = await window.electronAPI?.agent.memory(rootPath)
  if (mem && !(mem as any).error) {
    const { useAgentStore } = await import('../store/agentStore')
    useAgentStore.getState().setMemory(mem as any)
  }
}
