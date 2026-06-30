import { useAppStore } from '../store/appStore'

/**
 * Fetch git branch + status in a single combined IPC call.
 * Results are cached server-side for 30s.
 */
export async function loadGitStatus(folderPath: string): Promise<void> {
  const result = await window.electronAPI?.invoke('git:status', folderPath)
  if (!result || (result as any).error) return
  const { branch, statusSummary } = result as { branch: string; statusSummary: string }
  const state = useAppStore.getState()
  state.setGitBranch(branch || 'main')
  state.setGitStatusSummary(statusSummary)
}
