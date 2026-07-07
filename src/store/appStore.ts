import { create } from 'zustand'
import type { LicenseStatus } from '../types/license'
import { clearAllLargeFileStatuses } from '../lib/fileCache'

export type SidebarTab = 'explorer' | 'search' | 'git' | 'debug' | 'extensions' | 'settings' | 'database'
export type ExtensionsPanelTab = 'installed' | 'marketplace' | 'quarantined'
export type AIProvider = 'openrouter' | 'free-agent'
export type UpdateChannel = 'beta' | 'stable' | 'nightly'

export interface ExplorerEntry {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
}

export interface TreeNode {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  children?: TreeNode[]
}

export interface SearchResult {
  file: string
  line: number
  text: string
}
export interface TelemetryCounts {
  appLaunches: number
  foldersOpened: number
  projectsCreated: number
  aiRequests: number
  feedbackSubmitted: number
}

export interface AiSessionTokenMetrics {
  inputTokens: number
  outputTokens: number
  timestamp: string
}

export interface AiSessionState {
  history: any[]
  systemPrompt: string
  showSystemPrompt: boolean
  showUserPrompt: boolean
  showSelectedFile: boolean
  showAttachedFiles: boolean
  showImportedFiles: boolean
  showWorkspaceContext: boolean
  temperature: number
  maxTokens: number
  topP: number
  attachedFiles: string[]
  tokenHistory: AiSessionTokenMetrics[]
}
export const buildAiSessionKey = (provider: AIProvider, model: string) => `${provider}:${model}`

export const DEFAULT_AI_SESSION_STATE: AiSessionState = {
  history: [],
  systemPrompt: 'You are Nexa Assistant, an advanced software engineering AI inside Nexa IDE. Help users build full applications, write production-ready code, fix bugs, explain code, refactor files, optimize performance, and debug errors. Always return complete working code when asked. Be concise but useful. Think step-by-step before coding.',
  showSystemPrompt: true,
  showUserPrompt: true,
  showSelectedFile: true,
  showAttachedFiles: true,
  showImportedFiles: true,
  showWorkspaceContext: true,
  temperature: 0.5,
  maxTokens: 1024,
  topP: 1,
  attachedFiles: [],
  tokenHistory: [],
}

export const createDefaultAiSessionState = (): AiSessionState => ({
  ...DEFAULT_AI_SESSION_STATE,
  history: [],
  attachedFiles: [],
  tokenHistory: [],
})

export const getAiSessionState = (state: Pick<AppState, 'aiSessionCache'>, provider: AIProvider, model: string): AiSessionState => {
  return state.aiSessionCache[buildAiSessionKey(provider, model)] ?? DEFAULT_AI_SESSION_STATE
}

export type ModalType = 'prompt' | 'confirm'

interface BaseModal {
  id: string
  type: ModalType
  title: string
  message?: string
  confirmText: string
  cancelText: string
}

export interface PromptModal extends BaseModal {
  type: 'prompt'
  placeholder?: string
  defaultValue?: string
  resolve: (value: string | null) => void
}

export interface ConfirmModal extends BaseModal {
  type: 'confirm'
  resolve: (value: boolean) => void
}

export type ModalState = PromptModal | ConfirmModal

type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface Notification {
  id: string
  type: NotificationType
  message: string
  actions?: { label: string; handler: () => void }[]
}

interface AppState {
  // ── Layout ────────────────────────────────────────────────────────────────
  sidebarOpen:       boolean
  aiPanelOpen:       boolean
  activeSidebarTab:  SidebarTab
  bottomPanelOpen:   boolean
  commandPaletteOpen: boolean
  commandPaletteMode: 'command' | 'file'
  aiPanelFocusRequest: number
  terminalFocusRequest: number
  activeExtensionsPanelTab: ExtensionsPanelTab
  extensionsPanelTargetExtensionId: string | null
  setExtensionsPanelTab: (tab: ExtensionsPanelTab) => void
  setExtensionsPanelTargetExtensionId: (id: string | null) => void

