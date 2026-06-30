import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import * as crypto from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEARCH_TIMEOUT = 3000

export interface SearchResult {
  file: string
  line: number
  text: string
}

export interface SearchOptions {
  projectPath: string
  query: string
  isRegex?: boolean
  maxResults?: number
  onResult?: (result: SearchResult) => void
  signal?: AbortSignal
}

export function searchFiles(options: SearchOptions): Promise<SearchResult[]> {
  return new Promise((resolve) => {
    const { projectPath, query, isRegex, maxResults = 5000, onResult, signal } = options
    const searchId = crypto.randomUUID()
    const results: SearchResult[] = []
    let worker: Worker | null = null
    let settled = false

    const finish = (res: SearchResult[]) => {
      if (settled) return
      settled = true
      if (worker) worker.terminate()
      resolve(res)
    }

    const timeout = setTimeout(() => finish(results), SEARCH_TIMEOUT)

    worker = new Worker(join(__dirname, 'searchWorker.js'), {
      workerData: { searchId, projectPath, query, isRegex: !!isRegex, maxResults },
    })

    worker.on('message', (msg: any) => {
      if (settled) return
      if (msg.type === 'result') {
        for (const r of msg.results) {
          if (results.length >= maxResults) { finish(results); return }
          results.push(r)
          onResult?.(r)
        }
      } else if (msg.type === 'done') {
        finish(results)
      } else if (msg.type === 'error') {
        finish(results)
      }
    })

    worker.on('error', () => finish(results))
    worker.on('exit', () => finish(results))

    if (signal) {
      const onAbort = () => { signal.removeEventListener('abort', onAbort); finish(results) }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}
