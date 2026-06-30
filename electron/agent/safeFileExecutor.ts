import path from 'node:path'
import { runCoder } from './subAgents'
import { executeTool, parseToolCalls, type ToolContext, type ToolResult } from './toolHandlers'
import { buildFileContext } from './fileContextEngine'
import { resolveWorkspacePath } from '../safetyRules'
import type { ExecutionPlan } from './executionPlannerV2'
import type { AIRequestOptions } from '../aiService'

export interface ExecutionResult {
  success: boolean
  filesModified: string[]
  changes: string[]
  toolResults: ToolResult[]
  output: string
}

function normalizeFilePath(filePath: string, workspaceRoot: string): string {
  const resolved = resolveWorkspacePath(filePath, workspaceRoot)
  if (!resolved) return filePath
  return path.relative(workspaceRoot, resolved).replace(/\\/g, '/')
}

export async function executePlan(
  task: string,
  plan: ExecutionPlan,
  ctx: ToolContext,
  aiOptions: AIRequestOptions,
  onProgress?: (message: string) => void,
): Promise<ExecutionResult> {
  const filesModified = new Set<string>()
  const toolResults: ToolResult[] = []
  const changes: string[] = []

  for (const step of plan.steps) {
    onProgress?.(`Executing plan step ${step.id}: ${path.basename(step.filePath)}`)
    const fileContext = await buildFileContext(step.filePath)
    const fileHint = fileContext
      ? `FILE CONTEXT:
${fileContext.structureSummary}
Language: ${fileContext.language}
Line count: ${fileContext.lineCount}`
      : `Unable to load file context for ${step.filePath}`

    const coderInput = `${task}

PLAN STEP: ${step.description}

${step.prompt}

${fileHint}`
    const coderResult = await runCoder(task, coderInput, step.prompt, { ...aiOptions, systemPrompt: `Active file: ${step.filePath}` })
    const callText = coderResult.response
    console.log(`[DEBUG] step=${step.id} file=${step.filePath} callText=${JSON.stringify(callText).slice(0,300)}`)
    const calls = parseToolCalls(callText)
    console.log(`[DEBUG] step=${step.id} calls=${calls.length}`)
    if (calls.length === 0) {
      changes.push(`Step ${step.id} generated no tool blocks.`)
      continue
    }

    for (const call of calls) {
      if (call.args?.path && ['write_file', 'edit_file', 'delete_file', 'create_folder'].includes(call.tool)) {
        filesModified.add(normalizeFilePath(call.args.path, ctx.workspaceRoot))
      }
      onProgress?.(`Applying tool ${call.tool} for ${step.id}`)
      const result = await executeTool(call.tool, call.args, ctx)
      toolResults.push(result)
      changes.push(`Step ${step.id} ${call.tool} -> ${result.success ? 'success' : 'failed'}`)
      if (!result.success) {
        break
      }
    }
  }

  const success = toolResults.length > 0 && toolResults.every((result) => result.success)
  return {
    success,
    filesModified: Array.from(filesModified),
    changes,
    toolResults,
    output: changes.join('\n'),
  }
}