  // ── Explorer / Editor ─────────────────────────────────────────────────────
  rootPath:           string | null
  currentFolder:      string | null
  explorerEntries:    ExplorerEntry[]
  selectedFilePath:   string | null
  selectedLineNumber: number | null
  openTabs:           string[]
  setOpenTabs:        (tabs: string[]) => void

  // ── Git / Search ───────────────────────────────────────────────────────────
  gitBranch:          string
  gitStatusSummary:   string
  searchQuery:        string
  searchResults:      SearchResult[]

  // ── Database ───────────────────────────────────────────────────────────────
  dbConnected:        boolean
  dbDatabases:        any[]
  setDbConnected:     (connected: boolean) => void
  setDbDatabases:     (databases: any[]) => void

  // ── Beta / Product Settings ─────────────────────────────────────────────────
  firstRunComplete:   boolean
  aiProvider:         AIProvider
  updateChannel:      UpdateChannel
  telemetry:          TelemetryCounts

  // ── Window ──────────────────────────────────────────────────────────────
  isMaximized:       boolean

  // ── Preferences / Settings ──────────────────────────────────────────────────
  editorTheme:        'vs-dark' | 'light' | 'hc-black'
  editorFontSize:     number
  editorTabSize:      number
  editorWordWrap:     'on' | 'off'
  editorMinimap:      'on' | 'off'
  aiModel:            string
  openCodePathOverride: string
  openrouterKeyConfigured: boolean
  openrouterModel:    string
  gitUsername:        string
  gitEmail:           string
  workspaceRestore:   boolean
  telemetryEnabled:   boolean
  saveState:          'Saved' | 'Saving...' | 'Failed'
  expandedFolders:    Record<string, boolean>

  // ── Crash Recovery ─────────────────────────────────────────────────────────
  unsavedChanges:     Record<string, string>
  terminalHistory:    string
  aiChatHistory:      any[]
  aiSessionCache:     Record<string, AiSessionState>
  cursorPositions:    Record<string, { line: number; column: number }>
  aiRecoveryPending:  boolean
  aiHealthState:      any
  aiHealthSettings:   any
  // ── AI Quick Actions ────────────────────────────────────────────────────
  pendingAiPrompt:   string | null
  setPendingAiPrompt: (prompt: string | null) => void

  // AI Health
  setAiHealthState: (state: any) => void
  setAiHealthSettings: (settings: any) => void

  // ── UI State ──────────────────────────────────────────────────────────────
  setLicenseStatus:  (status: LicenseStatus | null) => void
  setLicenseLoading: (loading: boolean) => void
  licensePanelOpen:  boolean
  setLicensePanelOpen: (open: boolean) => void
  shortcutsModalOpen: boolean
  setShortcutsModalOpen: (open: boolean) => void
  isLoading:         boolean
  notifications:     Notification[]
  modal:             ModalState | null
  licenseStatus:     LicenseStatus | null
  licenseLoading:    boolean

