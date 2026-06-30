/**
 * NEXA IDE Performance Benchmark — Phase 10
 * Measures cold boot proxy, project load, file read, AI first-token, and memory.
 */
import { performance } from 'node:perf_hooks'
import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

async function loadEnv() {
  try {
    const raw = await readFile(join(ROOT, '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
    }
  } catch { /* no .env */ }
}
const FIXTURE = join(tmpdir(), 'nexus-bench-fixture')

async function setupFixture(fileCount = 100) {
  await rm(FIXTURE, { recursive: true, force: true })
  await mkdir(FIXTURE, { recursive: true })
  for (let i = 0; i < fileCount; i++) {
    await writeFile(
      join(FIXTURE, `file-${String(i).padStart(3, '0')}.ts`),
      `export const value${i} = ${i};\n`.repeat(20),
      'utf8'
    )
  }
}

async function measureProjectLoad() {
  const start = performance.now()
  const entries = await readdir(FIXTURE, { withFileTypes: true })
  const files = entries.filter((e) => e.isFile())
  const start2 = performance.now()
  await Promise.all(files.slice(0, 100).map((f) => readFile(join(FIXTURE, f.name), 'utf8')))
  return {
    treeScanMs: Math.round((start2 - start) * 100) / 100,
    read100FilesMs: Math.round((performance.now() - start2) * 100) / 100,
    totalProjectLoadMs: Math.round((performance.now() - start) * 100) / 100,
    fileCount: files.length,
  }
}

async function measureFileOpenLatency() {
  const target = join(FIXTURE, 'file-050.ts')
  const samples = []
  for (let i = 0; i < 10; i++) {
    const t0 = performance.now()
    await readFile(target, 'utf8')
    samples.push(performance.now() - t0)
  }
  samples.sort((a, b) => a - b)
  return {
    fileOpenP50Ms: Math.round(samples[4] * 100) / 100,
    fileOpenP95Ms: Math.round(samples[8] * 100) / 100,
    fileOpenAvgMs: Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 100) / 100,
  }
}

async function measureColdBoot() {
  const exe = join(ROOT, 'release', 'win-unpacked', 'NEXA IDE.exe')
  const start = performance.now()
  return new Promise((resolve) => {
    const child = spawn(exe, [], {
      cwd: join(ROOT, 'release', 'win-unpacked'),
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
    })
    let resolved = false
    const finish = (ms, note) => {
      if (resolved) return
      resolved = true
      try { child.kill() } catch { /* ignore */ }
      resolve({ coldBootMs: ms, note })
    }
    child.on('error', () => finish(Math.round(performance.now() - start), 'exe-not-found'))
    const poll = setInterval(() => {
      if (child.pid) {
        clearInterval(poll)
        finish(Math.round(performance.now() - start), 'process-spawned')
      }
    }, 5)
    setTimeout(() => finish(Math.round(performance.now() - start), 'timeout-8s'), 8000)
  })
}

async function measureAIFirstToken() {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    return { aiFirstTokenMs: null, note: 'OPENROUTER_API_KEY not set — skipped live AI test' }
  }
  const t0 = performance.now()
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://nexa-ide.com',
      'X-Title': 'NEXA IDE Benchmark',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      max_tokens: 5,
      stream: true,
    }),
  })
  if (!res.ok) {
    return { aiFirstTokenMs: null, note: `OpenRouter HTTP ${res.status}` }
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value)
    if (chunk.includes('content') || chunk.includes('delta')) {
      return { aiFirstTokenMs: Math.round((performance.now() - t0) * 100) / 100, note: 'stream-first-chunk' }
    }
  }
  return { aiFirstTokenMs: Math.round((performance.now() - t0) * 100) / 100, note: 'stream-complete-no-chunk' }
}

function measureMemoryAfterChats(chatCount = 20) {
  const chats = []
  for (let i = 0; i < chatCount; i++) {
    chats.push({
      id: i,
      messages: Array.from({ length: 10 }, (_, j) => ({
        role: j % 2 ? 'assistant' : 'user',
        content: 'x'.repeat(2048),
      })),
    })
  }
  const before = process.memoryUsage()
  const serialized = JSON.stringify(chats)
  const after = process.memoryUsage()
  return {
    memoryAfter100FilesHeapMB: Math.round(before.heapUsed / 1024 / 1024 * 10) / 10,
    memoryAfter20ChatsHeapMB: Math.round(after.heapUsed / 1024 / 1024 * 10) / 10,
    chatPayloadMB: Math.round(Buffer.byteLength(serialized) / 1024 / 1024 * 10) / 10,
    rssMB: Math.round(after.rss / 1024 / 1024 * 10) / 10,
  }
}

async function main() {
  await loadEnv()
  console.log('NEXA IDE Benchmark v1.1.0')
  console.log('============================\n')

  await setupFixture(100)
  const project = await measureProjectLoad()
  const fileOpen = await measureFileOpenLatency()
  const coldBoot = await measureColdBoot()
  const ai = await measureAIFirstToken()
  const memory = measureMemoryAfterChats(20)

  const results = {
    timestamp: new Date().toISOString(),
    version: '1.1.0',
    coldBootTimeMs: coldBoot.coldBootMs,
    coldBootNote: coldBoot.note,
    projectLoadTimeMs: project.totalProjectLoadMs,
    projectTreeScanMs: project.treeScanMs,
    projectRead100FilesMs: project.read100FilesMs,
    fileOpenLatencyP50Ms: fileOpen.fileOpenP50Ms,
    fileOpenLatencyP95Ms: fileOpen.fileOpenP95Ms,
    fileOpenLatencyAvgMs: fileOpen.fileOpenAvgMs,
    aiFirstTokenLatencyMs: ai.aiFirstTokenMs,
    aiNote: ai.note,
    memoryAfter100FilesHeapMB: memory.memoryAfter100FilesHeapMB,
    memoryAfter20ChatsHeapMB: memory.memoryAfter20ChatsHeapMB,
    processRssMB: memory.rssMB,
  }

  console.log(JSON.stringify(results, null, 2))
  await writeFile(join(ROOT, 'benchmark-results.json'), JSON.stringify(results, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
