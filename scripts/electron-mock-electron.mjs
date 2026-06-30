export const app = {
  getPath(name) {
    if (name === 'userData') {
      return new URL('./.nexus-ide-user-data', import.meta.url).pathname
    }
    return new URL(`./${name}`, import.meta.url).pathname
  },
}

export const safeStorage = {
  isEncryptionAvailable() { return false }
}

export class BrowserWindow {
  constructor() {}
  loadURL() {}
  on() {}
}

export const dialog = {
  showErrorBox() {}
}

export const ipcMain = {
  handle() {}
}

export const shell = {
  openExternal() {}
}

export const contextBridge = {
  exposeInMainWorld() {}
}

export const IpcRendererEvent = class {}
