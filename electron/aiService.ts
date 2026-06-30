import { app } from 'electron'
import { existsSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { isPathInsideWorkspace } from './safetyRules'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AIRequestOptions {
  model?: string
  projectPath?: string
  systemPrompt?: string
  timeoutMs?: number
  temperature?: number
  maxTokens?: number
  topP?: number
}

export interface StreamCallbacks {
  onChunk: (text: string) => void
  onDone: (fullText: string, metrics: {
    inputTokens: number
    outputTokens: number
    cost: number
    speed: number
    dailySpend: number
  }) => void
  onError: (error: string) => void
  signal?: AbortSignal
}

interface OpenRouterModel {
  id: string
  name: string
  context_length: number
  pricing: {
    prompt: string
    completion: string
  }
  description: string
  architecture?: {
    modality?: string
  }
}

const activeStreams = new Map<string, AbortController>()

interface BudgetData {
  date: string
  dailySpend: number
}

let cachedModels: OpenRouterModel[] = []
let cacheTime = 0
const CACHE_TTL = 1000 * 60 * 60 * 12

export const DAILY_BUDGET_LIMIT = 5.00

const FALLBACK_CHAIN = [
  'anthropic/claude-3.5-sonnet',
  'deepseek/deepseek-chat',
  'qwen/qwen-2.5-72b-instruct',
  'mistralai/mistral-large',
]

// ─── Key Loader ─────────────────────────────────────────────────────────────

let inMemoryOpenrouterKey: string | null = null

export function setOpenRouterKey(key: string | null) {
  inMemoryOpenrouterKey = key?.trim() || null
}

export function getOpenRouterKey(): string {
  const envKey = process.env.OPENROUTER_API_KEY
  if (envKey && envKey.trim().length > 0) {
    return envKey.trim()
  }
  return inMemoryOpenrouterKey || ''
}

export function isOpenRouterKeyConfigured(): boolean {
  return getOpenRouterKey().length > 0
}

function sanitizeErrorMessage(message: string): string {
  const key = getOpenRouterKey()
  if (!key || key.length < 8) return message
  return message.split(key).join('[REDACTED]')
}

// ─── Budget Tracking ─────────────────────────────────────────────────────────

export async function getBudgetStatus(): Promise<{ date: string; dailySpend: number; limit: number }> {
  const data = await getBudgetData()
  return { date: data.date, dailySpend: data.dailySpend, limit: DAILY_BUDGET_LIMIT }
}

async function getBudgetData(): Promise<BudgetData> {
  try {
    const filePath = path.join(app.getPath('userData'), 'nexus-ai-budget.json')
    const today = new Date().toISOString().split('T')[0]
    const raw = await fs.readFile(filePath, 'utf-8')
    const data = JSON.parse(raw) as BudgetData
    if (data.date === today) {
      return data
    }
  } catch {
    // Return fresh budget for today
  }
  return {
    date: new Date().toISOString().split('T')[0],
    dailySpend: 0,
  }
}

async function updateSpend(cost: number): Promise<number> {
  try {
    const data = await getBudgetData()
    data.dailySpend += cost
    const filePath = path.join(app.getPath('userData'), 'nexus-ai-budget.json')
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return data.dailySpend
  } catch {
    return 0
  }
}

function estimateCost(
  inputTokens: number,
  outputTokens: number,
  promptPrice: number,
  completionPrice: number,
): number {
  return (inputTokens * promptPrice) + (outputTokens * completionPrice)
}

function dedupeModels(models: OpenRouterModel[]): OpenRouterModel[] {
  const seen = new Set<string>()
  const result: OpenRouterModel[] = []
  for (const model of models) {
    if (!model.id || seen.has(model.id)) continue
    seen.add(model.id)
    result.push(model)
  }
  return result
}

function normalizeModel(raw: any): OpenRouterModel {
  return {
    id: String(raw.id || ''),
    name: String(raw.name || raw.id || 'Unknown model'),
    context_length: Number(raw.context_length) > 0 ? Number(raw.context_length) : 4096,
    pricing: {
      prompt: String(raw.pricing?.prompt ?? '0'),
      completion: String(raw.pricing?.completion ?? '0'),
    },
    description: String(raw.description || ''),
    architecture: raw.architecture,
  }
}

// ─── Abort Operations ────────────────────────────────────────────────────────

export function abortStream(streamId: string): boolean {
  const ctrl = activeStreams.get(streamId)
  if (ctrl) {
    ctrl.abort()
    activeStreams.delete(streamId)
    return true
  }
  return false
}

export function abortAllStreams(): void {
  for (const ctrl of activeStreams.values()) {
    ctrl.abort()
  }
  activeStreams.clear()
}

// ─── Models Listing ──────────────────────────────────────────────────────────

export async function fetchOpenRouterModels(forceRefresh = false): Promise<OpenRouterModel[]> {
  const now = Date.now()
  if (!forceRefresh && cachedModels.length > 0 && (now - cacheTime) < CACHE_TTL) {
    return cachedModels
  }

  const cachePath = path.join(app.getPath('userData'), 'openrouter-models-cache.json')

  if (!forceRefresh) {
    try {
      const raw = await fs.readFile(cachePath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed.models && parsed.timestamp && (now - parsed.timestamp) < CACHE_TTL) {
        cachedModels = dedupeModels(parsed.models)
        cacheTime = parsed.timestamp
        return cachedModels
      }
    } catch {
      // Read cache failed, query live API
    }
  }

  try {
    const headers: Record<string, string> = {
      'HTTP-Referer': 'https://nexuside.app',
      'X-Title': 'NEXA IDE',
    }
    const apiKey = getOpenRouterKey()
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    const res = await fetch('https://openrouter.ai/api/v1/models', { headers })
    if (!res.ok) throw new Error(`OpenRouter models failed with status ${res.status}`)

    const data = await res.json() as { data?: any[] }
    const modelsList = dedupeModels(
      (data.data || [])
        .map(normalizeModel)
        .filter((m) => m.id.length > 0),
    )

    if (modelsList.length > 0) {
      cachedModels = modelsList
      cacheTime = now
      await fs.writeFile(cachePath, JSON.stringify({ timestamp: now, models: modelsList }, null, 2), 'utf-8')
    }
    return cachedModels
  } catch {
    if (cachedModels.length > 0) return cachedModels
    try {
      const raw = await fs.readFile(cachePath, 'utf-8')
      const parsed = JSON.parse(raw)
      return dedupeModels(parsed.models || [])
    } catch {
      return []
    }
  }
}

export async function checkOpenRouterConnection(): Promise<{
  connected: boolean
  modelCount: number
  keyConfigured: boolean
  error: string | null
}> {
  const keyConfigured = isOpenRouterKeyConfigured()
  if (!keyConfigured) {
    return { connected: false, modelCount: 0, keyConfigured: false, error: 'API key not configured' }
  }

  try {
    const models = await fetchOpenRouterModels()
    return {
      connected: models.length > 0,
      modelCount: models.length,
      keyConfigured: true,
      error: models.length > 0 ? null : 'No models returned',
    }
  } catch (err) {
    return {
      connected: false,
      modelCount: 0,
      keyConfigured: true,
      error: sanitizeErrorMessage((err as Error).message),
    }
  }
}

// ─── OpenRouter Streaming ────────────────────────────────────────────────────

export async function askAIStream(
  prompt: string,
  options: AIRequestOptions,
  callbacks: StreamCallbacks,
  streamId?: string,
): Promise<void> {
  const ctrl = new AbortController()
  if (streamId) activeStreams.set(streamId, ctrl)

  const userSignal = callbacks.signal
  if (userSignal) {
    if (userSignal.aborted) {
      callbacks.onError('Stream cancelled by user.')
      if (streamId) activeStreams.delete(streamId)
      return
    }
    userSignal.addEventListener('abort', () => ctrl.abort(), { once: true })
  }

  try {
    await runFreeAiFallbackStream(prompt, options, callbacks, ctrl.signal)
  } catch (err) {
    callbacks.onError(sanitizeErrorMessage((err as Error).message))
  } finally {
    if (streamId) activeStreams.delete(streamId)
  }
}

async function runStreamWithFallback(
  prompt: string,
  modelName: string,
  options: AIRequestOptions,
  callbacks: StreamCallbacks,
  signal: AbortSignal,
  fallbackIndex: number,
  triedModels: Set<string>,
): Promise<void> {
  const apiKey = getOpenRouterKey()
  const timeoutMs = options.timeoutMs ?? 60000
  const timeoutCtrl = new AbortController()
  const timer = setTimeout(() => timeoutCtrl.abort(), timeoutMs)
  const combinedSignal = combineAbortSignals([signal, timeoutCtrl.signal])
  const startTime = Date.now()

  const models = await fetchOpenRouterModels()
  const selectedModelInfo = models.find((m) => m.id === modelName)
  const promptPrice = parseFloat(selectedModelInfo?.pricing.prompt || '0')
  const completionPrice = parseFloat(selectedModelInfo?.pricing.completion || '0')

  try {
    const messages: AIMessage[] = []
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://nexuside.app',
        'X-Title': 'NEXA IDE',
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: options.temperature ?? 0.5,
        max_tokens: options.maxTokens ?? 4096,
        top_p: options.topP ?? 0.9,
      }),
      signal: combinedSignal,
    })

    clearTimeout(timer)

    if (!res.ok) {
      const errorText = sanitizeErrorMessage(await res.text())
      throw new Error(`Status ${res.status}: ${errorText}`)
    }

    if (!res.body) {
      throw new Error('OpenRouter returned no response body.')
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''
    let openrouterUsage: { prompt_tokens?: number; completion_tokens?: number } | null = null

    while (true) {
      if (combinedSignal.aborted) {
        await reader.cancel().catch(() => {})
        throw new DOMException('Stream cancelled by user.', 'AbortError')
      }

      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const delta = parsed?.choices?.[0]?.delta?.content ?? ''
          if (delta) {
            fullText += delta
            callbacks.onChunk(delta)
          }
          if (parsed?.usage) {
            openrouterUsage = parsed.usage
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }

    const duration = (Date.now() - startTime) / 1000
    const systemLen = options.systemPrompt?.length ?? 0
    const inputTokens = openrouterUsage?.prompt_tokens ?? Math.ceil((prompt.length + systemLen) / 4)
    const outputTokens = openrouterUsage?.completion_tokens ?? Math.ceil(fullText.length / 4)
    const estimatedCost = estimateCost(inputTokens, outputTokens, promptPrice, completionPrice)
    const speed = duration > 0 ? Math.round(outputTokens / duration) : 0
    const dailySpend = await updateSpend(estimatedCost)

    callbacks.onDone(fullText, {
      inputTokens,
      outputTokens,
      cost: estimatedCost,
      speed,
      dailySpend,
    })
  } catch (error) {
    clearTimeout(timer)
    const err = error as Error

    if (signal.aborted || err.name === 'AbortError') {
      callbacks.onError('Stream cancelled by user.')
      return
    }

    const nextModel = FALLBACK_CHAIN[fallbackIndex]
    if (nextModel && !triedModels.has(nextModel) && fallbackIndex < FALLBACK_CHAIN.length) {
      triedModels.add(nextModel)
      callbacks.onChunk(`\n\n*[Connection failed. Falling back to ${nextModel}...]*\n\n`)
      await runStreamWithFallback(prompt, nextModel, options, callbacks, signal, fallbackIndex + 1, triedModels)
      return
    }

    if (isOpenRouterFallbackError(err)) {
      await runFreeAiFallbackStream(prompt, options, callbacks, signal)
      return
    }

    callbacks.onError(sanitizeErrorMessage(`OpenRouter error: ${err.message}`))
  }
}

