import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { runAgentLoop, type AgentRunResult } from '../electron/agent/agentLoop.ts'
import { buildDependencyGraph, findRelevantFiles } from '../electron/agent/projectGraphAnalyzer.ts'
import { createExecutionPlan } from '../electron/agent/executionPlannerV2.ts'
import { executePlan } from '../electron/agent/safeFileExecutor.ts'
import { validateWorkspace } from '../electron/agent/validationEngine.ts'
import { runSelfHealingLoop } from '../electron/agent/selfHealingLoopV2.ts'
import { workspaceEngine } from '../electron/workspaceEngine.ts'
import type { ToolContext } from '../electron/agent/toolHandlers.ts'

async function localDetectProjectIntent(prompt: string, systemPrompt?: string) {
  const lower = (prompt || '').toLowerCase().trim()
  const hasActiveFile = Boolean(systemPrompt && /Active file:/i.test(systemPrompt))

  // Slash commands
  if (lower.startsWith('/fix')) return 'FIX_PROJECT'
  if (lower.startsWith('/debug')) return 'DEBUG_ERROR'
  if (lower.startsWith('/explain')) return 'EXPLAIN_CODE'
  if (lower.startsWith('/chat')) return 'CHAT'
  if (lower.startsWith('/build')) return 'BUILD_PROJECT'
  if (lower.startsWith('/generate')) return 'GENERATE_COMPONENT'
  if (lower.startsWith('/refactor')) return 'FIX_PROJECT'
  if (lower.startsWith('/plan')) return 'PLAN_ARCHITECTURE'

  if (/\b(build a|build an|build|make me a|make a|create a|create an|scaffold|generate project|scaffold project)\b/.test(lower)) {
    return hasActiveFile ? 'PLAN_ARCHITECTURE' : 'BUILD_PROJECT'
  }
  if (/\b(fix|repair|bug|issue|broken|resolve)\b/.test(lower)) return 'FIX_PROJECT'
  if (/\b(why is this|why does this|crash|crashing|exception|stack trace|error|fails|failed)\b/.test(lower)) return 'DEBUG_ERROR'
  if (/\b(explain|what is|what are|how does|how do|describe|document)\b/.test(lower)) return hasActiveFile ? 'EXPLAIN_CODE' : 'PLAN_ARCHITECTURE'
  if (/\b(component|generate component|create component|button component|widget)\b/.test(lower)) return 'GENERATE_COMPONENT'
  if (/\b(plan|architecture|roadmap|design|approach)\b/.test(lower)) return 'PLAN_ARCHITECTURE'
  if (/^(hi|hello|hey|thanks|thank you|thx|ok|okay|sure)\b/.test(lower) || lower.length <= 20) return 'CHAT'
  return hasActiveFile ? 'EXPLAIN_CODE' : 'CHAT'
}

function buildWorkspaceContext(snapshot: Awaited<ReturnType<typeof workspaceEngine.getSnapshot>>, filePath?: string | null, fileContent?: string | null) {
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

async function runTestCase(task: string, projectPath: string, filePath?: string | null, fileContent?: string | null) {
  const result: any = { task, detectedIntent: null, graph: null, relevantFiles: null, executionPlan: null, executionResult: null, validation: null, selfHealing: null, agentRun: null }

  const systemPrompt = filePath ? `Active file: ${filePath}` : undefined
  result.detectedIntent = await localDetectProjectIntent(task, systemPrompt)

  // Build dependency graph
  const graph = await buildDependencyGraph(projectPath)
  result.graph = { files: graph.files.length, nodes: Object.keys(graph.nodes).length, packageDependencies: graph.packageDependencies.slice(0, 20) }

  // snapshot
  const snapshot = await workspaceEngine.getSnapshot()

  // Find relevant files
  const relevantFiles = findRelevantFiles(task, graph, snapshot)
  result.relevantFiles = relevantFiles.slice(0, 20)

  // Build context and plan
  const wsContext = buildWorkspaceContext(snapshot, filePath ?? null, fileContent ?? null)
  const plan = createExecutionPlan(task, wsContext, graph, relevantFiles)
  result.executionPlan = { summary: plan.summary, steps: plan.steps.map((s) => ({ id: s.id, file: path.relative(projectPath, s.filePath), description: s.description })) }

  // Prepare tool context
  const ctx: ToolContext = {
    workspaceRoot: projectPath,
    cwd: snapshot.projectRoot ?? projectPath,
    onTerminalOutput: (line) => { /* ignore or collect */ },
  }

  // Execute plan (safe executor)
  try {
    const execResult = await executePlan(task, plan, ctx, { projectPath })
    result.executionResult = { success: execResult.success, filesModified: execResult.filesModified, changes: execResult.changes }
  } catch (err) {
    result.executionResult = { success: false, error: (err as Error).message }
  }

  // Validate workspace
  try {
    const validation = await validateWorkspace(ctx, { runBuild: false })
    result.validation = validation
  } catch (err) {
    result.validation = { success: false, error: (err as Error).message }
  }

  // Run self-healing if validation failed
  if (result.validation && result.validation.success === false) {
    try {
      const healing = await runSelfHealingLoop(ctx, result.validation, wsContext, { projectPath }, 2)
      result.selfHealing = healing
    } catch (err) {
      result.selfHealing = { success: false, error: (err as Error).message }
    }
  }

  // Run the full agent loop for end-to-end
  try {
    const agentRes: AgentRunResult = await runAgentLoop({ task, projectPath, filePath: filePath ?? null, fileContent: fileContent ?? null })
    result.agentRun = { success: agentRes.success, phases: agentRes.phases, plan: agentRes.plan, response: agentRes.response?.slice(0, 4000) }
  } catch (err) {
    result.agentRun = { success: false, error: (err as Error).message }
  }

  return result
}

async function main() {
  const projectPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  console.log('Project path:', projectPath)

  const tests = [
    '/fix package.json',
    '/fix tsconfig.json',
    '/fix broken imports in src/components',
  ]

  const natural = [
    { text: 'build a saas', expect: 'BUILD_PROJECT' },
    { text: 'make me a dashboard', expect: 'BUILD_PROJECT' },
    { text: 'explain this package.json', expect: 'EXPLAIN_CODE' },
    { text: 'fix this React error', expect: 'FIX_PROJECT' },
  ]

  const results: any = { tests: [], natural: [] }

  for (const t of tests) {
    process.stdout.write(`Running test: ${t} ... `)
    const res = await runTestCase(t, projectPath)
    results.tests.push(res)
    process.stdout.write('done\n')
  }

  for (const n of natural) {
    const detected = await localDetectProjectIntent(n.text)
    results.natural.push({ text: n.text, expected: n.expect, detected })
  }

  const outPath = path.join(projectPath, 'agent-test-output.json')
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8')
  console.log('\nWrote results to', outPath)
  console.log('\nSummary:')
  console.log(JSON.stringify({ tests: results.tests.map((r: any) => ({ task: r.task, detectedIntent: r.detectedIntent, agentSuccess: r.agentRun?.success ?? false, filesModified: r.executionResult?.filesModified })) }, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
