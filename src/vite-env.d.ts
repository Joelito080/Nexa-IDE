/// <reference types="vite/client" />

import type { LicenseStatus } from './types/license'

interface ImportMetaEnv {
  readonly VITE_BILLING_URL?: string
  readonly VITE_SUPPORT_DOCS_URL?: string
  readonly VITE_SUPPORT_EMAIL?: string
  readonly VITE_DISCORD_INVITE_URL?: string
  readonly VITE_FEEDBACK_WEBHOOK_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Global type declarations for the NEXA IDE renderer process.
 * The electronAPI object is injected by electron/preload.ts via contextBridge.
 */

interface ElectronWindowAPI {
  minimize: () => void
  maximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void
  onQuitRequest: (callback: () => void) => () => void
  readyToQuit: () => void
}

interface FileReadResult {
  success: true
  content: string
  error?: never
  truncated?: boolean
  totalSize?: number
}

interface FileReadError {
  success: false
  error: string
  content?: never
  truncated?: never
  totalSize?: never
}

type FileReadResponse = FileReadResult | FileReadError

interface FileChunkResult {
  content: string
  eof: boolean
  error?: never
}

interface FileChunkError {
  content?: never
  eof?: never
  error: string
}

type FileChunkResponse = FileChunkResult | FileChunkError

interface ReadFileStreamCallbacks {
  onChunk: (chunk: string, progress: number) => void
  onDone: (fullContent: string) => void
  onError: (error: string) => void
}

interface FileStatResult {
  size: number
  isDirectory: boolean
  isFile: boolean
  mtimeMs: number
  birthtimeMs: number
}

interface FileStatError {
  error: string
}

type FileStatResponse = FileStatResult | FileStatError

interface ElectronFsAPI {
  stat: (filePath: string) => Promise<FileStatResponse>
  readDir: (dirPath: string) => Promise<unknown>
  readFile: (filePath: string) => Promise<FileReadResponse>
  readFileRange: (filePath: string, offset: number, length: number) => Promise<FileChunkResponse>
  readFileStream: (filePath: string, callbacks: ReadFileStreamCallbacks) => () => void
  readFileChunk: (filePath: string, offset: number, length: number) => Promise<FileChunkResponse>
  writeFile: (filePath: string, content: string) => Promise<unknown>
}

interface ElectronAiAPI {
  /** Non-streaming single-shot chat. */
  chat: (payload: unknown) => Promise<unknown>
  /** Start a real SSE stream. Returns { started, streamId }. */
  streamStart: (payload: unknown) => Promise<{ started: boolean; streamId: string } | { error: string }>
  /** Cancel an active stream by id. */
  streamStop: (streamId: string) => Promise<{ cancelled: boolean; streamId: string }>
  /** Subscribe to text chunks. Returns unsubscribe fn. */
  onChunk: (callback: (payload: { streamId: string; text: string }) => void) => () => void
  /** Subscribe to stream end. Returns unsubscribe fn. */
  onEnd: (callback: (payload: { streamId: string; fullText: string; metrics?: any }) => void) => () => void
  /** Subscribe to stream errors. Returns unsubscribe fn. */
  onError: (callback: (payload: { streamId: string; error: string }) => void) => () => void
  /** List OpenRouter models. */
  listModels: (forceRefresh?: boolean) => Promise<{ error?: string; models: any[] }>
  /** Daily spend budget from main process. */
  getBudget: () => Promise<{ date?: string; dailySpend: number; limit: number; error?: string }>
  /** Key configured flag — never exposes the secret. */
  isKeyConfigured: () => Promise<{ configured: boolean; fromEnv: boolean }>
}

interface ElectronExtensionAPI {
  listInstalled: () => Promise<unknown>
  listMarketplace: (query?: string) => Promise<unknown>
  installLocal: () => Promise<unknown>
  installMarketplace: (extensionId: string) => Promise<unknown>
  enable: (extensionId: string) => Promise<unknown>
  disable: (extensionId: string) => Promise<unknown>
  uninstall: (extensionId: string) => Promise<unknown>
  listCommands: () => Promise<unknown>
  runCommand: (commandId: string, ...args: any[]) => Promise<unknown>
}

interface ElectronProjectAPI {
  listTemplates: () => Promise<unknown>
  findTemplate: (prompt: string) => Promise<unknown>
  create: (projectRoot: string, templateId: string, projectName: string) => Promise<unknown>
  installDependencies: (projectPath: string) => Promise<unknown>
  analyzeWorkspace: (projectPath: string | null) => Promise<unknown>
  createDeployConfig: (projectPath: string, provider: string) => Promise<unknown>
  clone: (repoUrl: string) => Promise<unknown>
  new: () => Promise<unknown>
}

interface ElectronLicenseAPI {
  activate: (licenseKey: string) => Promise<LicenseStatus | { error: string }>
  status: () => Promise<LicenseStatus>
  refresh: () => Promise<LicenseStatus>
  deactivate: () => Promise<LicenseStatus>
  canUseAI: () => Promise<boolean>
  canCreateTemplate: (templateId: string) => Promise<boolean>
  canInstallExtension: (manifest: any) => Promise<boolean>
  recordAIRequest: () => Promise<LicenseStatus>
  recordTemplateUsage: (templateId?: string) => Promise<LicenseStatus>
  recordExtensionInstall: (info?: any) => Promise<LicenseStatus>
}

interface ElectronPremiumAPI {
  addPromptEntry: (projectPath: string, prompt: string, response: string) => Promise<unknown>
  getPromptHistory: (projectPath: string) => Promise<unknown>
  saveSnippet: (projectPath: string, title: string, content: string) => Promise<unknown>
  listSnippets: (projectPath: string) => Promise<unknown>
  removeSnippet: (projectPath: string, snippetId: string) => Promise<unknown>
}

interface ElectronSettingsAPI {
  load: () => Promise<unknown>
  save: (settings: unknown) => Promise<unknown>
}

interface ElectronAppAPI {
  getVersion: () => Promise<string>
  getDiagnostics: (projectPath: string | null) => Promise<any>
  logRendererError: (projectPath: string | null, error: string, stack?: string) => Promise<any>
  allowPath: (dirPath: string) => void
}

interface ElectronLogsAPI {
  openFolder: (projectPath: string | null) => Promise<any>
}

interface ElectronUpdaterAPI {
  setChannel: (channel: string) => Promise<unknown>
  getChannel: () => Promise<unknown>
  checkForUpdates: () => Promise<any>
}

interface ElectronFeedbackAPI {
  submit: (feedback: string) => Promise<unknown>
  openFolder: () => Promise<unknown>
}

interface ElectronTerminalAPI {
  create: (cwd: string) => Promise<{ id: string; shell: string; cwd: string; mode: string } | { error: string }>
  write: (sessionId: string, data: string) => Promise<{ success: boolean; error?: string }>
  resize: (sessionId: string, cols: number, rows: number) => Promise<{ success: boolean }>
  killSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  runCommand: (sessionId: string, command: string) => Promise<{ success: boolean; error?: string }>
  platform: () => Promise<{ platform: string; shell: string; homedir: string }>
  spawn: (command: string, cwd: string) => Promise<unknown>
  kill: (pid: number | string) => Promise<unknown>
  onData: (callback: (payload: { sessionId: string; data: string }) => void) => () => void
  onClose: (callback: (payload: { sessionId: string; code: number | null }) => void) => () => void
  onCommand: (callback: (payload: { sessionId: string; command: string }) => void) => () => void
}

interface ElectronWorkspaceAPI {
  mount: (rootPath: string | null) => Promise<unknown>
  snapshot: () => Promise<unknown>
  listFiles: () => Promise<unknown>
  loadTree: (dirPath?: string) => Promise<unknown>
  setCwd: (cwd: string | null) => Promise<unknown>
  syncOpenFiles: (files: string[]) => Promise<unknown>
  setRoot: (rootPath: string | null) => Promise<unknown>
  getRoot: () => Promise<unknown>
}

interface ElectronAgentAPI {
  run: (payload: unknown) => Promise<unknown>
  memory: (projectPath: string | null) => Promise<unknown>
  tool: (payload: unknown) => Promise<unknown>
  onProgress: (callback: (event: { phase: string; message: string; detail?: string }) => void) => () => void
}

interface ElectronAuthAPI {
  saveSession: (data: string) => Promise<void>
  loadSession: () => Promise<string | null>
  clearSession: () => Promise<void>
  isEncryptionAvailable: () => Promise<boolean>
}

interface ElectronDialogAPI {
  openFolder: () => Promise<string | null>
  createFile: () => Promise<string | null>
}

interface ElectronExternalAPI {
  open: (url: string) => Promise<boolean>
}

interface ElectronSearchAPI {
  find: (projectPath: string, query: string, isRegex: boolean) => Promise<{ searchId: string }>
  cancel: (searchId: string) => void
  onResult: (callback: (searchId: string, results: Array<{ file: string; line: number; text: string }>) => void) => () => void
  onDone: (callback: (searchId: string, totalResults: number) => void) => () => void
  onError: (callback: (searchId: string, error: string) => void) => () => void
}

interface GitFileStatus {
  path: string
  status: string
}

interface GitCommitEntry {
  hash: string
  shortHash: string
  message: string
  author: string
  email: string
  date: string
}

interface ElectronGitAPI {
  status: (projectPath: string) => Promise<{ branch: string; statusSummary: string } | { error: string }>
  changedFiles: (projectPath: string) => Promise<{ staged: GitFileStatus[]; unstaged: GitFileStatus[]; untracked: string[] } | { error: string }>
  stageFile: (projectPath: string, filePath: string) => Promise<{ success: true } | { error: string }>
  unstageFile: (projectPath: string, filePath: string) => Promise<{ success: true } | { error: string }>
  stageAll: (projectPath: string) => Promise<{ success: true } | { error: string }>
  commitStaged: (projectPath: string, message: string) => Promise<{ success: true; hash: string } | { error: string }>
  commitAll: (projectPath: string, message: string) => Promise<{ success: true; hash: string } | { error: string }>
  fileDiff: (projectPath: string, filePath: string, staged: boolean) => Promise<{ diff: string } | { error: string }>
  fileContent: (projectPath: string, filePath: string, ref: string) => Promise<{ content: string } | { error: string }>
  log: (projectPath: string, limit?: number) => Promise<{ commits: GitCommitEntry[] } | { error: string }>
  listBranches: (projectPath: string) => Promise<{ branches: string[]; current: string } | { error: string }>
  checkoutBranch: (projectPath: string, branch: string) => Promise<{ success: true } | { error: string }>
  createBranch: (projectPath: string, name: string, checkout: boolean) => Promise<{ success: true } | { error: string }>
  deleteBranch: (projectPath: string, name: string, force: boolean) => Promise<{ success: true } | { error: string }>
  discardFile: (projectPath: string, filePath: string, untracked: boolean) => Promise<{ success: true } | { error: string }>
  commitFiles: (projectPath: string, commitHash: string) => Promise<{ files: GitFileStatus[] } | { error: string }>
  restoreFile: (projectPath: string, commitHash: string, filePath: string) => Promise<{ success: true } | { error: string }>
  checkoutCommit: (projectPath: string, commitHash: string) => Promise<{ success: true } | { error: string }>
  pull: (projectPath: string) => Promise<unknown>
  push: (projectPath: string) => Promise<unknown>
  getConfig: (projectPath?: string) => Promise<{ name: string; email: string } | { error: string }>
  setConfig: (projectPath: string | undefined, name: string, email: string) => Promise<{ success: true } | { error: string }>
}

interface ElectronAPI {
  send: (channel: string, data?: any) => void
  invoke: (channel: string, ...args: any[]) => Promise<any>
  on: (channel: string, callback: (...args: any[]) => void) => () => void
  window: ElectronWindowAPI
  auth: ElectronAuthAPI
  oauth: {
    login: () => Promise<unknown>
    isConfigured: () => Promise<boolean>
  }
  dialog: ElectronDialogAPI
  external: ElectronExternalAPI
  fs: ElectronFsAPI
  ai: ElectronAiAPI
  extension: ElectronExtensionAPI
  project: ElectronProjectAPI
  license: ElectronLicenseAPI
  feedback: ElectronFeedbackAPI
  premium: ElectronPremiumAPI
  terminal: ElectronTerminalAPI
  workspace: ElectronWorkspaceAPI
  agent: ElectronAgentAPI
  settings: ElectronSettingsAPI
  app: ElectronAppAPI
  logs: ElectronLogsAPI
  updater: ElectronUpdaterAPI
  search: ElectronSearchAPI
  opencode: ElectronOpenCodeAPI
  diff: ElectronDiffAPI
  git: ElectronGitAPI
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  oldLineNum: number | null
  newLineNum: number | null
  content: string
}

interface FileDiff {
  filePath: string
  lines: DiffLine[]
  oldContent: string
  newContent: string
}

interface BackupEntry {
  filePath: string
  backupPath: string
  timestamp: string
  sessionId: string
  task: string
}

interface ApplyResult {
  success: boolean
  backupPath: string | null
  error?: string
}

interface ElectronDiffAPI {
  compute: (filePath: string, newContent: string) => Promise<FileDiff>
  apply: (filePath: string, newContent: string, sessionId: string, task: string) => Promise<ApplyResult>
  getBackups: (projectPath: string) => Promise<BackupEntry[]>
  rollback: (backupPath: string) => Promise<boolean>
  rollbackLast: (projectPath: string) => Promise<BackupEntry | null>
  deleteBackup: (backupPath: string) => Promise<boolean>
}

interface ElectronOpenCodeAPI {
  detect: () => Promise<{ installed: boolean; path: string | null; version: string | null }>
  run: (prompt: string, projectPath: string) => Promise<string>
  cancel: (sessionId: string) => Promise<boolean>
  onOutput: (callback: (payload: { sessionId: string; text: string }) => void) => () => void
  onStatus: (callback: (payload: { sessionId: string; status: string }) => void) => () => void
  onError: (callback: (payload: { sessionId: string; error: string }) => void) => () => void
  onDone: (callback: (payload: { sessionId: string; exitCode: number | null }) => void) => () => void
}

interface ElectronDialogAPI {
  openFolder: () => Promise<string | null>
  createFile: () => Promise<string | null>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}

