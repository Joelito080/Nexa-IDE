import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

try {
  // eslint-disable-next-line no-console
  console.log('PRELOAD EXECUTED')
// Notify main process so execution shows in main logs as well
try {
  ipcRenderer.send('preload:executed')
} catch (e) {
  // ignore
}

// ─── Type Definitions ────────────────────────────────────────────────────────
// (mirrored in src/types/electron.d.ts for renderer TypeScript types)

type MaximizeCallback = (isMaximized: boolean) => void

// ─── Direct File System Access (non-sandboxed) ────────────────────────────
// When sandbox is disabled (dev mode), we read files directly in the preload
// context, eliminating the IPC roundtrip + structured-clone copy of file
// content strings. In sandboxed production mode we fall back to IPC.

type FileReadResult = { content: string } | { error: string }

const STREAM_CHUNK_SIZE = 65536 // 64 KB

function createDirectFileReader() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeFS = require('node:fs') as typeof import('fs')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeFSPromises = require('node:fs/promises') as typeof import('fs/promises')
    const { Buffer } = require('node:buffer') as typeof import('buffer')

    return {
      readFile: async (filePath: string): Promise<any> => {
        try {
          const content = await nodeFSPromises.readFile(filePath, 'utf-8')
          return { success: true, content }
        } catch (err) {
          return { success: false, error: (err as Error).message }
        }
      },

      readFileRange: async (filePath: string, offset: number, length: number): Promise<{ content: string; eof: boolean } | { error: string }> => {
        try {
          const handle = await nodeFSPromises.open(filePath, 'r')
          const buf = Buffer.alloc(length)
          const { bytesRead } = await handle.read(buf, 0, length, offset)
          await handle.close()
          const content = buf.toString('utf-8', 0, bytesRead)
          return { content, eof: bytesRead < length }
        } catch (err) {
          return { error: (err as Error).message }
        }
      },

      readFileStream: (filePath: string, callbacks: {
        onChunk: (chunk: string, progress: number) => void
        onDone: (fullContent: string) => void
        onError: (error: string) => void
      }): (() => void) => {
        const chunks: string[] = []
        let totalSize = 0

        try {
          const stream = nodeFS.createReadStream(filePath, {
            encoding: 'utf-8',
            highWaterMark: STREAM_CHUNK_SIZE,
          })

          stream.on('data', (chunk: string | Buffer) => {
            const str = typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
            chunks.push(str)
            totalSize += Buffer.byteLength(str, 'utf-8')
            callbacks.onChunk(str, totalSize)
          })

          stream.on('end', () => {
            const fullContent = chunks.join('')
            callbacks.onDone(fullContent)
          })

          stream.on('error', (err: Error) => {
            callbacks.onError(err.message)
          })

          return () => stream.destroy()
        } catch (err) {
          callbacks.onError((err as Error).message)
          return () => {}
        }
      },
    }
  } catch {
    return null
  }
}

const directReader = createDirectFileReader()

