export interface ContextSource {
  id: string
  category: 'system' | 'attachments' | 'selectedFile' | 'importedFiles' | 'workspace' | 'history' | 'user' | 'directive'
  label: string
  tokenCount: number
  preserved: boolean
  truncated: boolean
}

export interface AiDebugInfo {
  requestId: string
  timestamp: number
  provider: string
  modelName: string
  temperature: number
  maxTokens: number
  topP: number
  contextLimit: number
  promptBudget: number
  reservedOutputTokens: number
  
  // Prompt composition
  finalPrompt: string
  promptTokens: number
  contextSources: ContextSource[]
  truncationEvents: string[]
  
  // Execution
  startTime?: number
  endTime?: number
  latencyMs?: number
  
  // Results
  outputTokens?: number
  totalTokens?: number
  responsePreview?: string
  error?: string
  errorCode?: string
}

export class AiDebugInfoBuilder {
  private info: AiDebugInfo

  constructor(requestId: string, provider: string, modelName: string) {
    this.info = {
      requestId,
      timestamp: Date.now(),
      provider,
      modelName,
      temperature: 0.5,
      maxTokens: 1024,
      topP: 1,
      contextLimit: 128000,
      promptBudget: 0,
      reservedOutputTokens: 0,
      finalPrompt: '',
      promptTokens: 0,
      contextSources: [],
      truncationEvents: [],
    }
  }

  setModelParams(temperature: number, maxTokens: number, topP: number) {
    this.info.temperature = temperature
    this.info.maxTokens = maxTokens
    this.info.topP = topP
  }

  setBudgetInfo(contextLimit: number, promptBudget: number, reservedOutputTokens: number) {
    this.info.contextLimit = contextLimit
    this.info.promptBudget = promptBudget
    this.info.reservedOutputTokens = reservedOutputTokens
  }

  setPrompt(prompt: string, tokenCount: number) {
    this.info.finalPrompt = prompt
    this.info.promptTokens = tokenCount
  }

  addContextSource(source: ContextSource) {
    this.info.contextSources.push(source)
  }

  addTruncationEvent(event: string) {
    this.info.truncationEvents.push(event)
  }

  startRequest() {
    this.info.startTime = Date.now()
  }

  endRequest(outputTokens?: number, responsePreview?: string, error?: string) {
    this.info.endTime = Date.now()
    if (this.info.startTime) {
      this.info.latencyMs = this.info.endTime - this.info.startTime
    }
    if (outputTokens !== undefined) {
      this.info.outputTokens = outputTokens
      this.info.totalTokens = this.info.promptTokens + outputTokens
    }
    if (responsePreview) {
      this.info.responsePreview = responsePreview.slice(0, 200)
    }
    if (error) {
      this.info.error = error
    }
  }

  build(): AiDebugInfo {
    return this.info
  }
}

// Global debug state
let globalDebugMode = false
let lastDebugInfo: AiDebugInfo | null = null

export function setDebugMode(enabled: boolean) {
  globalDebugMode = enabled
}

export function isDebugMode(): boolean {
  return globalDebugMode
}

export function setLastDebugInfo(info: AiDebugInfo) {
  lastDebugInfo = info
}

export function getLastDebugInfo(): AiDebugInfo | null {
  return lastDebugInfo
}
