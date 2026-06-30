import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const require = createRequire(import.meta.url)
const electronBin = require('electron')
const devUrls = ['http://127.0.0.1:5174/', 'http://localhost:5174/']
const devUrl = devUrls[0]

// Cursor/VS Code inject ELECTRON_RUN_AS_NODE=1; Electron must run in browser mode.
const devEnv = { ...process.env }
delete devEnv.ELECTRON_RUN_AS_NODE
delete devEnv.ATOM_SHELL_INTERNAL_RUN_AS_NODE

let vite = null
let electronProc = null

const shutdown = (code = 0) => {
  if (electronProc && !electronProc.killed) electronProc.kill()
  if (vite && !vite.killed) vite.kill()
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

const isServerUp = () =>
  new Promise((resolve) => {
    let index = 0
    const checkNext = () => {
      const url = devUrls[index] || devUrl
      const req = http.get(url, (res) => {
        res.resume()
        if (res.statusCode === 200) {
          resolve(true)
        } else {
          index += 1
          if (index < devUrls.length) {
            checkNext()
          } else {
            resolve(false)
          }
        }
      })
      req.on('error', () => {
        index += 1
        if (index < devUrls.length) {
          checkNext()
        } else {
          resolve(false)
        }
      })
      req.setTimeout(2000, () => {
        req.destroy()
        index += 1
        if (index < devUrls.length) {
          checkNext()
        } else {
          resolve(false)
        }
      })
    }
    checkNext()
  })

const waitForDevServer = (timeoutMs = 60000) =>
  new Promise((resolve, reject) => {
    const started = Date.now()
    const poll = async () => {
      if (await isServerUp()) {
        resolve()
        return
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for ${devUrl}`))
        return
      }
      setTimeout(poll, 500)
    }
    poll()
  })

try {
  if (await isServerUp()) {
    console.log('[dev-electron] Reusing existing Vite server on :5174')
  } else {
    vite = spawn(
      process.execPath,
      [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', '5174', '--strictPort', 'true'],
      { cwd: root, stdio: 'inherit', env: devEnv },
    )
    vite.on('exit', (code) => {
      if (electronProc) shutdown(code ?? 0)
      else shutdown(code ?? 0)
    })
    await waitForDevServer()
  }

  electronProc = spawn(electronBin, ['.'], {
    cwd: root,
    stdio: 'inherit',
    env: devEnv,
  })
  electronProc.on('exit', (code) => shutdown(code ?? 0))
} catch (err) {
  console.error('[dev-electron]', err.message)
  shutdown(1)
}
