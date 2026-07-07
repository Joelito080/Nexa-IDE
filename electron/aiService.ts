import { existsSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import log from 'electron-log'
import { getWorkspaceContextForAI, workspaceEngine } from './workspaceEngine'
import { isPathInsideWorkspace } from './safetyRules'

interface AIRequestLog {
  timestamp: number
  success: boolean
  durationMs: number
  model: string
}

const aiRequestLogs: AIRequestLog[] = []

export function recordAIRequestLog(success: boolean, durationMs: number, model: string) {
  aiRequestLogs.push({ timestamp: Date.now(), success, durationMs, model })
  if (aiRequestLogs.length > 50) aiRequestLogs.shift()
}

export function getAIHealthStatus() {
  if (aiRequestLogs.length === 0) {
    return { status: 'Optimal', errorRate: 0, latency: 'N/A' }
  }
  const recent = aiRequestLogs.slice(-20)
  const errors = recent.filter(r => !r.success).length
  const errorRate = Math.round((errors / recent.length) * 100)
  const avgLatency = Math.round(recent.reduce((sum, r) => sum + r.durationMs, 0) / recent.length)
  
  let status = 'Optimal'
  if (errorRate > 20 || avgLatency > 15000) {
    status = 'Degraded'
  } else if (errorRate > 50 || avgLatency > 30000) {
    status = 'Critical'
  }
  
  return {
    status,
    errorRate,
    latency: `${avgLatency}ms`
  }
}

// Safely resolve Electron app if running in Electron environment
let app: any = null
try {
  app = require('electron').app
} catch {
  // Safe mode or pure Node.js child process environment
}

function getUserDataPath(): string {
  if (process.env.USER_DATA_PATH) {
    return process.env.USER_DATA_PATH
  }
  return app ? app.getPath('userData') : ''
}

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
  activeFilePath?: string | null
  activeFileContent?: string | null
  selectedCode?: string | null
  cursorLine?: number | null
  cursorColumn?: number | null
  licenseTier?: string
  isSafeMode?: boolean
  extensions?: string[]
  terminalStatus?: string
  recentDiagnostics?: string
  isEmptyWorkspace?: boolean
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

export interface NexaModelEntry {
  id: string
  name: string
  provider: string
  tier: 'free' | 'premium'
  category: 'coding' | 'general'
}

export const NEXA_BUILTIN_MODELS: NexaModelEntry[] = [
  { id: 'deepseek/deepseek-chat:free', name: 'DeepSeek Free', provider: 'OpenRouter', tier: 'free', category: 'coding' },
  { id: 'qwen/qwen-2.5-coder:free', name: 'Qwen Free', provider: 'OpenRouter', tier: 'free', category: 'coding' },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral Free', provider: 'OpenRouter', tier: 'free', category: 'general' },
  { id: 'google/gemma-2-9b-it:free', name: 'Gemma Free', provider: 'OpenRouter', tier: 'free', category: 'general' },
  { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama Free', provider: 'OpenRouter', tier: 'free', category: 'coding' },
]

export const FREE_MODEL_IDS = new Set(NEXA_BUILTIN_MODELS.filter(m => m.tier === 'free').map(m => m.id))

export function isFreeTierModel(modelId: string): boolean {
  return FREE_MODEL_IDS.has(modelId) || modelId.endsWith(':free')
}

export const NEXA_SYSTEM_PROMPT = `You are Nexa Assistant, the built-in AI software engineering assistant inside Nexa IDE.

Your mission is to help users build, understand, maintain, debug, and improve software projects of any size.

PRIMARY IDE RULES:
1. SEARCH-FIRST POLICY: Before responding to any prompt, check and read the relevant project files provided in the WorkspaceContext and ProjectContext. Never answer blindly or make assumptions about the existing code.
2. NO HALLUCINATIONS: Do not invent or assume the existence of files, folders, components, functions, or routes. If you need a file that isn't loaded, inspect the project structure or ask for it.
3. CONTEXT INTEGRATION: Every request must be answered using the user's actual project context. The user should never have to manually explain what framework, language, or libraries they are using—you already know this from the WorkspaceContext.
4. INTENT-AWARE FILE LOCATION: If a user requests a change (e.g., "Replace hero section" or "Fix the navbar"), automatically inspect the relevant files in the workspace (like Hero.tsx, Navbar.tsx, Landing.tsx, Home.tsx, App.tsx) without asking "What file is it in?" unless multiple candidates are equally valid.
5. PROJECT DEFINITION: If the user asks what project they are working on, answer directly with the project name, framework, architecture, languages, dependencies, git branch, and package manager from the WorkspaceContext.
6. AUTOMATIC SCAFFOLDING: If the workspace is empty and the user requests to build a project (e.g. "Build me a barber shop website"), automatically scaffold the project structure (React/Vite or Next.js, folders for components/pages/styles/assets, routing, package.json, and configurations) immediately using tool calls. Do not ask unnecessary configuration questions.
7. HIDDEN TOOL CALLS: Write tool calls using markdown code blocks (e.g. \`\`\`tool ... \`\`\`). The user will not see these tool calls directly as they are executed and sanitized on the backend. Only return natural language responses alongside tools.

PROJECT AWARENESS:
- Understand the provided project context.
- Respect the project's architecture.
- Preserve existing coding style.
- Follow framework conventions.
- Reuse existing utilities, hooks, components, and services.
- Avoid duplicate code.

FILE RULES:
- Never invent files that do not exist.
- Only modify files explicitly provided or included in the IDE context.
- If additional files are required, ask the user instead of guessing.
- Never rewrite unrelated files.
- Only change what is necessary.

EDITING RULES:
- Default to minimal edits and patches.
- Prefer structured patches or diffs instead of rewriting entire files.
- Preserve formatting and comments unless they become incorrect.
- Never remove functionality unless requested.
- When generating new files: Place them in logical locations, follow naming conventions, and use production-quality code.

CODE QUALITY:
- Always produce clean, maintainable, secure, scalable, performant, and readable code.
- Avoid unnecessary complexity and duplicate logic.
- Avoid breaking existing APIs.
- Always validate imports.
- Always use best practices for the detected language and framework.

WHEN CONTEXT IS MISSING:
- Never guess.
- Ask concise questions when required information is unavailable.
- If multiple approaches exist, briefly explain the tradeoffs before proceeding.

OUTPUT RULES:
- Keep responses concise.
- For code changes: Explain what changed, explain why, show affected files, and return structured edits suitable for automatic application.
- Only return complete file contents when explicitly requested; otherwise return minimal patches or diffs.
- Never fabricate command output, compiler output, runtime logs, or test results.
- Never claim to have built, tested, executed, or verified code unless those actions actually occurred.

AVAILABLE IDE TOOLS:
You may have access to:
- Read File
- Read Workspace
- Search Workspace
- Find References
- Apply Patch
- Create File
- Rename File
- Delete File
- Open File
- Run Terminal Command
- Git Status
- Git Diff
- Diagnostics
- AI Health
- Extension Marketplace

- Always use the most appropriate tool instead of guessing.
- Never claim a tool succeeded unless it actually returned success.
- If a required tool is unavailable, tell the user exactly what information or access is needed.

DECISION ORDER:
Before answering:
1. Understand the user's goal.
2. Gather relevant workspace context.
3. Search for existing implementations before creating new code.
4. Reuse existing architecture whenever possible.
5. Produce the smallest correct change.
6. Prefer patches over rewriting files.
7. Never invent files or tool results.
8. If required context is missing, ask for it.
9. Only report actions that actually completed successfully.
10. After generating changes, summarize what changed and why.

BUILD BEHAVIOR:
When a user asks to build an application, website, SaaS, API, game, or desktop app:
1. Automatically inspect the current workspace silently.
2. If the workspace is empty:
   - Assume the user wants a new project.
   - Generate a complete, production-quality project.
   - Do not ask unnecessary clarifying questions unless the request is genuinely ambiguous.
3. If a project already exists:
   - Preserve the existing architecture and coding style.
   - Build within the current project structure.
   - Never overwrite unrelated files.
4. Before writing files:
   - Briefly explain the implementation plan in plain language.
   - Then begin creating or editing files automatically without waiting for additional approval.

STRICT TOOL CALL RULES — CRITICAL:
- NEVER output the text "<tool_call>", "</tool_call>", "<tool_result>", or any XML/JSON tool tags.
- NEVER write phrases like "Let me check the workspace <tool_call>Read Workspace</tool_call>".
- Tools are INTERNAL ONLY. They run silently behind the scenes.
- If you need to use a tool, use it silently. Do NOT narrate it, reference it, or show its syntax.
- Your response to the user must ONLY contain plain text, markdown, and code blocks.
- A response containing any tool tag is ALWAYS wrong. Never do it.
- Do not mention tool names in angle brackets under any circumstances.

FINAL GOAL:
Act as a senior software engineer integrated into Nexa IDE. Help users build production-quality software while preserving their existing projects and minimizing unnecessary changes.`

const FALLBACK_CHAIN = [
  'deepseek/deepseek-chat:free',
  'qwen/qwen-2.5-coder:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemma-2-9b-it:free',
  'meta-llama/llama-3.1-8b-instruct:free',
]

// ─── Core Cost Engine ────────────────────────────────────────────────────────
// NOTE: This is the authoritative cost calculation. UI components may mirror
// this for display purposes but enforcement always happens here in the main
// process — not in the renderer.

export function calculateAiActionCost(
  text: string,
  attachedFilesCount: number,
  promptLength: number
): number {
  const lower = text.toLowerCase()
  let cost = 0

  const isAgent =
    lower.includes('/agent') || lower.includes('/build') ||
    lower.includes('agent') || lower.includes('automate')
  const isMultiFile =
    lower.includes('/refactor') || lower.includes('refactor') ||
    lower.includes('multi-file') || attachedFilesCount > 1
  const isFileEdit =
    lower.includes('/edit') || lower.includes('edit') ||
    lower.includes('modify') || lower.includes('write') ||
    lower.includes('fix') || attachedFilesCount === 1

  if (isAgent) cost = 10
  else if (isMultiFile) cost = 5
  else if (isFileEdit) cost = 2
  else cost = 0 // pure chat

  if (promptLength > 25000 || attachedFilesCount >= 3) cost += 5

  return cost
}

// ─── Session Failure Tracker ─────────────────────────────────────────────────
// Tracks models that have failed in the current session so we never retry a
// known-broken model within the same conversation.

const sessionFailedModels = new Map<string, number>() // modelId -> failure count
let currentSessionId = ''

export function startNewAiSession(sessionId: string): void {
  if (sessionId !== currentSessionId) {
    currentSessionId = sessionId
    sessionFailedModels.clear()
  }
}

function markModelFailed(modelId: string): void {
  sessionFailedModels.set(modelId, (sessionFailedModels.get(modelId) ?? 0) + 1)
}

function isModelBlacklisted(modelId: string): boolean {
  return (sessionFailedModels.get(modelId) ?? 0) >= 2
}

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
    const filePath = path.join(getUserDataPath(), 'nexus-ai-budget.json')
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
    const filePath = path.join(getUserDataPath(), 'nexus-ai-budget.json')
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

  const cachePath = path.join(getUserDataPath(), 'openrouter-models-cache.json')

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

    // Ensure all built-in free models are present
    const existingIds = new Set(cachedModels.map(m => m.id))
    for (const builtIn of NEXA_BUILTIN_MODELS) {
      if (!existingIds.has(builtIn.id)) {
        cachedModels.push({ id: builtIn.id, name: builtIn.name, context_length: 32768, pricing: { prompt: '0', completion: '0' }, description: '', architecture: undefined })
      }
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

let lastRetrievedFiles: string[] = []

export function getLastRetrievedFiles(): string[] {
  return lastRetrievedFiles
}

export async function getProjectContextForAI(root: string, prompt: string): Promise<string> {
  try {
    const { buildDependencyGraph, findRelevantFiles } = await import('./agent/projectGraphAnalyzer')
    const graph = await buildDependencyGraph(root)
    const snapshot = await workspaceEngine.getSnapshot()
    const relevantFiles = findRelevantFiles(prompt, graph, snapshot)

    const fileContents: string[] = []
    const retrievedFiles: string[] = []
    
    for (const file of relevantFiles.slice(0, 4)) {
      try {
        const content = await fs.readFile(file, 'utf-8')
        const relPath = path.relative(root, file).replace(/\\/g, '/')
        if (content.length < 100000) {
          retrievedFiles.push(relPath)
          fileContents.push(`
=== Relevant File: ${relPath} ===
\`\`\`
${content.slice(0, 6000)}
\`\`\`
`)
        }
      } catch {}
    }

    const relationships = relevantFiles.slice(0, 4).map(file => {
      const node = graph.nodes[file]
      if (!node) return ''
      const rel = path.relative(root, file).replace(/\\/g, '/')
      const deps = node.dependencies.map(d => path.relative(root, d).replace(/\\/g, '/')).join(', ')
      const imported = node.importedBy.map(d => path.relative(root, d).replace(/\\/g, '/')).join(', ')
      return `- ${rel} depends on: [${deps || 'none'}] and is imported by: [${imported || 'none'}]`
    }).filter(Boolean).join('\n')

    lastRetrievedFiles = retrievedFiles

    return `
=== PROJECT CONTEXT (ProjectContext - Hidden) ===
[Relationships]
${relationships || 'No dependencies detected.'}

[File Codes]
${fileContents.join('\n') || 'No relevant code files loaded.'}
=================================================
`
  } catch (err) {
    log.error('[AI Service] Failed to build ProjectContext:', err)
    return ''
  }
}

// ─── OpenRouter Streaming ────────────────────────────────────────────────────
// Rate limiting is enforced in main.ts IPC handler (ai:stream:start).
// This service layer is the final execution layer.

export async function askAIStream(
  prompt: string,
  options: AIRequestOptions,
  callbacks: StreamCallbacks,
  streamId?: string,
): Promise<void> {

  const start = performance.now()
  let hasSentToken = false

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

  // STEP 1 & 5: Fetch and inject WorkspaceContext & ProjectContext
  try {
    const aiHealth = getAIHealthStatus()
    const workspaceContext = await getWorkspaceContextForAI(options.projectPath || null, {
      model: options.model,
      activeFilePath: options.activeFilePath,
      activeFileContent: options.activeFileContent,
      selectedCode: options.selectedCode,
      cursorLine: options.cursorLine,
      cursorColumn: options.cursorColumn,
      licenseTier: options.licenseTier,
      isSafeMode: options.isSafeMode,
      extensions: options.extensions,
      terminalStatus: options.terminalStatus,
      recentDiagnostics: options.recentDiagnostics,
      aiHealth,
    })
    
    let projectContext = ''
    const root = options.projectPath || workspaceEngine.getRoot()
    if (root) {
      projectContext = await getProjectContextForAI(root, prompt)
    }

    const originalSysPrompt = options.systemPrompt || NEXA_SYSTEM_PROMPT
    let extraScaffoldingPrompt = ''
    if (options.isEmptyWorkspace) {
      extraScaffoldingPrompt = `
[CRITICAL INSTRUCTION FOR EMPTY WORKSPACE]
The workspace is currently empty (isEmptyWorkspace = true).
Since the workspace is empty, if the user asks to build or create a website or project (e.g. "Build me a barber shop website"):
1. You MUST automatically scaffold a complete React + Vite + TypeScript project.
2. Create a subfolder for the project named after the project (e.g. "barber-shop" if they ask for a barber shop website).
3. Do NOT output package.json, vite.config.ts, tsconfig.json, or any other configuration/code files in standard markdown code blocks in the chat response.
4. Instead, write them ONLY inside \`\`\`tool blocks (or [TOOL:...] inline blocks) so that the backend can execute them automatically.
5. In the chat response text, only provide a brief, natural language confirmation of what you created, like "I created a React + Vite barber shop website in your workspace." Do NOT print raw JSON, config file contents, or tool tags in the final text.
6. Generate all required boilerplate:
   - package.json
   - vite.config.ts
   - tsconfig.json
   - tsconfig.node.json
   - index.html
   - src/main.tsx
   - src/App.tsx
   - src/index.css
   - src/components/
   - src/pages/
   - src/assets/
   - public/
   - README.md
7. Make sure all tool calls are complete and correct.
`
    }
    options.systemPrompt = `${originalSysPrompt}\n\n${workspaceContext}\n\n${projectContext}\n\n${extraScaffoldingPrompt}`
  } catch (err) {
    log.error('[AI Service] Failed to inject context:', err)
  }

  const wrappedCallbacks: StreamCallbacks = {
    ...callbacks,
    onChunk: (chunk: string) => {
      if (!hasSentToken) {
        hasSentToken = true
        const ttft = Math.round(performance.now() - start)
        import('./telemetry').then(({ telemetry }) => {
          telemetry.trackEvent('ai-latency', { type: 'streaming-ttft', durationMs: ttft })
        }).catch(() => {})
      }
      callbacks.onChunk(chunk)
    },
    onDone: (fullText: string, metrics: any) => {
      const totalDuration = Math.round(performance.now() - start)
      import('./telemetry').then(({ telemetry }) => {
        telemetry.trackEvent('ai-latency', { type: 'streaming-total', durationMs: totalDuration })
      }).catch(() => {})
      recordAIRequestLog(true, totalDuration, options.model || 'default')
      callbacks.onDone(fullText, metrics)
    }
  }

  try {
    if (isOpenRouterKeyConfigured()) {
      const model = options.model || FALLBACK_CHAIN[0] || 'deepseek/deepseek-chat:free'
      const tried = new Set<string>([model])
      await runStreamWithFallback(prompt, model, options, wrappedCallbacks, ctrl.signal, 0, tried)
    } else {
      await runFreeAiFallbackStream(prompt, options, wrappedCallbacks, ctrl.signal)
    }
  } catch (err) {
    recordAIRequestLog(false, Math.round(performance.now() - start), options.model || 'default')
    wrappedCallbacks.onError(sanitizeErrorMessage((err as Error).message))
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
    let systemPromptToUse = options.systemPrompt || NEXA_SYSTEM_PROMPT
    if (isFreeTierModel(modelName)) {
      if (options.systemPrompt && options.systemPrompt.includes('=== WORKSPACE CONTEXT')) {
        systemPromptToUse = options.systemPrompt
      } else {
        systemPromptToUse = `${NEXA_SYSTEM_PROMPT}\n\n${options.systemPrompt || ''}`
      }
    }
    if (systemPromptToUse) {
      messages.push({ role: 'system', content: systemPromptToUse })
    }
    messages.push({ role: 'user', content: prompt })

    let res: Response | null = null
    let attempts = 0
    while (true) {
      try {
        res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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

        if (res.status === 429) {
          throw new Error('Rate limit exceeded (429)')
        }

        if (!res.ok) {
          const errorText = sanitizeErrorMessage(await res.text())
          throw new Error(`Status ${res.status}: ${errorText}`)
        }
        break
      } catch (error) {
        attempts++
        if (attempts >= 3 || signal.aborted || timeoutCtrl.signal.aborted) {
          throw error
        }
        const backoff = Math.pow(2, attempts) * 1000
        await new Promise((r) => setTimeout(r, backoff))
      }
    }

    clearTimeout(timer)

    if (!res || !res.body) {
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
    const dailySpend = isFreeTierModel(modelName) ? (await getBudgetStatus()).dailySpend : await updateSpend(estimatedCost)

    // ─── Usage Telemetry ───────────────────────────────────────────────────
    import('./telemetry').then(({ telemetry }) => {
      telemetry.trackEvent('ai-latency', {
        type: 'ai-usage',
        model: modelName,
        tier: isFreeTierModel(modelName) ? 'free' : 'premium',
        inputTokens,
        outputTokens,
        cost: estimatedCost,
        speed,
      })
    }).catch(() => {})

    recordAIRequestLog(true, Date.now() - startTime, modelName)
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

    markModelFailed(modelName)

    const nextModel = FALLBACK_CHAIN.find(
      (m) => !triedModels.has(m) && !isModelBlacklisted(m)
    )
    if (nextModel && fallbackIndex < 3) {
      triedModels.add(nextModel)
      callbacks.onChunk(`\n\n*[Switching to backup model for stability...]*\n\n`)
      const cooldown = 2000 + Math.random() * 3000
      await new Promise((r) => setTimeout(r, cooldown))
      callbacks.onChunk(`*[Optimizing response quality...]*\n\n`)
      await runStreamWithFallback(prompt, nextModel, options, callbacks, signal, fallbackIndex + 1, triedModels)
      return
    }

    if (isOpenRouterFallbackError(err)) {
      await runFreeAiFallbackStream(prompt, options, callbacks, signal)
      return
    }

    recordAIRequestLog(false, Date.now() - startTime, modelName)
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
  const start = performance.now()
  let resp = ''

  if (isOpenRouterKeyConfigured()) {
    try {
      await new Promise<void>((resolve, reject) => {
        askAIStream(
          prompt,
          options,
          {
            onChunk: (chunk) => { resp += chunk },
            onDone: (full) => { resp = full; resolve() },
            onError: (err) => { reject(new Error(err)) }
          }
        ).catch(reject)
      })
      const durationMs = Math.round(performance.now() - start)
      try {
        const { telemetry } = await import('./telemetry')
        await telemetry.trackEvent('ai-latency', { type: 'non-streaming', durationMs })
      } catch {}
      return { success: true, response: resp }
    } catch (err) {
      console.error('Non-streaming OpenRouter request failed, falling back to free:', err)
    }
  }

  resp = await generateFreeAiResponse(prompt, options)
  const durationMs = Math.round(performance.now() - start)
  try {
    const { telemetry } = await import('./telemetry')
    await telemetry.trackEvent('ai-latency', { type: 'non-streaming', durationMs })
  } catch {}
  return { success: true, response: resp }
}

