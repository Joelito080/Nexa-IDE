import { AgentExecutor } from '../src/ai/agent/freeAgentMode'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const results: { name: string; ok: boolean; detail?: string }[] = []

function record(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`)
}

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-agent-'))
await fs.writeFile(path.join(tmpDir, 'package.json'), '{"name":"verify"}\n')
await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true })

const executor = new AgentExecutor({ projectRoot: tmpDir, confirmChanges: true, safeMode: true })
for (const text of ['hello', 'build a login page', 'fix this bug']) {
  const report = await executor.executeMultiAgent(text, { fileContext: [], projectStructure: ['src/'] })
  record(
    `Agent free-agent: "${text}"`,
    Boolean(report?.plan?.goal && report.plan.steps?.length > 0),
    report?.plan?.goal?.slice(0, 70) ?? 'no plan',
  )
}
await fs.rm(tmpDir, { recursive: true, force: true })

const failed = results.filter((r) => !r.ok)
console.log(`\n--- Agent Summary: ${results.length - failed.length}/${results.length} passed ---`)
process.exit(failed.length ? 1 : 0)