contextBridge.exposeInMainWorld('electron', {
  fs: {
    readFile: (filePath: string) => {
      console.log("Invoking readFile:", filePath)
      return directReader
        ? directReader.readFile(filePath)
        : ipcRenderer.invoke('fs:readFile', filePath)
    },
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    readDir: (dirPath: string) => ipcRenderer.invoke('fs:readDir', dirPath),
  },
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  saveFile: () => ipcRenderer.invoke('dialog:createFile'),
})

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Window Controls ────────────────────────────────────────────────────────
  window: {
    minimize: () =>
      ipcRenderer.send('window:minimize'),

    maximize: () =>
      ipcRenderer.send('window:maximize'),

    close: () =>
      ipcRenderer.send('window:close'),

    isMaximized: (): Promise<boolean> =>
      ipcRenderer.invoke('window:isMaximized'),

    /**
     * Subscribe to maximize/unmaximize events from the main process.
     * Returns an unsubscribe function — call it on component cleanup.
     */
    onMaximizedChange: (callback: MaximizeCallback) => {
      const handler = (_: IpcRendererEvent, isMaximized: boolean) =>
        callback(isMaximized)
      ipcRenderer.on('window:maximized', handler)
      return () => ipcRenderer.removeListener('window:maximized', handler)
    },

    onQuitRequest: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('app:quit-request', handler)
      return () => ipcRenderer.removeListener('app:quit-request', handler)
    },

    readyToQuit: () =>
      ipcRenderer.send('app:ready-to-quit'),
  },

  // ── File System ─────────────────────────────────────────────────────────────
    // Non-sandboxed (dev): reads happen directly in preload via `node:fs`,
    // avoiding IPC roundtrip and eliminating one full structured-clone copy.
    // Sandboxed (production): falls back to IPC `invoke` calls.
  fs: {
    stat:      (filePath: string)                    => ipcRenderer.invoke('fs:stat',     filePath),
    readDir:   (dirPath: string)                    => ipcRenderer.invoke('fs:readDir',   dirPath),
    readFile:  (filePath: string)                   => {
      console.log("Invoking readFile:", filePath);
      return directReader
        ? directReader.readFile(filePath)
        : ipcRenderer.invoke('fs:readFile', filePath);
    },
    readFileRange: (filePath: string, offset: number, length: number) => directReader
      ? directReader.readFileRange(filePath, offset, length)
      : ipcRenderer.invoke('fs:readFileChunk', filePath, offset, length),
    readFileStream: (
      filePath: string,
      callbacks: {
        onChunk: (chunk: string, progress: number) => void
        onDone: (fullContent: string) => void
        onError: (error: string) => void
      },
    ): (() => void) => {
      if (directReader) {
        return directReader.readFileStream(filePath, callbacks)
      }
      // Sandboxed fallback: single chunk via IPC (still avoids monolithic
      // main-process handler overhead; chunked IPC streaming can be added
      // alongside fs:readFileChunk when the main process handler is extended)
      ipcRenderer.invoke('fs:readFile', filePath).then((result: any) => {
        if (result && !('error' in result)) {
          callbacks.onChunk(result.content, result.content.length)
          callbacks.onDone(result.content)
        } else {
          callbacks.onError(result?.error ?? 'Read failed')
        }
      }).catch((err: Error) => callbacks.onError(err.message))
      return () => {}
    },
    readFileChunk: (filePath: string, offset: number, length: number) =>
      ipcRenderer.invoke('fs:readFileChunk', filePath, offset, length),
    writeFile: (filePath: string, content: string)  => ipcRenderer.invoke('fs:writeFile', filePath, content),
  },

  // ── AI — non-streaming + real SSE streaming ──────────────────────────────────
  ai: {
    /** Non-streaming single-shot chat request. */
    chat: (payload: unknown) => ipcRenderer.invoke('ai:chat', payload),

    /** Start a real streaming request.
     *  Returns { started: true, streamId } immediately.
     *  Chunks arrive via onChunk / onEnd / onError listeners. */
    streamStart: (payload: unknown) => ipcRenderer.invoke('ai:stream:start', payload),

    /** Cancel an active stream by its streamId. */
    streamStop: (streamId: string) => ipcRenderer.invoke('ai:stream:stop', streamId),

    /** Subscribe to individual text chunks.  Returns unsubscribe fn. */
    onChunk: (callback: (payload: { streamId: string; text: string }) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, payload: { streamId: string; text: string }) => callback(payload)
      ipcRenderer.on('ai:stream:chunk', handler)
      return () => ipcRenderer.removeListener('ai:stream:chunk', handler)
    },

    /** Subscribe to stream completion.  Returns unsubscribe fn. */
    onEnd: (callback: (payload: { streamId: string; fullText: string }) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, payload: { streamId: string; fullText: string }) => callback(payload)
      ipcRenderer.on('ai:stream:end', handler)
      return () => ipcRenderer.removeListener('ai:stream:end', handler)
    },

    /** Subscribe to stream errors.  Returns unsubscribe fn. */
    onError: (callback: (payload: { streamId: string; error: string }) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, payload: { streamId: string; error: string }) => callback(payload)
      ipcRenderer.on('ai:stream:error', handler)
      return () => ipcRenderer.removeListener('ai:stream:error', handler)
    },

    /** Fetch OpenRouter model catalog. */
    listModels: (forceRefresh?: boolean) =>
      ipcRenderer.invoke('ai:listModels', forceRefresh),

    /** Daily AI spend budget status (main process only holds the key). */
    getBudget: () => ipcRenderer.invoke('ai:getBudget'),

    /** Whether an OpenRouter key is configured (never returns the key). */
    isKeyConfigured: () => ipcRenderer.invoke('ai:isKeyConfigured'),
  },


  // ── Extension System ───────────────────────────────────────────────────────
  extension: {
    listInstalled: () => ipcRenderer.invoke('extension:listInstalled'),
    listMarketplace: (query?: string) => ipcRenderer.invoke('extension:listMarketplace', query),
    installLocal: () => ipcRenderer.invoke('extension:installLocal'),
    installMarketplace: (extensionId: string) => ipcRenderer.invoke('extension:installMarketplace', extensionId),
    enable: (extensionId: string) => ipcRenderer.invoke('extension:enable', extensionId),
    disable: (extensionId: string) => ipcRenderer.invoke('extension:disable', extensionId),
    uninstall: (extensionId: string) => ipcRenderer.invoke('extension:uninstall', extensionId),
    listCommands: () => ipcRenderer.invoke('extension:listCommands'),
    runCommand: (commandId: string, ...args: unknown[]) => ipcRenderer.invoke('extension:runCommand', commandId, ...args),
  },

  // ── Project Templates / Workspace Services ────────────────────────────────────
  project: {
    listTemplates: () => ipcRenderer.invoke('project:listTemplates'),
    findTemplate: (prompt: string) => ipcRenderer.invoke('project:findTemplate', prompt),
    create: (projectRoot: string, templateId: string, projectName: string) => ipcRenderer.invoke('project:create', projectRoot, templateId, projectName),
    installDependencies: (projectPath: string) => ipcRenderer.invoke('project:installDependencies', projectPath),
    analyzeWorkspace: (projectPath: string | null) => ipcRenderer.invoke('project:analyzeWorkspace', projectPath),
    createDeployConfig: (projectPath: string, provider: string) => ipcRenderer.invoke('project:createDeployConfig', projectPath, provider),
    clone: (repoUrl: string) => ipcRenderer.invoke('project:clone', repoUrl),
    new: () => ipcRenderer.invoke('project:new'),
  },

  license: {
    activate: (licenseKey: string) => ipcRenderer.invoke('license:activate', licenseKey),
    status: () => ipcRenderer.invoke('license:status'),
    refresh: () => ipcRenderer.invoke('license:refresh'),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
    canUseAI: () => ipcRenderer.invoke('license:canUseAI'),
    canCreateTemplate: (templateId: string) => ipcRenderer.invoke('license:canCreateTemplate', templateId),
    canInstallExtension: (manifest: any) => ipcRenderer.invoke('license:canInstallExtension', manifest),
    recordAIRequest: () => ipcRenderer.invoke('license:recordAIRequest'),
    recordTemplateUsage: (templateId?: string) => ipcRenderer.invoke('license:recordTemplateUsage', templateId),
    recordExtensionInstall: (info?: any) => ipcRenderer.invoke('license:recordExtensionInstall', info),
  },

  feedback: {
    submit: (feedback: string) => ipcRenderer.invoke('feedback:submit', feedback),
    openFolder: () => ipcRenderer.invoke('feedback:openFolder'),
  },

  premium: {
    addPromptEntry: (projectPath: string, prompt: string, response: string) => ipcRenderer.invoke('premium:addPromptEntry', projectPath, prompt, response),
    getPromptHistory: (projectPath: string) => ipcRenderer.invoke('premium:getPromptHistory', projectPath),
    saveSnippet: (projectPath: string, title: string, content: string) => ipcRenderer.invoke('premium:saveSnippet', projectPath, title, content),
    listSnippets: (projectPath: string) => ipcRenderer.invoke('premium:listSnippets', projectPath),
    removeSnippet: (projectPath: string, snippetId: string) => ipcRenderer.invoke('premium:removeSnippet', projectPath, snippetId),
  },

  // ── Auth Session (Phase 2) ─────────────────────────────────────────────────
  auth: {
    saveSession: (data: string) =>
      ipcRenderer.invoke('auth:saveSession', data),

    loadSession: (): Promise<string | null> =>
      ipcRenderer.invoke('auth:loadSession'),

    clearSession: (): Promise<void> =>
      ipcRenderer.invoke('auth:clearSession'),

    isEncryptionAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke('auth:isEncryptionAvailable'),
  },

  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (settings: Record<string, unknown>) => ipcRenderer.invoke('settings:save', settings),
  },

  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    getDiagnostics: (projectPath: string | null): Promise<any> =>
      ipcRenderer.invoke('app:getDiagnostics', { projectPath }),
    logRendererError: (projectPath: string | null, error: string, stack?: string): Promise<any> =>
      ipcRenderer.invoke('app:logRendererError', { projectPath, error, stack }),
    allowPath: (dirPath: string) => ipcRenderer.send('app:allowPath', dirPath),
  },

  logs: {
    openFolder: (projectPath: string | null): Promise<any> =>
      ipcRenderer.invoke('logs:openFolder', projectPath),
  },

  updater: {
    setChannel: (channel: string) => ipcRenderer.invoke('updater:setChannel', channel),
    getChannel: () => ipcRenderer.invoke('updater:getChannel'),
    checkForUpdates: (): Promise<any> => ipcRenderer.invoke('updater:check'),
  },

  // OAuth helpers
  oauth: {
    login: (): Promise<unknown> => ipcRenderer.invoke('oauth:login'),
  },

  search: {
    find: (projectPath: string, query: string, isRegex: boolean): Promise<{ searchId: string }> =>
      ipcRenderer.invoke('search:find', projectPath, query, isRegex),
    cancel: (searchId: string) =>
      ipcRenderer.send('search:cancel', searchId),
    onResult: (callback: (searchId: string, results: Array<{ file: string; line: number; text: string }>) => void) => {
      const handler = (_: IpcRendererEvent, searchId: string, results: Array<{ file: string; line: number; text: string }>) =>
        callback(searchId, results)
      ipcRenderer.on('search:result', handler)
      return () => ipcRenderer.removeListener('search:result', handler)
    },
    onDone: (callback: (searchId: string, totalResults: number) => void) => {
      const handler = (_: IpcRendererEvent, searchId: string, totalResults: number) =>
        callback(searchId, totalResults)
      ipcRenderer.on('search:done', handler)
      return () => ipcRenderer.removeListener('search:done', handler)
    },
    onError: (callback: (searchId: string, error: string) => void) => {
      const handler = (_: IpcRendererEvent, searchId: string, error: string) =>
        callback(searchId, error)
      ipcRenderer.on('search:error', handler)
      return () => ipcRenderer.removeListener('search:error', handler)
    },
  },

  send: (channel: string, data?: unknown) => ipcRenderer.send(channel, data),
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const handler = (_: IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  // ── Dialog helpers
  dialog: {
    openFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),
    createFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:createFile'),
  },

  external: {
    open: (url: string): Promise<boolean> => ipcRenderer.invoke('external:open', url),
  },

  // ── Terminal (node-pty + xterm.js) ───────────────────────────────────────
  terminal: {
    create: (cwd: string) => ipcRenderer.invoke('terminal:create', cwd),
    write: (sessionId: string, data: string) => ipcRenderer.invoke('terminal:write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) => ipcRenderer.invoke('terminal:resize', sessionId, cols, rows),
    killSession: (sessionId: string) => ipcRenderer.invoke('terminal:killSession', sessionId),
    runCommand: (sessionId: string, command: string) => ipcRenderer.invoke('terminal:runCommand', sessionId, command),
    platform: () => ipcRenderer.invoke('terminal:platform'),
    onData: (callback: (payload: { sessionId: string; data: string }) => void) => {
      const handler = (_: IpcRendererEvent, payload: { sessionId: string; data: string }) => callback(payload)
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.removeListener('terminal:data', handler)
    },
    onClose: (callback: (payload: { sessionId: string; code: number | null }) => void) => {
      const handler = (_: IpcRendererEvent, payload: { sessionId: string; code: number | null }) => callback(payload)
      ipcRenderer.on('terminal:close', handler)
      return () => ipcRenderer.removeListener('terminal:close', handler)
    },
    onCommand: (callback: (payload: { sessionId: string; command: string }) => void) => {
      const handler = (_: IpcRendererEvent, payload: { sessionId: string; command: string }) => callback(payload)
      ipcRenderer.on('terminal:command', handler)
      return () => ipcRenderer.removeListener('terminal:command', handler)
    },
  },

  workspace: {
    mount: (rootPath: string | null) => ipcRenderer.invoke('workspace:mount', rootPath),
    snapshot: () => ipcRenderer.invoke('workspace:snapshot'),
    listFiles: () => ipcRenderer.invoke('workspace:listFiles'),
    loadTree: (dirPath?: string) => ipcRenderer.invoke('workspace:loadTree', dirPath),
    setCwd: (cwd: string | null) => ipcRenderer.invoke('workspace:setCwd', cwd),
    syncOpenFiles: (files: string[]) => ipcRenderer.invoke('workspace:syncOpenFiles', files),
    setRoot: (rootPath: string | null) => ipcRenderer.invoke('workspace:setRoot', rootPath),
    getRoot: () => ipcRenderer.invoke('workspace:getRoot'),
  },

  agent: {
    run: (payload: unknown) => ipcRenderer.invoke('agent:run', payload),
    memory: (projectPath: string | null) => ipcRenderer.invoke('agent:memory', projectPath),
    tool: (payload: unknown) => ipcRenderer.invoke('agent:tool', payload),
    onProgress: (callback: (event: { phase: string; message: string; detail?: string }) => void) => {
      const handler = (_: IpcRendererEvent, event: { phase: string; message: string; detail?: string }) => callback(event)
      ipcRenderer.on('agent:progress', handler)
      return () => ipcRenderer.removeListener('agent:progress', handler)
    },
  },

  opencode: {
    detect: () => ipcRenderer.invoke('opencode:detect'),
    run: (prompt: string, projectPath: string) => ipcRenderer.invoke('opencode:run', { prompt, projectPath }),
    cancel: (sessionId: string) => ipcRenderer.invoke('opencode:cancel', sessionId),
    onOutput: (callback: (payload: { sessionId: string; text: string }) => void) => {
      const handler = (_: IpcRendererEvent, payload: { sessionId: string; text: string }) => callback(payload)
      ipcRenderer.on('opencode:output', handler)
      return () => ipcRenderer.removeListener('opencode:output', handler)
    },
    onStatus: (callback: (payload: { sessionId: string; status: string }) => void) => {
      const handler = (_: IpcRendererEvent, payload: { sessionId: string; status: string }) => callback(payload)
      ipcRenderer.on('opencode:status', handler)
      return () => ipcRenderer.removeListener('opencode:status', handler)
    },
    onError: (callback: (payload: { sessionId: string; error: string }) => void) => {
      const handler = (_: IpcRendererEvent, payload: { sessionId: string; error: string }) => callback(payload)
      ipcRenderer.on('opencode:error', handler)
      return () => ipcRenderer.removeListener('opencode:error', handler)
    },
    onDone: (callback: (payload: { sessionId: string; exitCode: number | null }) => void) => {
      const handler = (_: IpcRendererEvent, payload: { sessionId: string; exitCode: number | null }) => callback(payload)
      ipcRenderer.on('opencode:done', handler)
      return () => ipcRenderer.removeListener('opencode:done', handler)
    },
  },

  diff: {
    compute: (filePath: string, newContent: string) => ipcRenderer.invoke('diff:compute', { filePath, newContent }),
    apply: (filePath: string, newContent: string, sessionId: string, task: string) => ipcRenderer.invoke('diff:apply', { filePath, newContent, sessionId, task }),
    getBackups: (projectPath: string) => ipcRenderer.invoke('diff:getBackups', projectPath),
    rollback: (backupPath: string) => ipcRenderer.invoke('diff:rollback', backupPath),
    rollbackLast: (projectPath: string) => ipcRenderer.invoke('diff:rollbackLast', projectPath),
    deleteBackup: (backupPath: string) => ipcRenderer.invoke('diff:deleteBackup', backupPath),
  },

  db: {
    connect: (uri: string) => ipcRenderer.invoke('db:connect', uri),
    disconnect: () => ipcRenderer.invoke('db:disconnect'),
    listDatabases: () => ipcRenderer.invoke('db:listDatabases'),
    listCollections: (dbName: string) => ipcRenderer.invoke('db:listCollections', dbName),
  },

  git: {
    // Combined status (branch + summary string) — existing handler
    status: (projectPath: string) => ipcRenderer.invoke('git:status', projectPath),
    // Full file-level changed files
    changedFiles: (projectPath: string) => ipcRenderer.invoke('git:changedFiles', projectPath),
    // Staging
    stageFile: (projectPath: string, filePath: string) => ipcRenderer.invoke('git:stageFile', projectPath, filePath),
    unstageFile: (projectPath: string, filePath: string) => ipcRenderer.invoke('git:unstageFile', projectPath, filePath),
    stageAll: (projectPath: string) => ipcRenderer.invoke('git:stageAll', projectPath),
    // Committing
    commitStaged: (projectPath: string, message: string) => ipcRenderer.invoke('git:commitStaged', projectPath, message),
    commitAll: (projectPath: string, message: string) => ipcRenderer.invoke('git:commitAll', projectPath, message),
    // Diff
    fileDiff: (projectPath: string, filePath: string, staged: boolean) => ipcRenderer.invoke('git:fileDiff', projectPath, filePath, staged),
    fileContent: (projectPath: string, filePath: string, ref: string) => ipcRenderer.invoke('git:fileContent', projectPath, filePath, ref),
    // History
    log: (projectPath: string, limit?: number) => ipcRenderer.invoke('git:log', projectPath, limit ?? 50),
    // Branches
    listBranches: (projectPath: string) => ipcRenderer.invoke('git:listBranches', projectPath),
    checkoutBranch: (projectPath: string, branch: string) => ipcRenderer.invoke('git:checkoutBranch', projectPath, branch),
    createBranch: (projectPath: string, name: string, checkout: boolean) => ipcRenderer.invoke('git:createBranch', projectPath, name, checkout),
    deleteBranch: (projectPath: string, name: string, force: boolean) => ipcRenderer.invoke('git:deleteBranch', projectPath, name, force),
    // Discard
    discardFile: (projectPath: string, filePath: string, untracked: boolean) => ipcRenderer.invoke('git:discardFile', projectPath, filePath, untracked),
    // Commit details, restore, checkout commit
    commitFiles: (projectPath: string, commitHash: string) => ipcRenderer.invoke('git:commitFiles', projectPath, commitHash),
    restoreFile: (projectPath: string, commitHash: string, filePath: string) => ipcRenderer.invoke('git:restoreFile', projectPath, commitHash, filePath),
    checkoutCommit: (projectPath: string, commitHash: string) => ipcRenderer.invoke('git:checkoutCommit', projectPath, commitHash),
    // Legacy (keep for backwards compat)
    pull: (projectPath: string) => ipcRenderer.invoke('git:pull', projectPath),
    push: (projectPath: string) => ipcRenderer.invoke('git:push', projectPath),
    getConfig: (projectPath?: string) => ipcRenderer.invoke('git:getConfig', projectPath),
    setConfig: (projectPath: string | undefined, name: string, email: string) => ipcRenderer.invoke('git:setConfig', projectPath, name, email),
  },
})
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('PRELOAD ERROR:', err)
}
