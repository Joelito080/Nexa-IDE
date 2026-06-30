import path from 'node:path'
import log from 'electron-log'
import { askAI, type AIRequestOptions } from '../aiService'
import { workspaceEngine } from '../workspaceEngine'
import { memoryService } from './memoryService'
import { executeTool, type ToolContext, type ToolResult } from './toolHandlers'
import { findTemplateByPrompt, createProject, installDependencies } from '../projectTemplates'
import { buildDependencyGraph, findRelevantFiles } from './projectGraphAnalyzer'
import { createExecutionPlan } from './executionPlannerV2'
import { executePlan as runExecutionPlan } from './safeFileExecutor'
import { validateWorkspace } from './validationEngine'
import { runSelfHealingLoop } from './selfHealingLoopV2'

export type AgentPhase = 'UNDERSTAND' | 'PLAN' | 'ACT' | 'BUILD' | 'TEST' | 'FIX' | 'DEPLOY' | 'MONITOR' | 'COMPLETE'

export interface AgentProgressEvent {
  phase: AgentPhase
  message: string
  detail?: string
}

export interface AgentRunRequest {
  task: string
  projectPath: string | null
  filePath?: string | null
  fileContent?: string | null
  provider?: string
  model?: string
  userDataPath?: string
  onProgress?: (event: AgentProgressEvent) => void
}

export interface AgentRunResult {
  success: boolean
  response: string
  phases: AgentPhase[]
  toolResults: ToolResult[]
  plan?: string
}

const PROJECT_KEYWORDS = /\b(build|create|make|scaffold|generate)\b.*\b(saas|dashboard|app|api|bot|website|project)\b/i

function emit(onProgress: AgentRunRequest['onProgress'], phase: AgentPhase, message: string, detail?: string) {
  onProgress?.({ phase, message, detail })
  log.info(`[Agent:${phase}] ${message}`)
}

function buildWorkspaceContext(snapshot: Awaited<ReturnType<typeof workspaceEngine.getSnapshot>>, filePath?: string | null, fileContent?: string | null): string {
  const parts = [
    `Root: ${snapshot.rootPath}`,
    `Project root: ${snapshot.projectRoot}`,
    `CWD: ${snapshot.cwd}`,
    `Type: ${snapshot.detectedType ?? 'unknown'}`,
    `Package manager: ${snapshot.packageManager ?? 'npm'}`,
    `Summary: ${snapshot.summary}`,
  ]
  if (filePath) parts.push(`Active file: ${filePath}`)
  if (fileContent) parts.push(`Active file content (truncated):\n${fileContent.slice(0, 3000)}`)
  parts.push(`Recent files: ${snapshot.recentFiles.slice(0, 8).join(', ')}`)
  return parts.join('\n')
}