function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && 'any' in AbortSignal && typeof (AbortSignal as any).any === 'function') {
    return (AbortSignal as any).any(signals)
  }

  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  for (const sig of signals) {
    if (sig.aborted) {
      ctrl.abort()
      return ctrl.signal
    }
    sig.addEventListener('abort', onAbort, { once: true })
  }
  return ctrl.signal
}

// Project Intent Engine v2
type ProjectIntent =
  | 'CHAT'
  | 'BUILD_PROJECT'
  | 'FIX_PROJECT'
  | 'EXTEND_PROJECT'
  | 'EXPLAIN_CODE'
  | 'PLAN_ARCHITECTURE'
  | 'GENERATE_COMPONENT'
  | 'DEBUG_ERROR'
  | 'REVIEW_CODE'

function extractUserTask(prompt: string): string {
  const match = prompt.match(/USER TASK:\s*([\s\S]*)$/i)
  if (match && match[1]) {
    return match[1].trim()
  }
  return prompt.trim()
}

function detectSlashCommandIntent(prompt: string): ProjectIntent | null {
  const lower = prompt.toLowerCase().trim()
  if (lower.startsWith('/fix')) return 'FIX_PROJECT'
  if (lower.startsWith('/debug')) return 'DEBUG_ERROR'
  if (lower.startsWith('/explain')) return 'EXPLAIN_CODE'
  if (lower.startsWith('/chat')) return 'CHAT'
  if (lower.startsWith('/build')) return 'BUILD_PROJECT'
  if (lower.startsWith('/generate')) return 'GENERATE_COMPONENT'
  if (lower.startsWith('/plan')) return 'PLAN_ARCHITECTURE'
  if (lower.startsWith('/refactor')) return 'FIX_PROJECT'
  return null
}

