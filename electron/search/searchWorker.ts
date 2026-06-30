import { parentPort, workerData } from 'worker_threads'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import ignore from 'ignore'

const BINARY_EXT = /\.(png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|svg|exe|dll|so|dylib|zip|tar|gz|rar|7z|pdf|o|obj|pyc|class|wasm)$/i
const DEFAULT_IGNORE = ['.git', 'node_modules', 'dist', 'build', 'release', '.next', '.cache', '.husky']
const MAX_FILE_SIZE = 5 * 1024 * 1024
const STREAM_THRESHOLD = 100 * 1024
const MAX_REGEX_LENGTH = 30
const YIELD_EVERY = 50
const CONCURRENCY = 8
const BATCH_SIZE = 50

interface SearchRequest {
  searchId: string
  projectPath: string
  query: string
  isRegex: boolean
  maxResults: number
}

let _searchId = ''

function flush(batch: Array<{ file: string; line: number; text: string }>) {
  if (batch.length) { parentPort?.postMessage({ type: 'result', searchId: _searchId, results: [...batch] }); batch.length = 0 }
}

async function walk(
  dir: string,
  projectPath: string,
  ig: ReturnType<typeof ignore>,
  results: Array<{ file: string; line: number; text: string }>,
  batch: Array<{ file: string; line: number; text: string }>,
  maxResults: number,
  yieldCounter: { count: number },
  test: (line: string) => boolean,
): Promise<void> {
  if (results.length >= maxResults) return
  let entries
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return }

  const filtered = entries.filter((e) => {
    if (e.name.startsWith('.') && e.name !== '.env.example') return false
    if (e.isDirectory() && DEFAULT_IGNORE.includes(e.name)) return false
    const relPath = path.relative(projectPath, path.join(dir, e.name)).replace(/\\/g, '/')
    if (ig.ignores(relPath)) return false
    return true
  })

  for (let i = 0; i < filtered.length; i += CONCURRENCY) {
    if (results.length >= maxResults) { flush(batch); return }
    const chunk = filtered.slice(i, i + CONCURRENCY)

    await Promise.all(chunk.map(async (entry) => {
      if (results.length >= maxResults) return
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        await walk(fullPath, projectPath, ig, results, batch, maxResults, yieldCounter, test)
        return
      }

      if (BINARY_EXT.test(entry.name)) return

      try {
        const stat = await fs.promises.stat(fullPath)
        if (stat.size > MAX_FILE_SIZE) return

        if (stat.size > STREAM_THRESHOLD) {
          const rl = readline.createInterface({ input: fs.createReadStream(fullPath, { encoding: 'utf-8' }), crlfDelay: Infinity })
          let lineNum = 0
          for await (const line of rl) {
            if (results.length >= maxResults) { rl.close(); break }
            if (test(line)) {
              const result = { file: fullPath, line: lineNum + 1, text: line.trim().slice(0, 200) }
              results.push(result); batch.push(result)
              if (batch.length >= BATCH_SIZE) flush(batch)
            }
            lineNum++
          }
        } else {
          const content = await fs.promises.readFile(fullPath, 'utf-8')
          const lines = content.split('\n')
          for (let i = 0; i < lines.length; i++) {
            if (results.length >= maxResults) break
            if (test(lines[i])) {
              const result = { file: fullPath, line: i + 1, text: lines[i].trim().slice(0, 200) }
              results.push(result); batch.push(result)
              if (batch.length >= BATCH_SIZE) flush(batch)
            }
          }
        }
      } catch { /* skip */ }

      yieldCounter.count++
    }))

    if (yieldCounter.count >= YIELD_EVERY) {
      await new Promise((resolve) => setImmediate(resolve))
      yieldCounter.count = 0
    }
  }
}

async function run() {
  const req = workerData as SearchRequest
  _searchId = req.searchId
  const results: Array<{ file: string; line: number; text: string }> = []
  const batch: Array<{ file: string; line: number; text: string }> = []
  const yieldCounter = { count: 0 }

  try {
    const ig = ignore().add(DEFAULT_IGNORE)
    try {
      ig.add(await fs.promises.readFile(path.join(req.projectPath, '.gitignore'), 'utf-8'))
    } catch { /* no .gitignore */ }

    if (!req.isRegex) {
      const lowerQuery = req.query.toLowerCase()
      await walk(req.projectPath, req.projectPath, ig, results, batch, req.maxResults, yieldCounter, (line) => line.toLowerCase().includes(lowerQuery))
    } else if (!isSafeRegex(req.query)) {
      parentPort?.postMessage({ type: 'error', searchId: req.searchId, error: `Regex too complex or unsafe (max ${MAX_REGEX_LENGTH} chars, no nested quantifiers)` })
      return
    } else {
      const regex = new RegExp(req.query, 'gi')
      await walk(req.projectPath, req.projectPath, ig, results, batch, req.maxResults, yieldCounter, (line) => { regex.lastIndex = 0; return regex.test(line) })
    }

    flush(batch)
    parentPort?.postMessage({ type: 'done', searchId: req.searchId, totalResults: results.length })
  } catch (err) {
    parentPort?.postMessage({ type: 'error', searchId: req.searchId, error: (err as Error).message })
  }
}

function isSafeRegex(pattern: string): boolean {
  if (pattern.length > MAX_REGEX_LENGTH) return false
  let depth = 0
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '\\') { i++; continue }
    if (ch === '(') depth++
    else if (ch === ')') { depth--; if (depth < 0) return false }
    else if ((ch === '+' || ch === '*' || ch === '?') && depth > 0) return false
    else if (ch === '{' && depth > 0) return false
  }
  return depth === 0
}

run()
