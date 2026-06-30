import { askAI, type AIRequestOptions } from '../aiService'
import { TOOL_DEFINITIONS } from './toolHandlers'
import { memoryService } from './memoryService'

export type AgentRole = 'planner' | 'coder' | 'debugger' | 'tester'

const ROLE_PROMPTS: Record<AgentRole, string> = {
  planner: `You are the PLANNER AGENT inside NEXA IDE.
Your job: analyze the user task and create a clear, step-by-step roadmap.
Output format:
## PLAN
### Phase 1: BUILD
- ...
### Phase 2: TEST
- ...
### Phase 3: FIX
- ...
### Phase 4: DEPLOY
- ...
### Phase 5: MONITOR
- ...
Be concise. List files to create/modify and commands to run.`,

  coder: `You are the CODER AGENT inside NEXA IDE.
Your job: write and edit code files based on the plan.
When you need to execute a tool, output:
\`\`\`tool
{"tool": "write_file", "args": {"path": "relative/path", "content": "..."}}
\`\`\`
Or for edits:
\`\`\`tool
{"tool": "edit_file", "args": {"path": "file.ts", "changes": "[{\\"search\\": \\"old\\", \\"replace\\": \\"new\\"}]"}}
\`\`\`
Preserve existing coding style. Make minimal changes.`,

  debugger: `You are the DEBUGGER AGENT inside NEXA IDE.
Your job: analyze errors, diagnose root causes, and propose fixes.
When fixing, output tool blocks for edit_file or run_terminal.
Focus on: missing imports, syntax errors, failed installs, build errors.
Suggest self-healing steps first (npm install, fix imports).`,

  tester: `You are the TESTER AGENT inside NEXA IDE.
Your job: verify the application works.
Run: npm run build, npm test, npm run dev (if applicable).
Output tool blocks:
\`\`\`tool
{"tool": "run_terminal", "args": {"command": "npm run build"}}
\`\`\`
Report pass/fail with evidence from terminal output.`,
}

export interface SubAgentResult {
  role: AgentRole
  response: string
  success: boolean
}

export async function runSubAgent(
  role: AgentRole,
  task: string,
  context: string,
  options: AIRequestOptions = {},
): Promise<SubAgentResult> {
  const memoryContext = memoryService.getContextPrompt()
  const toolsList = TOOL_DEFINITIONS.map((t) => `- ${t.name}(${t.params.join(', ')}): ${t.description}`).join('\n')

  const prompt = `${ROLE_PROMPTS[role]}

AVAILABLE TOOLS:
${toolsList}

MEMORY:
${memoryContext}

WORKSPACE CONTEXT:
${context}

USER TASK:
${task}`

  const result = await askAI(prompt, options)
  return {
    role,
    response: result.response,
    success: result.success,
  }
}

export async function runPlanner(task: string, context: string, options?: AIRequestOptions) {
  return runSubAgent('planner', task, context, options)
}

export async function runCoder(task: string, context: string, plan: string, options?: AIRequestOptions) {
  return runSubAgent('coder', `${task}\n\nPLAN TO FOLLOW:\n${plan}`, context, options)
}

export async function runDebugger(errorOutput: string, context: string, options?: AIRequestOptions) {
  return runSubAgent('debugger', `Fix these errors:\n${errorOutput}`, context, options)
}

export async function runTester(task: string, context: string, options?: AIRequestOptions) {
  return runSubAgent('tester', `Verify task completion: ${task}`, context, options)
}

