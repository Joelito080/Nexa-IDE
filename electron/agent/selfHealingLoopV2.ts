import { attemptSelfHeal } from './selfHealing'
import { runDebugger } from './subAgents'
import { executeTool, type ToolContext } from './toolHandlers'
import { validateWorkspace, type ValidationResult } from './validationEngine'
import { type AIRequestOptions } from '../aiService'
import { parseToolCalls } from './toolHandlers'

export interface SelfHealingLoopResult {
  success: boolean
  cycles: number
  actions: string[]
  output: string
  validation: ValidationResult
}

export async function runSelfHealingLoop(
  ctx: ToolContext,
  validation: ValidationResult,
  workspaceContext: string,
  aiOptions: AIRequestOptions,
  maxCycles = 2,
  onProgress?: (message: string) => void,
): Promise<SelfHealingLoopResult> {
  let currentValidation = validation
  const actionLog: string[] = []

  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    if (currentValidation.success) {
      return {
        success: true,
        cycles: cycle - 1,
        actions: actionLog,
        output: `Validation passed after ${cycle - 1} healing cycles.`,
        validation: currentValidation,
      }
    }

    onProgress?.(`Self-healing cycle ${cycle}`)
    const heal = await attemptSelfHeal(currentValidation.output, ctx)
    if (heal.detected && heal.actions.length > 0) {
      for (const action of heal.actions) {
        actionLog.push(`${action.type}: ${action.description}${action.filePath ? ` (${action.filePath})` : ''}`)
        if (action.type === 'install' && action.command) {
          const result = await executeTool('install_package', { package: action.command }, ctx)
          actionLog.push(`install result: ${result.success ? 'ok' : 'failed'}`)
          if (!result.success) actionLog.push(result.error ?? result.output)
        } else if (action.type === 'run' && action.command) {
          const result = await executeTool('run_terminal', { command: action.command }, ctx)
          actionLog.push(`run result: ${result.success ? 'ok' : 'failed'}`)
          if (!result.success) actionLog.push(result.error ?? result.output)
        } else if (action.type === 'retry' && action.command) {
          const result = await executeTool('run_terminal', { command: action.command }, ctx)
          actionLog.push(`retry result: ${result.success ? 'ok' : 'failed'}`)
          if (!result.success) actionLog.push(result.error ?? result.output)
        } else if (action.type === 'edit' && action.filePath) {
          actionLog.push(`manual edit suggestion for ${action.filePath}`)
        }
      }
    }

    if ((!heal.detected || heal.actions.length === 0) && !currentValidation.success) {
      onProgress?.('FALLBACK to debugger agent for validation failure')
      const debugResult = await runDebugger(currentValidation.output, workspaceContext, aiOptions)
      const calls = parseToolCalls(debugResult.response)
      if (calls.length === 0) {
        actionLog.push('Debugger produced no actionable tool blocks.')
        break
      }
      for (const call of calls) {
        actionLog.push(`debugger tool: ${call.tool} ${JSON.stringify(call.args)}`)
        const result = await executeTool(call.tool, call.args, ctx)
        actionLog.push(`debugger result: ${result.success ? 'ok' : 'failed'}`)
        if (!result.success) actionLog.push(result.error ?? result.output)
      }
    }

    currentValidation = await validateWorkspace(ctx, { runBuild: false })
  }

  return {
    success: currentValidation.success,
    cycles: maxCycles,
    actions: actionLog,
    output: currentValidation.output,
    validation: currentValidation,
  }
}
