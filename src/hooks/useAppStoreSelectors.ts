/**
 * Sliced Zustand selectors for fine-grained store subscriptions.
 * These prevent unnecessary re-renders by selecting only specific store slices.
 * 
 * Usage:
 *   const sidebarOpen = useAppStoreSidebarOpen()     // re-render only when sidebarOpen changes
 *   const layout = useAppStoreLayout()               // re-render only when layout fields change
 */

import { useMemo } from 'react'
import { useAppStore } from '../store/appStore'

// ── Layout selectors ──────────────────────────────────────────────────────
export const useAppStoreSidebarOpen = () =>
  useAppStore((s) => s.sidebarOpen)

export const useAppStoreAIPanelOpen = () =>
  useAppStore((s) => s.aiPanelOpen)

export const useAppStoreBottomPanelOpen = () =>
  useAppStore((s) => s.bottomPanelOpen)

export const useAppStoreActiveSidebarTab = () =>
  useAppStore((s) => s.activeSidebarTab)

export const useAppStoreIsMaximized = () =>
  useAppStore((s) => s.isMaximized)

export const useAppStoreCommandPaletteOpen = () =>
  useAppStore((s) => s.commandPaletteOpen)

/**
 * Compound selector for all layout state.
 * Use when multiple layout fields need to be accessed together.
 */
export const useAppStoreLayout = () =>
  useAppStore(
    (s) => ({
      sidebarOpen: s.sidebarOpen,
      aiPanelOpen: s.aiPanelOpen,
      bottomPanelOpen: s.bottomPanelOpen,
      activeSidebarTab: s.activeSidebarTab,
      isMaximized: s.isMaximized,
      commandPaletteOpen: s.commandPaletteOpen,
    }),
    (a, b) => a.sidebarOpen === b.sidebarOpen &&
              a.aiPanelOpen === b.aiPanelOpen &&
              a.bottomPanelOpen === b.bottomPanelOpen &&
              a.activeSidebarTab === b.activeSidebarTab &&
              a.isMaximized === b.isMaximized &&
              a.commandPaletteOpen === b.commandPaletteOpen
  )

// ── Explorer/Editor selectors ─────────────────────────────────────────────
export const useAppStoreRootPath = () =>
  useAppStore((s) => s.rootPath)

export const useAppStoreCurrentFolder = () =>
  useAppStore((s) => s.currentFolder)

export const useAppStoreExplorerEntries = () =>
  useAppStore((s) => s.explorerEntries)

export const useAppStoreSelectedFilePath = () =>
  useAppStore((s) => s.selectedFilePath)

export const useAppStoreOpenTabs = () =>
  useAppStore((s) => s.openTabs)

/**
 * Compound selector for explorer state
 */
export const useAppStoreExplorer = () =>
  useAppStore(
    (s) => ({
      rootPath: s.rootPath,
      currentFolder: s.currentFolder,
      explorerEntries: s.explorerEntries,
      selectedFilePath: s.selectedFilePath,
    }),
    (a, b) => a.rootPath === b.rootPath &&
              a.currentFolder === b.currentFolder &&
              a.explorerEntries === b.explorerEntries &&
              a.selectedFilePath === b.selectedFilePath
  )

/**
 * Compound selector for editor state
 */
export const useAppStoreEditor = () =>
  useAppStore(
    (s) => ({
      selectedFilePath: s.selectedFilePath,
      openTabs: s.openTabs,
    }),
    (a, b) => a.selectedFilePath === b.selectedFilePath &&
              a.openTabs === b.openTabs
  )

// ── Git / Search selectors ────────────────────────────────────────────────
export const useAppStoreGitBranch = () =>
  useAppStore((s) => s.gitBranch)

export const useAppStoreGitStatusSummary = () =>
  useAppStore((s) => s.gitStatusSummary)

export const useAppStoreSearchQuery = () =>
  useAppStore((s) => s.searchQuery)

export const useAppStoreSearchResults = () =>
  useAppStore((s) => s.searchResults)

/**
 * Compound selector for git state
 */
export const useAppStoreGit = () =>
  useAppStore(
    (s) => ({
      gitBranch: s.gitBranch,
      gitStatusSummary: s.gitStatusSummary,
    }),
    (a, b) => a.gitBranch === b.gitBranch &&
              a.gitStatusSummary === b.gitStatusSummary
  )

/**
 * Compound selector for search state
 */
export const useAppStoreSearch = () =>
  useAppStore(
    (s) => ({
      searchQuery: s.searchQuery,
      searchResults: s.searchResults,
    }),
    (a, b) => a.searchQuery === b.searchQuery &&
              a.searchResults === b.searchResults
  )

// ── Settings / UI State selectors ─────────────────────────────────────────
export const useAppStoreAIProvider = () =>
  useAppStore((s) => s.aiProvider)

export const useAppStoreUpdateChannel = () =>
  useAppStore((s) => s.updateChannel)

export const useAppStoreTelemetryEnabled = () =>
  useAppStore((s) => s.telemetryEnabled)

