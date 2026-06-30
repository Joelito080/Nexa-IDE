import fsPromises from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import { executeTool, type ToolContext } from './toolHandlers'

export interface ValidationResult {
  success: boolean
  tscSuccess: boolean
  buildSuccess: boolean
  output: string
  errors: string[]
}

async function readPackageJson(rootPath: string): Promise<{ hasBuildScript: boolean }> {
  try {
    const pkgPath = path.join(rootPath, 'package.json')
    const raw = await fsPromises.readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> }
    return { hasBuildScript: Boolean(pkg.scripts?.build) }
  } catch {
    return { hasBuildScript: false }
  }
}

function getTypeScriptCommand(rootPath: string): string {
  const localTscJs = path.join(rootPath, 'node_modules', 'typescript', 'bin', 'tsc')

  if (fs.existsSync(localTscJs)) {
    return `node "${localTscJs}"`
  }

  return 'npx tsc'
}

function parseErrors(output: string): string[] {
  const lines = output.split(/\r?\n/)
  return lines.filter((line) => /error|failed|cannot/i.test(line)).slice(-20)
}

export async function validateWorkspace(
  ctx: ToolContext,
  options: { runBuild?: boolean } = {},
): Promise<ValidationResult> {
  const rootPath = ctx.workspaceRoot
  const tscCommand = `${getTypeScriptCommand(rootPath)} --noEmit`
  const tscResult = await executeTool('run_terminal', { command: tscCommand }, ctx)
  const tscErrors = tscResult.success ? [] : parseErrors(tscResult.output)

  let buildSuccess = true
  let buildOutput = ''

  if (options.runBuild) {
    const { hasBuildScript } = await readPackageJson(rootPath)
    if (hasBuildScript) {
      const buildResult = await executeTool('run_terminal', { command: 'npm run build --if-present' }, ctx)
      buildSuccess = buildResult.success
      buildOutput = buildResult.output
    }
  }

  const output = [
    `TS check: ${tscResult.success ? 'passed' : 'failed'}`,
    tscResult.output.trim(),
    options.runBuild ? `Build: ${buildSuccess ? 'passed' : 'failed'}` : 'Build: skipped',
    buildOutput.trim(),
  ]
    .filter(Boolean)
    .join('\n\n')

  return {
    success: tscResult.success && buildSuccess,
    tscSuccess: tscResult.success,
    buildSuccess,
    output,
    errors: [...tscErrors],
  }
}