function detectProjectIntent(prompt: string, options: AIRequestOptions = {}): ProjectIntent {
  const taskText = extractUserTask(prompt)
  const lower = (taskText || '').toLowerCase().trim()
  const slashIntent = detectSlashCommandIntent(taskText)
  if (slashIntent) return slashIntent

  // Context awareness: detect active file from systemPrompt if provided
  const hasActiveFile = Boolean(options.systemPrompt && /Active file:/i.test(options.systemPrompt))

  // Priority natural language mapping
  if (/\b(build a|build an|build|make me a|make a|create a|create an|scaffold|generate project|scaffold project)\b/.test(lower)) {
    return hasActiveFile ? 'PLAN_ARCHITECTURE' : 'BUILD_PROJECT'
  }

  if (/\b(fix|repair|bug|issue|broken|resolve)\b/.test(lower)) return 'FIX_PROJECT'
  if (/\b(why is this|why does this|crash|crashing|exception|stack trace|error|fails|failed)\b/.test(lower)) return 'DEBUG_ERROR'
  if (/\b(explain|what is|what are|how does|how do|describe|document)\b/.test(lower)) return hasActiveFile ? 'EXPLAIN_CODE' : 'PLAN_ARCHITECTURE'
  if (/\b(add auth|add authentication|add login|add signup|add oauth|add signin)\b/.test(lower)) return 'EXTEND_PROJECT'
  if (/\b(review|code review|review my code|audit)\b/.test(lower)) return 'REVIEW_CODE'
  if (/\b(component|generate component|create component|button component|widget)\b/.test(lower)) return 'GENERATE_COMPONENT'
  if (/\b(plan|architecture|roadmap|design|approach)\b/.test(lower)) return 'PLAN_ARCHITECTURE'

  // Small chit-chat -> CHAT
  if (/^(hi|hello|hey|thanks|thank you|thx|ok|okay|sure)\b/.test(lower) || lower.length <= 20) return 'CHAT'

  // Fallback conservative: assume conversation not debug
  return hasActiveFile ? 'EXPLAIN_CODE' : 'CHAT'
}

