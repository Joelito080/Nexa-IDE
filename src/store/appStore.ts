import { create } from 'zustand'
import type { LicenseStatus } from '../types/license'
import { clearAllLargeFileStatuses } from '../lib/fileCache'

export type SidebarTab = 'explorer' | 'search' | 'git' | 'debug' | 'extensions' | 'settings' | 'database'
export type AIProvider = 'openrouter' | 'free-agent'
export type UpdateChannel = 'beta' | 'stable'

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
  cursorPositions:    Record<string, { line: number; column: number }>

  // ── AI Quick Actions ────────────────────────────────────────────────────
  pendingAiPrompt:   string | null
  setPendingAiPrompt: (prompt: string | null) => void

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
  setCursorPositions: (positions: Record<string, { line: number; column: number }>) => void
  updateCursorPosition: (filePath: string, line: number, column: number) => void
  
  addNotification:   (message: string, type?: NotificationType) => void
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
  aiModel:          'openai/gpt-4o',
  openCodePathOverride: '',
  openrouterKeyConfigured: false,
  openrouterModel:  'openai/gpt-4o',
  gitUsername:      '',
  gitEmail:         '',
  workspaceRestore: true,
  telemetryEnabled: false,
  saveState:        'Saved',
  expandedFolders:  {},
  unsavedChanges: {},
  terminalHistory: '',
  aiChatHistory: [],
  cursorPositions: {},

  // ── Actions ───────────────────────────────────────────────────────────────
  toggleSidebar:     () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleAIPanel:     () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  toggleBottomPanel: () => set((s) => ({ bottomPanelOpen: !s.bottomPanelOpen })),
  setSidebarTab:     (tab) => set({ activeSidebarTab: tab }),
  setSidebarOpen:    (open) => set({ sidebarOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
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
  setCursorPositions: (positions) => set({ cursorPositions: positions }),
  updateCursorPosition: (filePath, line, column) => set((s) => ({
    cursorPositions: { ...s.cursorPositions, [filePath]: { line, column } }
  })),
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
  addNotification:   (message, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    set((state) => {
      const next = [...state.notifications, { id, type, message }]
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
