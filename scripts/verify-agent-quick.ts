import { AgentExecutor, MultiAgentOrchestrator } from '../src/ai/agent/freeAgentMode'
import { createFreeAgentPlan } from '../src/ai/agent/freeAgentMode'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-agent-'))
await fs.writeFile(path.join(tmpDir, 'package.json'), '{"name":"verify"}\n')
await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true })

const executor = new AgentExecutor({ projectRoot: tmpDir, confirmChanges: false, safeMode: true })
const plan = createFreeAgentPlan('hello')
console.log('plan ok', plan.goal)

const graph = await executor.getProjectIntelligenceGraph()
console.log('graph ok', graph.nodes.length)

const orchestrator = new MultiAgentOrchestrator(executor)
const report = await Promise.race([
  orchestrator.orchestrate('hello'),
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20_000)),
])
console.log('PASS', report.summary)
await fs.rm(tmpDir, { recursive: true, force: true })