export const useAppStoreLicenseStatus = () =>
  useAppStore((s) => s.licenseStatus)

export const useAppStoreLicenseLoading = () =>
  useAppStore((s) => s.licenseLoading)

export const useAppStoreLicensePanelOpen = () =>
  useAppStore((s) => s.licensePanelOpen)

export const useAppStoreShortcutsModalOpen = () =>
  useAppStore((s) => s.shortcutsModalOpen)

export const useAppStoreIsLoading = () =>
  useAppStore((s) => s.isLoading)

export const useAppStoreNotifications = () =>
  useAppStore((s) => s.notifications)

export const useAppStoreModal = () =>
  useAppStore((s) => s.modal)

/**
 * Compound selector for license/auth state
 */
export const useAppStoreLicense = () =>
  useAppStore(
    (s) => ({
      licenseStatus: s.licenseStatus,
      licenseLoading: s.licenseLoading,
      licensePanelOpen: s.licensePanelOpen,
    }),
    (a, b) => a.licenseStatus === b.licenseStatus &&
              a.licenseLoading === b.licenseLoading &&
              a.licensePanelOpen === b.licensePanelOpen
  )

// ── Action selectors ─────────────────────────────────────────────────────
/**
 * Get all action creators as a memoized group.
 * Use for components that need multiple actions but don't care about state.
 */
export const useAppStoreActions = () =>
  useMemo(
    () => ({
      toggleSidebar: useAppStore.getState().toggleSidebar,
      toggleAIPanel: useAppStore.getState().toggleAIPanel,
      toggleBottomPanel: useAppStore.getState().toggleBottomPanel,
      setSidebarTab: useAppStore.getState().setSidebarTab,
      setSidebarOpen: useAppStore.getState().setSidebarOpen,
      setAIPanelOpen: useAppStore.getState().setAIPanelOpen,
      setBottomPanelOpen: useAppStore.getState().setBottomPanelOpen,
      setCommandPaletteOpen: useAppStore.getState().setCommandPaletteOpen,
      setCommandPaletteMode: useAppStore.getState().setCommandPaletteMode,
      requestAIPanelFocus: useAppStore.getState().requestAIPanelFocus,
      requestTerminalFocus: useAppStore.getState().requestTerminalFocus,
      setMaximized: useAppStore.getState().setMaximized,
      setLoading: useAppStore.getState().setLoading,
      setRootPath: useAppStore.getState().setRootPath,
      setCurrentFolder: useAppStore.getState().setCurrentFolder,
      setExplorerEntries: useAppStore.getState().setExplorerEntries,
      setSelectedFilePath: useAppStore.getState().setSelectedFilePath,
      setSelectedLineNumber: useAppStore.getState().setSelectedLineNumber,

      setOpenTabs: useAppStore.getState().setOpenTabs,
      setGitBranch: useAppStore.getState().setGitBranch,
      setGitStatusSummary: useAppStore.getState().setGitStatusSummary,
      setSearchQuery: useAppStore.getState().setSearchQuery,
      setSearchResults: useAppStore.getState().setSearchResults,
      addNotification: useAppStore.getState().addNotification,
      removeNotification: useAppStore.getState().removeNotification,
      openModal: useAppStore.getState().openModal,
      closeModal: useAppStore.getState().closeModal,
      setLicenseStatus: useAppStore.getState().setLicenseStatus,
      setLicenseLoading: useAppStore.getState().setLicenseLoading,
      setLicensePanelOpen: useAppStore.getState().setLicensePanelOpen,
      setShortcutsModalOpen: useAppStore.getState().setShortcutsModalOpen,
      clearProject: useAppStore.getState().clearProject,
      setEditorTheme: useAppStore.getState().setEditorTheme,
      setEditorFontSize: useAppStore.getState().setEditorFontSize,
      setEditorTabSize: useAppStore.getState().setEditorTabSize,
      setEditorWordWrap: useAppStore.getState().setEditorWordWrap,
      setAiModel: useAppStore.getState().setAiModel,
      setOpenCodePathOverride: useAppStore.getState().setOpenCodePathOverride,
      setOpenrouterKeyConfigured: useAppStore.getState().setOpenrouterKeyConfigured,
      setOpenrouterModel: useAppStore.getState().setOpenrouterModel,
      setGitUsername: useAppStore.getState().setGitUsername,
      setGitEmail: useAppStore.getState().setGitEmail,
      setWorkspaceRestore: useAppStore.getState().setWorkspaceRestore,
      setTelemetryEnabled: useAppStore.getState().setTelemetryEnabled,
      setUnsavedChanges: useAppStore.getState().setUnsavedChanges,
      setTerminalHistory: useAppStore.getState().setTerminalHistory,
      setAiChatHistory: useAppStore.getState().setAiChatHistory,
      setCursorPositions: useAppStore.getState().setCursorPositions,
      updateCursorPosition: useAppStore.getState().updateCursorPosition,
    }),
    []
  )
