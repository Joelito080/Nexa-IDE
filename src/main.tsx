import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import '@xterm/xterm/css/xterm.css'
import { useAppStore } from './store/appStore'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

// Configure Monaco Environment to use local Web Workers bundled via Vite
;(window as any).MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === 'json') {
      return new Worker(new URL('../node_modules/monaco-editor/esm/vs/language/json/json.worker?worker', import.meta.url), { type: 'module' })
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new Worker(new URL('../node_modules/monaco-editor/esm/vs/language/css/css.worker?worker', import.meta.url), { type: 'module' })
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new Worker(new URL('../node_modules/monaco-editor/esm/vs/language/html/html.worker?worker', import.meta.url), { type: 'module' })
    }
    if (label === 'typescript' || label === 'javascript') {
      return new Worker(new URL('../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker?worker', import.meta.url), { type: 'module' })
    }
    return new Worker(new URL('../node_modules/monaco-editor/esm/vs/editor/editor.worker?worker', import.meta.url), { type: 'module' })
  }
}

// Point @monaco-editor/react to the local monaco-editor instance instead of CDN
loader.config({ monaco })
;(window as any).monaco = monaco

// Debug: log availability of electronAPI at renderer startup
// eslint-disable-next-line no-console
console.log('renderer: window.electronAPI ->', (window as any).electronAPI)

window.addEventListener('error', (event) => {
  const rootPath = useAppStore.getState().rootPath
  const errorMsg = event.error ? event.error.message : event.message
  const stack = event.error ? event.error.stack : ''
  window.electronAPI?.app.logRendererError(rootPath, `Uncaught Error: ${errorMsg}`, stack).catch(() => {})
})

window.addEventListener('unhandledrejection', (event) => {
  const rootPath = useAppStore.getState().rootPath
  const reason = event.reason
  const errorMsg = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : ''
  window.electronAPI?.app.logRendererError(rootPath, `Unhandled Rejection: ${errorMsg}`, stack).catch(() => {})
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