  // ── Actions ───────────────────────────────────────────────────────────────
  toggleSidebar:     () => void
  toggleAIPanel:     () => void
  toggleBottomPanel: () => void
  setSidebarTab:     (tab: SidebarTab) => void
  setSidebarOpen:    (open: boolean) => void
  setAIPanelOpen:    (open: boolean) => void
  setBottomPanelOpen: (open: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  setCommandPaletteMode: (mode: 'command' | 'file') => void
  requestAIPanelFocus: () => void
  requestTerminalFocus: () => void
  setMaximized:      (isMaximized: boolean) => void
  setLoading:        (loading: boolean) => void
  setRootPath:       (rootPath: string | null) => void
  setCurrentFolder:  (folder: string | null) => void
  setExplorerEntries:(entries: ExplorerEntry[]) => void
  setSelectedFilePath:(filePath: string | null) => void
  setSelectedLineNumber:(line: number | null) => void
  setGitBranch:      (branch: string) => void
  setGitStatusSummary:(summary: string) => void
  setSearchQuery:    (query: string) => void
  setSearchResults:  (results: SearchResult[]) => void
  setFirstRunComplete: (complete: boolean) => void
  setAIProvider:      (provider: AIProvider) => void
  setUpdateChannel:   (channel: UpdateChannel) => void
  setTelemetry:       (telemetry: TelemetryCounts) => void
  recordTelemetryEvent: (event: keyof TelemetryCounts) => void

  setEditorTheme:     (theme: 'vs-dark' | 'light' | 'hc-black') => void
  setEditorFontSize:  (size: number) => void
  setEditorTabSize:   (size: number) => void
  setEditorWordWrap:  (wrap: 'on' | 'off') => void
  setEditorMinimap:   (minimap: 'on' | 'off') => void
  setAiModel:         (model: string) => void
  setOpenCodePathOverride: (path: string) => void
  setOpenrouterKeyConfigured: (configured: boolean) => void
  setOpenrouterModel:  (model: string) => void
  setGitUsername:     (username: string) => void
  setGitEmail:        (email: string) => void
  setWorkspaceRestore: (restore: boolean) => void
  setTelemetryEnabled: (enabled: boolean) => void
  setUnsavedChanges:  (changes: Record<string, string>) => void
  setTerminalHistory: (history: string) => void
  setSaveState:       (state: 'Saved' | 'Saving...' | 'Failed') => void
  setExpandedFolders: (folders: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
  setAiChatHistory:   (history: any[] | ((prev: any[]) => any[])) => void
  setAiSessionCache:  (cache: Record<string, AiSessionState>) => void
  updateAiSession:    (key: string, update: Partial<AiSessionState>) => void
  setAiSessionHistory:(key: string, history: any[]) => void
  setCursorPositions: (positions: Record<string, { line: number; column: number }>) => void
  updateCursorPosition: (filePath: string, line: number, column: number) => void
  setAiRecoveryPending: (pending: boolean) => void
  
  addNotification:   (message: string, type?: NotificationType, actions?: { label: string; handler: () => void }[]) => void
  removeNotification: (id: string) => void
  openModal:         (modal: ModalState | null) => void
  closeModal:        () => void
  clearProject:      () => void
}

export const useAppStore = create<AppState>((set) => ({
  // ── Initial State ─────────────────────────────────────────────────────────
  sidebarOpen:      true,
  aiPanelOpen:      true,
  activeSidebarTab: 'explorer',
  bottomPanelOpen:  false,
  commandPaletteOpen: false,
  commandPaletteMode: 'command',
  aiPanelFocusRequest: 0,
  terminalFocusRequest: 0,
  activeExtensionsPanelTab: 'installed',
  extensionsPanelTargetExtensionId: null,
  rootPath:         null,
  currentFolder:    null,
  explorerEntries:  [],
  selectedFilePath: null,
  selectedLineNumber: null,
  openTabs:         [],
  dbConnected:      false,
  dbDatabases:      [],
  gitBranch:        'main',
  gitStatusSummary:'No repository',
  searchQuery:      '',
  searchResults:    [],
  firstRunComplete: false,
  aiProvider:       'openrouter',
  updateChannel:    'beta',
  telemetry: {
    appLaunches: 0,
    foldersOpened: 0,
    projectsCreated: 0,
    aiRequests: 0,
    feedbackSubmitted: 0,
  },
  licenseStatus:    null,
  licenseLoading:   false,
  licensePanelOpen: false,
  shortcutsModalOpen: false,
  isMaximized:      false,
  isLoading:        false,
  notifications:    [],
  modal:            null,
  pendingAiPrompt:  null,
  editorTheme:      'vs-dark',
  editorFontSize:   13,
  editorTabSize:    4,
  editorWordWrap:   'on',
  editorMinimap:    'on',
  aiModel:          'deepseek/deepseek-chat:free',
  openCodePathOverride: '',
  openrouterKeyConfigured: false,
  openrouterModel:  'deepseek/deepseek-chat:free',
  gitUsername:      '',
  gitEmail:         '',
  workspaceRestore: true,
  telemetryEnabled: false,
  saveState:        'Saved',
  expandedFolders:  {},
  unsavedChanges: {},
  terminalHistory: '',
  aiChatHistory: [],  aiSessionCache: {},  cursorPositions: {},
  aiRecoveryPending: false,
  aiHealthState: {},
  // AI health settings (user-customizable)
  aiHealthSettings: {
    thresholds: {
      tokenPressure: { green: 0.6, yellow: 0.85, red: 1.0 },
      latency: { green: 2, yellow: 5, red: 10 },
      errors: { green: 0, yellow: 2, red: 3 },
      resets: { green: 0, yellow: 3, red: 6 },
    },
    weights: {
      tokenPressure: 0.5,
      latency: 0.3,
      errors: 0.15,
      resets: 0.05,
    },
  },

  // ── Actions ───────────────────────────────────────────────────────────────
  toggleSidebar:     () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleAIPanel:     () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  toggleBottomPanel: () => set((s) => ({ bottomPanelOpen: !s.bottomPanelOpen })),
  setSidebarTab:     (tab: SidebarTab) => set({ activeSidebarTab: tab }),
  setSidebarOpen:    (open: boolean) => set({ sidebarOpen: open }),
  setExtensionsPanelTab: (tab: ExtensionsPanelTab) => set({ activeExtensionsPanelTab: tab }),
  setExtensionsPanelTargetExtensionId: (id: string | null) => set({ extensionsPanelTargetExtensionId: id }),
  setCommandPaletteOpen: (open: boolean) => set({ commandPaletteOpen: open }),
  setCommandPaletteMode: (mode) => set({ commandPaletteMode: mode }),
  requestAIPanelFocus: () => set((s) => ({ aiPanelFocusRequest: s.aiPanelFocusRequest + 1 })),
  requestTerminalFocus: () => set((s) => ({ terminalFocusRequest: s.terminalFocusRequest + 1 })),
  setAIPanelOpen:    (open) => set({ aiPanelOpen: open }),
  setBottomPanelOpen:(open) => set({ bottomPanelOpen: open }),
  setPendingAiPrompt:(prompt) => set({ pendingAiPrompt: prompt }),
  setMaximized:      (isMaximized) => set({ isMaximized }),
  setLoading:        (loading) => set({ isLoading: loading }),
  setRootPath:       (rootPath) => set({ rootPath }),
  setCurrentFolder:  (folder) => set({ currentFolder: folder }),
  setExplorerEntries:(entries) => set({ explorerEntries: entries }),
  setSelectedFilePath:(filePath) => set({ selectedFilePath: filePath }),
  setSelectedLineNumber:(line) => set({ selectedLineNumber: line }),
  setOpenTabs:       (tabs) => set({ openTabs: tabs.slice(0, 50) }),
  setGitBranch:      (branch) => set({ gitBranch: branch }),
  setGitStatusSummary:(summary) => set({ gitStatusSummary: summary }),
  setSearchQuery:    (query) => set({ searchQuery: query }),
  setSearchResults:  (results) => set({ searchResults: results.slice(0, 500) }), // Limit to 500 to prevent UI lag
  setDbConnected:    (connected) => set({ dbConnected: connected }),
  setDbDatabases:    (databases) => set({ dbDatabases: databases }),
  setFirstRunComplete: (complete) => set({ firstRunComplete: complete }),
  setAIProvider:      (provider) => set({ aiProvider: provider }),
  setUpdateChannel:   (channel) => set({ updateChannel: channel }),
  setEditorTheme:     (theme) => set({ editorTheme: theme }),
  setEditorFontSize:  (size) => set({ editorFontSize: size }),
  setEditorTabSize:   (size) => set({ editorTabSize: size }),
  setEditorWordWrap:  (wrap) => set({ editorWordWrap: wrap }),
  setEditorMinimap:   (minimap) => set({ editorMinimap: minimap }),
  setAiModel:         (model) => set({ aiModel: model }),
  setOpenCodePathOverride: (path) => set({ openCodePathOverride: path }),
  setOpenrouterKeyConfigured: (configured) => set({ openrouterKeyConfigured: configured }),
  setOpenrouterModel:  (model) => set({ openrouterModel: model }),
  setGitUsername:     (username) => set({ gitUsername: username }),
  setGitEmail:        (email) => set({ gitEmail: email }),
  setWorkspaceRestore: (restore) => set({ workspaceRestore: restore }),
  setTelemetryEnabled: (enabled) => set({ telemetryEnabled: enabled }),
  setUnsavedChanges:  (unsaved) => set({ unsavedChanges: unsaved }),
  setTerminalHistory: (history) => set({ terminalHistory: history }),
  setSaveState:       (state) => set({ saveState: state }),
  setExpandedFolders: (folders) => set((s) => ({
    expandedFolders: typeof folders === 'function' ? folders(s.expandedFolders) : folders,
  })),
  setAiChatHistory:   (history) => set((s) => ({
    aiChatHistory: typeof history === 'function' ? history(s.aiChatHistory) : history,
  })),
  setAiSessionCache:  (cache) => set({ aiSessionCache: cache }),
  updateAiSession:    (key, update) => set((s) => ({
    aiSessionCache: {
      ...s.aiSessionCache,
      [key]: {
        ...(s.aiSessionCache[key] ?? createDefaultAiSessionState()),
        ...update,
      },
    },
  })),
  setAiSessionHistory: (key, history) => set((s) => ({
    aiSessionCache: {
      ...s.aiSessionCache,
      [key]: {
        ...(s.aiSessionCache[key] ?? createDefaultAiSessionState()),
        history,
      },
    },
  })),
  setCursorPositions: (positions) => set({ cursorPositions: positions }),
  updateCursorPosition: (filePath, line, column) => set((s) => ({
    cursorPositions: { ...s.cursorPositions, [filePath]: { line, column } }
  })),
  setAiRecoveryPending: (pending) => set({ aiRecoveryPending: pending }),
  setAiHealthState: (state) => set({ aiHealthState: state }),
  setAiHealthSettings: (settings) => set({ aiHealthSettings: { ...(useAppStore.getState().aiHealthSettings || {}), ...(settings || {}) } }),
  recordTelemetryEvent: (event) => set((state) => ({
    telemetry: {
      ...state.telemetry,
      [event]: state.telemetry[event] + 1,
    },
  })),
  setLicenseStatus:  (status) => set({ licenseStatus: status }),
  setLicenseLoading: (loading) => set({ licenseLoading: loading }),
  setLicensePanelOpen: (open) => set({ licensePanelOpen: open }),
  setShortcutsModalOpen: (open) => set({ shortcutsModalOpen: open }),
  setTelemetry:      (telemetry) => set({ telemetry }),
  addNotification:   (message, type = 'info', actions) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    set((state) => {
      const next = [...state.notifications, { id, type, message, actions }]
      return { notifications: next.length > 20 ? next.slice(-20) : next }
    })
    setTimeout(() => {
      set((state) => ({ notifications: state.notifications.filter((note) => note.id !== id) }))
    }, 4500)
  },
  removeNotification: (id) => set((state) => ({ notifications: state.notifications.filter((note) => note.id !== id) })),
  openModal:         (modal) => set({ modal }),
  closeModal:        () => set({ modal: null }),
  clearProject:      () => {
    clearAllLargeFileStatuses()
    set({
      rootPath: null,
      currentFolder: null,
      explorerEntries: [],
      selectedFilePath: null,
      gitBranch: 'main',
      gitStatusSummary: 'No repository',
      searchQuery: '',
      searchResults: [],
      unsavedChanges: {},
      terminalHistory: '',
      aiChatHistory: [],
      cursorPositions: {},
    })
  },
}))