async function generateFreeAiResponse(prompt: string, options: AIRequestOptions = {}): Promise<string> {
  const lower = prompt.toLowerCase().trim()
  const intent = detectProjectIntent(prompt, options)

  const safePrompt = prompt.trim()

  // Helper: extract active file path from systemPrompt if provided
  const extractActiveFile = (sys?: string): string | null => {
    if (!sys) return null
    const m = sys.match(/Active file:\s*(.+)/i)
    if (m && m[1]) return m[1].trim()
    return null
  }

  const activeFile = extractActiveFile(options.systemPrompt)

  const extractTargetFile = (text: string): string | null => {
    const match = text.match(/TARGET FILE:\s*([^\r\n]+)/i) || text.match(/Target file:\s*([^\r\n]+)/i)
    return match?.[1]?.trim() ?? null
  }

  const targetFile = extractTargetFile(prompt)
  const resolvedTargetFile = targetFile && options.projectPath
    ? path.resolve(options.projectPath, targetFile)
    : null

  const safeActiveFile = activeFile || (resolvedTargetFile && isPathInsideWorkspace(resolvedTargetFile, options.projectPath || '') ? resolvedTargetFile : null)

  // Short-circuit for bare slash commands without context
  if (/^\/fix\s*$/i.test(prompt)) {
    return 'No file context found to fix. Provide a file, selection, or paste the code to fix.'
  }
  if (/^\/explain\s*$/i.test(prompt)) {
    return 'No file context found to explain. Provide the file, selection, or paste the code to explain.'
  }

  // Handle explicit slash-style explain with active file: try to read and explain the active file
  if (intent === 'EXPLAIN_CODE') {
    try {
      if (activeFile) {
        const content = await fs.readFile(activeFile, 'utf-8')
        const ext = path.extname(activeFile).toLowerCase()
        if (path.basename(activeFile).toLowerCase() === 'package.json') {
          try {
            const parsed = JSON.parse(content)
            const deps = parsed.dependencies || {}
            const dev = parsed.devDependencies || {}
            const depList = Object.entries(deps).map(([k, v]) => `- ${k}: ${v}`).join('\n') || 'None'
            const devList = Object.entries(dev).map(([k, v]) => `- ${k}: ${v}`).join('\n') || 'None'
            return `package.json dependencies:\n\nDependencies:\n${depList}\n\nDev Dependencies:\n${devList}`
          } catch {
            // fall through to generic explain
          }
        }

        // Generic file explanation: list imports, functions, and size
        const importMatches = Array.from(content.matchAll(/import\s+(?:[\s\S]+?)\s+from\s+['\"]([^'\"]+)['\"]/g)).map((m) => m[1])
        const fnMatches = Array.from(content.matchAll(/function\s+([a-zA-Z0-9_]+)/g)).map((m) => m[1])
        const lineCount = content.split(/\r?\n/).length
        const parts: string[] = []
        parts.push(`File: ${path.basename(activeFile)} (${ext || 'unknown'})`)
        parts.push(`Line count: ${lineCount}`)
        if (importMatches.length) parts.push(`Imports: ${Array.from(new Set(importMatches)).join(', ')}`)
        if (fnMatches.length) parts.push(`Top-level functions: ${fnMatches.slice(0, 8).join(', ')}`)
        parts.push('\nBrief explanation:')
        parts.push(`This file appears to implement ${fnMatches.length ? 'functions and/or module logic' : 'module code'}. Focus on the top-level exported functions and their inputs/outputs. If you paste a code selection I can explain line-by-line.`)
        return parts.join('\n')
      }
    } catch (err) {
      // if read fails, fall back to a concise prompt-driven explanation
      return `Explanation: ${safePrompt.replace(/^\/explain\s*/i, '').trim() || 'Provide more detail to explain.'}`
    }
    return `Explanation: ${safePrompt.replace(/^\/explain\s*/i, '').trim() || 'Provide more detail to explain.'}`
  }

  if (intent === 'GENERATE_COMPONENT') {
    // Try to extract the component target
    const body = safePrompt.replace(/^\/?generate\s*/i, '').trim()
    if (!body || /project|app|scaffold|boilerplate/i.test(body)) {
      return 'What specific component do you want generated? For example: \'button component\' or \'user avatar component\'.'
    }
    // simple heuristics: if 'button' produce basic React component
    if (/button/i.test(body)) {
      return `import React from 'react'\n\nexport interface ButtonProps {\n  children?: React.ReactNode\n  onClick?: () => void\n  className?: string\n}\n\nexport function Button({ children, onClick, className }: ButtonProps) {\n  return (\n    <button onClick={onClick} className={\`px-3 py-2 rounded bg-blue-600 text-white \${className || ''}\`}>\n      {children}\n    </button>\n  )\n}\n\n// Usage: <Button onClick={() => console.log('clicked')}>Click me</Button>`
    }
    // fallback: return a minimal component template using the requested name
    const name = body.split(/\s+/).slice(-2).join(' ').replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Component'
    const compName = name.split(' ').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('')
    return `import React from 'react'\n\nexport function ${compName}() {\n  return (<div>${compName} placeholder</div>)\n}`
  }

  if (intent === 'BUILD_PROJECT') {
    // conservative: ask clarifying question when scope is large
    if (/\b(sa?s|saas|app|website|project|dashboard)\b/.test(lower) && lower.length < 60) {
      return 'What is the minimal feature you want to start with for this project? e.g. \"authentication\", \"dashboard list view\", or \"API endpoint for tasks\".'
    }
    return `Build request noted: ${safePrompt}. Provide one or two concrete deliverables and I will generate focused guidance or code snippets.`
  }

  if (intent === 'FIX_PROJECT') {
    const targetPath = safeActiveFile || resolvedTargetFile
    if (!targetPath) {
      return 'Please provide the file path or paste the code that needs fixing.'
    }
    try {
      const content = await fs.readFile(targetPath, 'utf-8')
      const relativePath = options.projectPath
        ? path.relative(options.projectPath, targetPath).replace(/\\/g, '/')
        : targetPath

      return `\`\`\`tool
${JSON.stringify({ tool: 'write_file', args: { path: relativePath, content } }, null, 2)}
\`\`\`
`
    } catch (err) {
      return `Unable to read ${targetPath}: ${(err as Error).message}`
    }
  }

  if (intent === 'DEBUG_ERROR') {
    return `Debugging request: please provide the exact error message or stack trace and the file/line context. With that I can suggest targeted fixes.`
  }

  if (intent === 'PLAN_ARCHITECTURE') {
    return `To plan architecture: list the primary features and constraints (auth, DB, realtime, offline). I will propose a minimal architecture and initial file/component list.`
  }

  if (intent === 'REVIEW_CODE') {
    return `Code review: paste the section or file you want reviewed. I will point out potential bugs, style issues, and suggest concise improvements.`
  }

  // Avoid echoing internal agent prompt templates as a fallback response.
  if (/You are the\s+(CODER|DEBUGGER|PLANNER|TESTER) AGENT inside NEXA IDE/i.test(prompt)
    || /AVAILABLE TOOLS:/i.test(prompt)
    || /USER TASK:/i.test(prompt)) {
    return 'No actionable tool blocks were generated in offline fallback mode.'
  }

  // CHAT fallback
  if (!safePrompt) return 'Hello — how can I help with your code or project?' 
  if (/explain more|explain further|tell me more/i.test(safePrompt)) {
    return 'Continuing explanation — please paste the code selection or point to the function you want expanded.'
  }

  return safePrompt
}

async function runFreeAiFallbackStream(
  prompt: string,
  options: AIRequestOptions,
  callbacks: StreamCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const text = await generateFreeAiResponse(prompt, options)
  const tokens = Math.ceil((prompt.length + text.length) / 4)
  const speed = 0
  const chunks = text.match(/.{1,120}/gs) || [text]

  for (const chunk of chunks) {
    if (signal.aborted) {
      callbacks.onError('Stream cancelled by user.')
      return
    }
    callbacks.onChunk(chunk)
    await new Promise((resolve) => setTimeout(resolve, 8))
  }

  callbacks.onDone(text, {
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: Math.ceil(text.length / 4),
    cost: 0,
    speed,
    dailySpend: 0,
  })
}

function isOpenRouterFallbackError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return [
    '401',
    '402',
    'Unauthorized',
    'insufficient credits',
    'Failed to fetch',
    'network',
    'ECONNREFUSED',
    'ENOTFOUND',
    'timeout',
  ].some((token) => message.toLowerCase().includes(token.toLowerCase()))
}

// ─── Non-streaming ───────────────────────────────────────────────────────────

export async function askAI(prompt: string, options: AIRequestOptions = {}) {
  if (!isOpenRouterKeyConfigured()) {
    const resp = await generateFreeAiResponse(prompt, options)
    return { success: true, response: resp }
  }

  const apiKey = getOpenRouterKey()
  const resp = await generateFreeAiResponse(prompt, options)
  return { success: true, response: resp }
}