async function handleProjectGeneration(
  task: string,
  projectPath: string,
  onProgress?: AgentRunRequest['onProgress'],
): Promise<{ success: boolean; message: string; path?: string }> {
  emit(onProgress, 'ACT', 'Scaffolding project from template')
  const templateId = findTemplateByPrompt(task)
  const projectName = task.match(/(?:called|named)\s+["']?(\w[\w-]*)/i)?.[1] ?? 'nexus-project'

  try {
    const result = await createProject(projectPath, templateId, projectName)
    emit(onProgress, 'ACT', `Created project at ${result.path}`)
    const install = await installDependencies(result.path)
    emit(onProgress, 'ACT', install.message)

    return {
      success: install.success,
      message: `Created ${templateId} project at ${result.path}. ${install.message}. Run "npm run dev" to start.`,
      path: result.path,
    }
  } catch (err) {
    return { success: false, message: (err as Error).message }
  }
}

export async function runAgentLoop(request: AgentRunRequest): Promise<AgentRunResult> {
  const { task, projectPath, onProgress } = request
  const phases: AgentPhase[] = []
  const toolResults: ToolResult[] = []

  if (!projectPath) {
    return {
      success: false,
      response: 'Open a workspace folder before running the agent.',
      phases: ['UNDERSTAND'],
      toolResults: [],
    }
  }

  if (request.userDataPath) {
    memoryService.setStoragePath(request.userDataPath, projectPath)
    await memoryService.load(projectPath)
  }

  memoryService.setGoal(task)
  workspaceEngine.setRoot(projectPath)
  await workspaceEngine.loadFileTree()
  const snapshot = await workspaceEngine.getSnapshot()

  const aiOptions: AIRequestOptions = {
    model: request.model,
    projectPath,
  }

  // ── UNDERSTAND ──
  phases.push('UNDERSTAND')
  emit(onProgress, 'UNDERSTAND', 'Analyzing task and workspace')
  memoryService.addTaskEntry(task, 'UNDERSTAND', 'running')

  const wsContext = buildWorkspaceContext(snapshot, request.filePath, request.fileContent)

  if (PROJECT_KEYWORDS.test(task)) {
    phases.push('ACT', 'COMPLETE')
    const gen = await handleProjectGeneration(task, projectPath, onProgress)
    memoryService.addTaskEntry(task, 'COMPLETE', gen.success ? 'completed' : 'failed', gen.message)
    return {
      success: gen.success,
      response: gen.message,
      phases,
      toolResults,
      plan: `Auto-scaffold: ${findTemplateByPrompt(task)}`,
    }
  }

  phases.push('PLAN')
  emit(onProgress, 'PLAN', 'Analyzing project structure and generating execution plan')

  const graph = await buildDependencyGraph(projectPath)
  log.info(`[Agent:PLAN] Built dependency graph: ${graph.files.length} files, ${Object.keys(graph.nodes).length} nodes`)
  
  const relevantFiles = findRelevantFiles(task, graph, snapshot)
  log.info(`[Agent:PLAN] Found ${relevantFiles.length} relevant files for task`)
  
  const executionPlan = createExecutionPlan(task, wsContext, graph, relevantFiles)
  memoryService.setPlan(executionPlan.summary)
  log.info(`[Agent:PLAN] Created execution plan with ${executionPlan.steps.length} steps`)

  const ctx: ToolContext = {
    workspaceRoot: projectPath,
    cwd: snapshot.projectRoot ?? projectPath,
    onTerminalOutput: (line) => emit(onProgress, 'ACT', 'Terminal', line.slice(0, 500)),
    activePreviewUrl: undefined,
    gitSnapshotHash: undefined,
    gitRoot: undefined,
  }

  phases.push('ACT')
  emit(onProgress, 'ACT', 'Executing file-level plan with safe edits')
  log.info(`[Agent:ACT] Starting execution of ${executionPlan.steps.length} plan steps`)
  
  const executionResult = await runExecutionPlan(task, executionPlan, ctx, aiOptions, (message) => emit(onProgress, 'ACT', message))
  toolResults.push(...executionResult.toolResults)
  
  log.info(`[Agent:ACT] Execution complete: ${executionResult.success ? 'success' : 'failed'} | Files modified: ${executionResult.filesModified.length} | Tools: ${executionResult.toolResults.length}`)

  const plan = executionPlan.summary
  let combinedResponse = `Execution plan summary:\n${executionPlan.summary}\nFiles modified: ${executionResult.filesModified.join(', ') || 'none'}\nChanges:\n${executionResult.output}`

  if (!executionResult.success) {
    emit(onProgress, 'FIX', 'Execution plan produced no effective edits or encountered failures')
    log.warn(`[Agent:ACT] Plan execution failed, will validate and potentially self-heal`)
  }

  phases.push('TEST')
  emit(onProgress, 'TEST', 'Validating workspace after edits')
  log.info(`[Agent:TEST] Running TypeScript type check and optional build validation`)
  
  const validation = await validateWorkspace(ctx, { runBuild: false })
  combinedResponse += `\n\nValidation result:\n${validation.output}`
  
  log.info(`[Agent:TEST] Validation: TS check ${validation.tscSuccess ? 'passed' : 'FAILED'} | Build ${validation.buildSuccess ? 'passed' : 'skipped'} | Errors: ${validation.errors.length}`)

  if (!validation.success) {
    emit(onProgress, 'FIX', 'Validation failed, running self-healing loop')
    log.warn(`[Agent:FIX] Starting self-healing loop due to validation failure`)
    
    const healing = await runSelfHealingLoop(ctx, validation, wsContext, aiOptions, 2, (message) => emit(onProgress, 'FIX', message))
    combinedResponse += `\n\nSelf-healing outcome:\n${healing.output}\nActions:\n${healing.actions.join('\n')}`
    
    log.info(`[Agent:FIX] Self-healing complete: ${healing.success ? 'SUCCESS' : 'INCOMPLETE'} | Cycles: ${healing.cycles} | Actions: ${healing.actions.length}`)
    
    if (healing.success) {
      emit(onProgress, 'FIX', 'Self-healing loop succeeded')
    } else {
      emit(onProgress, 'FIX', 'Self-healing loop completed without fully resolving validation failures')
    }
  }

  phases.push('COMPLETE')
  const success = executionResult.success && validation.success
  const finalStatus = success ? 'Success' : 'Completed with issues'
  emit(onProgress, 'COMPLETE', `Agent run ${finalStatus.toLowerCase()}`)
  
  log.info(`[Agent:COMPLETE] Final status: ${finalStatus} | Success: ${success} | Files: ${executionResult.filesModified.length} | Tools: ${toolResults.length}`)

  combinedResponse += `\n\nFinal status: ${finalStatus}`
  combinedResponse += `\nFiles modified: ${executionResult.filesModified.join(', ') || 'none'}`
  combinedResponse += `\nValidation success: ${validation.success}`

  return {
    success,
    response: combinedResponse,
    phases,
    toolResults,
    plan,
  }
}
