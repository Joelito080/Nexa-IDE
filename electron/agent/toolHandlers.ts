import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import log from 'electron-log'
import { searchFiles } from '../search/searchEngine'
import {
  isPathInsideWorkspace,
  resolveWorkspacePath,
  sanitizeCommand,
  redactSecrets,
  isAllowedProgram,
} from '../safetyRules'
import { workspaceEngine } from '../workspaceEngine'
import { memoryService } from './memoryService'
import {
  openBrowser,
  takeScreenshot,
  clickElement,
  typeText,
  inspectDom,
  getConsoleLogs,
} from './browserAutomation'

export interface ToolResult {
  success: boolean
  output: string
  data?: unknown
  error?: string
}

export interface ToolContext {
  workspaceRoot: string
  cwd: string
  onTerminalOutput?: (line: string) => void
  activePreviewUrl?: string
  gitSnapshotHash?: string
  gitRoot?: string
  isAutonomousFix?: boolean
}

export type ToolName =
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'delete_file'
  | 'create_folder'
  | 'list_files'
  | 'run_terminal'
  | 'install_package'
  | 'search_code'
  | 'open_browser'
  | 'take_screenshot'
  | 'click'
  | 'type'
  | 'inspect_dom'
  | 'get_console_logs'
  | 'git_status'
  | 'git_diff'
  | 'git_commit'
  | 'git_revert'
  | 'git_branch'
  | 'git_checkout'

export const TOOL_DEFINITIONS = [
  { name: 'read_file', description: 'Read file contents from workspace', params: ['path'] },
  { name: 'write_file', description: 'Write content to a file', params: ['path', 'content'] },
  { name: 'edit_file', description: 'Apply search/replace edits to a file', params: ['path', 'changes'] },
  { name: 'delete_file', description: 'Delete a file or folder in workspace', params: ['path'] },
  { name: 'create_folder', description: 'Create a directory in workspace', params: ['path'] },
  { name: 'list_files', description: 'List files in a directory', params: ['path?'] },
  { name: 'run_terminal', description: 'Run a shell command in workspace cwd', params: ['command'] },
  { name: 'install_package', description: 'Install npm/pnpm package', params: ['package'] },
  { name: 'search_code', description: 'Search for text in workspace files', params: ['query'] },
  { name: 'open_browser', description: 'Open a browser page to a URL for UI inspection', params: ['url', 'headless?'] },
  { name: 'take_screenshot', description: 'Capture a screenshot of the current browser page or selector', params: ['path', 'selector?'] },
  { name: 'click', description: 'Click a page element using CSS selector', params: ['selector'] },
  { name: 'type', description: 'Type text into a page element using CSS selector', params: ['selector', 'text'] },
  { name: 'inspect_dom', description: 'Inspect DOM tree or element HTML from the current page', params: ['selector?'] },
  { name: 'get_console_logs', description: 'Retrieve browser console and page error logs', params: [] },
  { name: 'git_status', description: 'Show git status for the workspace', params: [] },
  { name: 'git_diff', description: 'Show git diff for the current workspace or path', params: ['path?'] },
  { name: 'git_commit', description: 'Commit outstanding changes with a message', params: ['message'] },
  { name: 'git_revert', description: 'Revert a commit by hash', params: ['commit'] },
  { name: 'git_branch', description: 'Create a new git branch', params: ['name'] },
  { name: 'git_checkout', description: 'Checkout or switch to a git branch', params: ['branch'] },
] as const

async function readFileTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const resolved = resolveWorkspacePath(args.path, ctx.workspaceRoot)
  if (!resolved) return { success: false, output: '', error: 'Path outside workspace or invalid' }

  try {
    const content = await fsPromises.readFile(resolved, 'utf-8')
    return { success: true, output: content, data: { path: resolved, lines: content.split('\n').length } }
  } catch (err) {
    return { success: false, output: '', error: (err as Error).message }
  }
}

async function writeFileTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const resolved = resolveWorkspacePath(args.path, ctx.workspaceRoot)
  if (!resolved) return { success: false, output: '', error: 'Path outside workspace or invalid' }

  await captureGitSnapshot(ctx)
  try {
    await fsPromises.mkdir(path.dirname(resolved), { recursive: true })
    await fsPromises.writeFile(resolved, args.content ?? '', 'utf-8')
    workspaceEngine.trackRecentFile(resolved)
    const result = { success: true, output: `Wrote ${resolved} (${(args.content ?? '').length} bytes)` }
    return await autoSnapshotAndDiffAfterChange(args.path ?? null, ctx, result.success, result.output)
  } catch (err) {
    return { success: false, output: '', error: (err as Error).message }
  }
}

async function editFileTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const resolved = resolveWorkspacePath(args.path, ctx.workspaceRoot)
  if (!resolved) return { success: false, output: '', error: 'Path outside workspace or invalid' }

  await captureGitSnapshot(ctx)
  try {
    const content = await fsPromises.readFile(resolved, 'utf-8')
    const changes = JSON.parse(args.changes || '[]') as Array<{ search: string; replace: string }>

    if (!Array.isArray(changes) || changes.length === 0) {
      return { success: false, output: '', error: 'No valid changes provided' }
    }

    const LARGE_FILE = 250 * 1024
    let applied = 0
    let resultContent = content

    if (resultContent.length > LARGE_FILE) {
      // Line-by-line for large files — avoids multi-MB string allocations per replace
      let lines = resultContent.split('\n')
      for (const change of changes) {
        if (!resultContent.includes(change.search)) continue
        let found = false
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(change.search)) {
            lines[i] = lines[i].replace(change.search, change.replace)
            found = true
            applied++
          }
        }
        if (found) {
          resultContent = lines.join('\n')
          lines = resultContent.split('\n')
        }
      }
    } else {
      // Whole-string replace is faster for small files
      for (const change of changes) {
        if (!resultContent.includes(change.search)) continue
        resultContent = resultContent.replace(change.search, change.replace)
        applied++
      }
    }

    if (applied === 0) {
      return { success: false, output: resultContent, error: 'No matching text found for edits' }
    }

    await fsPromises.writeFile(resolved, resultContent, 'utf-8')
    workspaceEngine.trackRecentFile(resolved)
    const result = { success: true, output: `Applied ${applied} edit(s) to ${resolved}` }
    return await autoSnapshotAndDiffAfterChange(args.path ?? null, ctx, result.success, result.output)
  } catch (err) {
    return { success: false, output: '', error: (err as Error).message }
  }
}

async function deleteFileTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const resolved = resolveWorkspacePath(args.path, ctx.workspaceRoot)
  if (!resolved) return { success: false, output: '', error: 'Path outside workspace or invalid' }
  if (!isPathInsideWorkspace(resolved, ctx.workspaceRoot)) {
    return { success: false, output: '', error: 'Cannot delete outside workspace' }
  }

  await captureGitSnapshot(ctx)
  try {
    const stat = await fsPromises.stat(resolved)
    if (stat.isDirectory()) {
      await fsPromises.rm(resolved, { recursive: true, force: true })
    } else {
      await fsPromises.unlink(resolved)
    }
    const result = { success: true, output: `Deleted ${resolved}` }
    return await autoSnapshotAndDiffAfterChange(args.path ?? null, ctx, result.success, result.output)
  } catch (err) {
    return { success: false, output: '', error: (err as Error).message }
  }
}

async function createFolderTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const resolved = resolveWorkspacePath(args.path, ctx.workspaceRoot)
  if (!resolved) return { success: false, output: '', error: 'Path outside workspace or invalid' }

  await captureGitSnapshot(ctx)
  try {
    await fsPromises.mkdir(resolved, { recursive: true })
    const result = { success: true, output: `Created folder ${resolved}` }
    return await autoSnapshotAndDiffAfterChange(args.path ?? null, ctx, result.success, result.output)
  } catch (err) {
    return { success: false, output: '', error: (err as Error).message }
  }
}

async function listFilesTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const targetPath = args.path ? resolveWorkspacePath(args.path, ctx.workspaceRoot) : ctx.cwd
  if (!targetPath) return { success: false, output: '', error: 'Invalid path' }

  try {
    const entries = await fsPromises.readdir(targetPath, { withFileTypes: true })
    const listing = entries.map((e) => `${e.isDirectory() ? '[dir]' : '[file]'} ${e.name}`).join('\n')
    return { success: true, output: listing, data: { path: targetPath, count: entries.length } }
  } catch (err) {
    return { success: false, output: '', error: (err as Error).message }
  }
}

const LOCALHOST_URL_REGEX = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[\w\-./?&=#%]*)?/i

function extractPreviewUrl(text: string): string | null {
  const match = LOCALHOST_URL_REGEX.exec(text)
  return match?.[0] ?? null
}

// Parse a command string into [executable, ...args] respecting quoted strings.
// Returns null if the command contains chained operators (&&, ||, ;, |) outside quotes.
function parseCommand(command: string): string[] | null {
  const CHAIN_PATTERN = /(?:^|[^"'])\s*(&&|\|\|)\s*(?:$|[^"'])/g
  // Check for chain operators outside quotes
  const stripped = command.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '')
  if (/[;&|]/.test(stripped) || CHAIN_PATTERN.test(stripped)) return null

  const args: string[] = []
  let current = ''
  let inQuote = false
  let quoteChar = ''
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (inQuote) {
      if (ch === '\\' && i + 1 < command.length && command[i + 1] === quoteChar) {
        current += command[i + 1]
        i++
      } else if (ch === quoteChar) {
        inQuote = false
      } else {
        current += ch
      }
    } else if (ch === '\\' && i + 1 < command.length) {
      const next = command[i + 1]
      if (next === quoteChar || next === '\\' || next === ' ') {
        current += next
        i++
      } else {
        current += '\\' + next
        i++
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true
      quoteChar = ch
    } else if (ch === ' ') {
      if (current) { args.push(current); current = '' }
    } else {
      current += ch
    }
  }
  if (current) args.push(current)
  return args.length > 0 ? args : null
}

function resolveCommandExecutable(execArgs: string[]): string[] {
  if (execArgs[0] === 'npx') {
    return ['npm', 'exec', '--', ...execArgs.slice(1)]
  }
  return execArgs
}

// Single unified execution layer — ALL tool execution goes through here.
function spawnTool(
  execArgs: string[],
  cwd: string,
  onOutput?: (line: string) => void,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const resolvedExecArgs = resolveCommandExecutable(execArgs)
    const [executable, ...args] = resolvedExecArgs
    if (!isAllowedProgram(executable)) {
      resolve({ code: 1, output: `Command rejected: "${executable}" is not in the allowed programs list` })
      return
    }

    const child = spawn(executable, args, { cwd, shell: false, env: { ...process.env } })

    let output = ''
    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString()
      output += text
      onOutput?.(text)
    })
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString()
      output += text
      onOutput?.(text)
    })
    child.on('close', (code) => resolve({ code, output: redactSecrets(output) }))
    child.on('error', (err) => resolve({ code: 1, output: err.message }))
  })
}

// Validate a command string via parseCommand, then delegate to spawnTool.
// This is the ONLY path from string commands — spawnTool is the single execution layer.
function runCommandAsync(
  command: string,
  cwd: string,
  onOutput?: (line: string) => void,
): Promise<{ code: number | null; output: string }> {
  const check = sanitizeCommand(command)
  if (!check.safe) {
    return Promise.resolve({ code: 1, output: check.reason ?? 'Blocked' })
  }

  const parsed = parseCommand(command)
  if (!parsed) {
    return Promise.resolve({ code: 1, output: 'Command rejected: chained operators (&&, ||, ;, |) are not allowed' })
  }

  return spawnTool(parsed, cwd, onOutput)
}

async function runTerminalTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const command = args.command?.trim()
  if (!command) return { success: false, output: '', error: 'Empty command' }

  const check = sanitizeCommand(command)
  if (!check.safe) return { success: false, output: '', error: check.reason }

  log.info(`[Agent] run_terminal: ${command} in ${ctx.cwd}`)
  ctx.onTerminalOutput?.(`$ ${command}`)

  let accumulatedOutput = ''
  const onStreamOutput = (chunk: string) => {
    accumulatedOutput += chunk
    ctx.onTerminalOutput?.(chunk)
    const previewUrl = extractPreviewUrl(chunk)
    if (previewUrl && previewUrl !== ctx.activePreviewUrl) {
      ctx.activePreviewUrl = previewUrl
      ctx.onTerminalOutput?.(`[Agent] Detected preview URL: ${previewUrl}`)
    }
  }

  const { code, output } = await runCommandAsync(command, ctx.cwd, onStreamOutput)
  const finalOutput = accumulatedOutput || output
  const previewUrl = extractPreviewUrl(finalOutput)
  if (previewUrl && previewUrl !== ctx.activePreviewUrl) {
    ctx.activePreviewUrl = previewUrl
    ctx.onTerminalOutput?.(`[Agent] Detected preview URL: ${previewUrl}`)
  }

  workspaceEngine.trackRecentFile(ctx.cwd)
  return {
    success: code === 0,
    output: redactSecrets(finalOutput),
    error: code !== 0 ? `Exit code ${code}` : undefined,
  }
}

async function installPackageTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const pkg = args.package?.trim()
  if (!pkg) return { success: false, output: '', error: 'Package name required' }

  await captureGitSnapshot(ctx)
  const snapshot = await workspaceEngine.getSnapshot()
  const pm = snapshot.packageManager ?? 'npm'
  const command = pm === 'pnpm'
    ? `pnpm add ${pkg}`
    : pm === 'yarn'
      ? `yarn add ${pkg}`
      : `npm install ${pkg}`

  const result = await runTerminalTool({ command }, ctx)
  return await autoSnapshotAndDiffAfterChange(null, ctx, result.success, result.output)
}

async function ensureGitRoot(ctx: ToolContext): Promise<string | null> {
  if (ctx.gitRoot) return ctx.gitRoot
  const result = await runCommandAsync('git rev-parse --show-toplevel', ctx.cwd)
  if (result.code !== 0) return null
  ctx.gitRoot = result.output.trim()
  return ctx.gitRoot
}

async function captureGitSnapshot(ctx: ToolContext): Promise<string | null> {
  const root = await ensureGitRoot(ctx)
  if (!root) return null
  const result = await runCommandAsync('git rev-parse HEAD', ctx.cwd)
  if (result.code !== 0) return null
  ctx.gitSnapshotHash = result.output.trim()
  return ctx.gitSnapshotHash
}

async function gitDiffForPath(ctx: ToolContext, targetPath?: string): Promise<string> {
  const root = await ensureGitRoot(ctx)
  if (!root) return ''
  const diffArg = targetPath ? `-- ${targetPath}` : '-- .'
  const result = await runCommandAsync(`git diff --stat ${diffArg}`, ctx.cwd)
  return result.output.trim() || 'No diff detected.'
}

async function gitCommitHistoryTag(ctx: ToolContext): Promise<string> {
  return ctx.isAutonomousFix ? '[autonomous fix]' : '[manual commit]'
}

async function autoSnapshotAndDiffAfterChange(pathArg: string | null, ctx: ToolContext, success: boolean, baseOutput: string): Promise<ToolResult> {
  if (!success) return { success, output: baseOutput }
  const diffOutput = await gitDiffForPath(ctx, pathArg ?? undefined)
  return { success, output: `${baseOutput}\n\nGit diff:\n${diffOutput}` }
}

async function runGitStatusTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const root = await ensureGitRoot(ctx)
  if (!root) return { success: false, output: 'Not inside a git repository', error: 'No git root found' }

  const result = await runCommandAsync('git status --short --branch', ctx.cwd)
  return { success: result.code === 0, output: result.output.trim(), error: result.code !== 0 ? 'git status failed' : undefined }
}

async function runGitDiffTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const root = await ensureGitRoot(ctx)
  if (!root) return { success: false, output: 'Not inside a git repository', error: 'No git root found' }
  const pathArg = args.path?.trim()
  const result = await runCommandAsync(pathArg ? `git diff --stat -- ${pathArg}` : 'git diff --stat', ctx.cwd)
  return { success: result.code === 0, output: result.output.trim() || 'No diff detected', error: result.code !== 0 ? 'git diff failed' : undefined }
}

async function runGitCommitTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const root = await ensureGitRoot(ctx)
  if (!root) return { success: false, output: 'Not inside a git repository', error: 'No git root found' }
  const message = args.message?.trim()
  if (!message) return { success: false, output: '', error: 'Commit message required' }

  await runCommandAsync('git add -A', ctx.cwd)
  const commitResult = await spawnTool(['git', 'commit', '-m', message], ctx.cwd)
  if (commitResult.code !== 0) {
    return { success: false, output: commitResult.output.trim(), error: 'git commit failed' }
  }

  const hashRes = await runCommandAsync('git rev-parse HEAD', ctx.cwd)
  const branchRes = await runCommandAsync('git rev-parse --abbrev-ref HEAD', ctx.cwd)
  const hash = hashRes.code === 0 ? hashRes.output.trim() : 'unknown'
  const branch = branchRes.code === 0 ? branchRes.output.trim() : 'unknown'

  memoryService.trackGitCommit(hash, message, branch, ctx.isAutonomousFix ?? false)
  const tag = await gitCommitHistoryTag(ctx)
  return {
    success: true,
    output: `Committed ${hash} on ${branch} ${tag}`,
    data: { commit: hash, branch, message, autonomous: ctx.isAutonomousFix ?? false },
  }
}

async function runGitRevertTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const root = await ensureGitRoot(ctx)
  if (!root) return { success: false, output: 'Not inside a git repository', error: 'No git root found' }
  const commit = args.commit?.trim()
  if (!commit) return { success: false, output: '', error: 'Commit hash required' }

  const result = await runCommandAsync(`git revert --no-edit ${commit}`, ctx.cwd)
  return { success: result.code === 0, output: result.output.trim(), error: result.code !== 0 ? 'git revert failed' : undefined }
}

async function runGitBranchTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const root = await ensureGitRoot(ctx)
  if (!root) return { success: false, output: 'Not inside a git repository', error: 'No git root found' }
  const name = args.name?.trim()
  if (!name) return { success: false, output: '', error: 'Branch name required' }

  const result = await runCommandAsync(`git branch ${name}`, ctx.cwd)
  return { success: result.code === 0, output: result.output.trim() || `Branch ${name} created`, error: result.code !== 0 ? 'git branch failed' : undefined }
}

async function runGitCheckoutTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const root = await ensureGitRoot(ctx)
  if (!root) return { success: false, output: 'Not inside a git repository', error: 'No git root found' }
  const branch = args.branch?.trim()
  if (!branch) return { success: false, output: '', error: 'Branch required' }

  const result = await runCommandAsync(`git checkout ${branch}`, ctx.cwd)
  return { success: result.code === 0, output: result.output.trim() || `Checked out ${branch}`, error: result.code !== 0 ? 'git checkout failed' : undefined }
}

export async function revertGitSnapshot(ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.gitSnapshotHash) return { success: false, output: 'No snapshot available', error: 'Snapshot not captured' }
  const result = await runCommandAsync(`git reset --hard ${ctx.gitSnapshotHash}`, ctx.cwd)
  if (result.code !== 0) {
    return { success: false, output: result.output.trim(), error: 'Git rollback failed' }
  }
  return { success: true, output: `Rolled back to ${ctx.gitSnapshotHash}` }
}

async function searchCodeTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const query = args.query?.trim()
  if (!query) return { success: false, output: '', error: 'Query required' }

  try {
    const results = await searchFiles({
      projectPath: ctx.workspaceRoot,
      query,
      maxResults: 100,
    })
    const output = results.length
      ? results.map((r) => `${r.file}:${r.line}: ${r.text}`).join('\n')
      : 'No matches found'
    return { success: true, output, data: { count: results.length } }
  } catch (err) {
    return { success: false, output: '', error: (err as Error).message }
  }
}

async function openBrowserTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const url = args.url?.trim()
  if (!url) return { success: false, output: '', error: 'URL required' }

  try {
    const headless = args.headless === 'false' ? false : true
    const output = await openBrowser(url, headless)
    return { success: true, output }
  } catch (err) {
    return { success: false, output: '', error: (err as Error).message }
  }
}

async function takeScreenshotTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const screenshotPath = args.path?.trim()
  if (!screenshotPath) return { success: false, output: '', error: 'Path required' }

  try {
    const saved = await takeScreenshot(screenshotPath, args.selector?.trim())
    return { success: true, output: `Screenshot saved to ${saved}`, data: { screenshotPath: saved } }
  } catch (err) {
    return { success: false, output: '', error: (err as Error).message }
  }
}

async function clickTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const selector = args.selector?.trim()
  if (!selector) return { success: false, output: '', error: 'Selector required' }

  try {
    const output = await clickElement(selector)
    return { success: true, output }
  } catch (err) {
    return { success: false, output: '', error: (err as Error).message }
  }
}

async function typeTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  const selector = args.selector?.trim()
  const text = args.text ?? ''
  if (!selector) return { success: false, output: '', error: 'Selector required' }
  if (text === '') return { success: false, output: '', error: 'Text required' }

  try {
    const output = await typeText(selector, text)
    return { success: true, output }
  } catch (err) {
    return { success: false, output: '', error: (err as Error).message }
  }
}

async function inspectDomTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  try {
    const selector = args.selector?.trim() || 'html'
    const dom = await inspectDom(selector)
    return { success: true, output: dom, data: { selector } }
  } catch (err) {
    return { success: false, output: '', error: (err as Error).message }
  }
}

async function getConsoleLogsTool(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
  try {
    const logs = await getConsoleLogs()
    return { success: true, output: JSON.stringify(logs, null, 2), data: { logs } }
  } catch (err) {
    return { success: false, output: '', error: (err as Error).message }
  }
}

const HANDLERS: Record<ToolName, (args: Record<string, string>, ctx: ToolContext) => Promise<ToolResult>> = {
  read_file: readFileTool,
  write_file: writeFileTool,
  edit_file: editFileTool,
  delete_file: deleteFileTool,
  create_folder: createFolderTool,
  list_files: listFilesTool,
  run_terminal: runTerminalTool,
  install_package: installPackageTool,
  search_code: searchCodeTool,
  open_browser: openBrowserTool,
  take_screenshot: takeScreenshotTool,
  click: clickTool,
  type: typeTool,
  inspect_dom: inspectDomTool,
  get_console_logs: getConsoleLogsTool,
  git_status: runGitStatusTool,
  git_diff: runGitDiffTool,
  git_commit: runGitCommitTool,
  git_revert: runGitRevertTool,
  git_branch: runGitBranchTool,
  git_checkout: runGitCheckoutTool,
}

export async function executeTool(
  name: ToolName,
  args: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const handler = HANDLERS[name]
  if (!handler) {
    return { success: false, output: '', error: `Unknown tool: ${name}` }
  }

  if (name === 'run_terminal' && args.command && !isAllowedProgram(args.command.split(/\s+/)[0])) {
    const check = sanitizeCommand(args.command)
    if (!check.safe) return { success: false, output: '', error: check.reason }
  }

  try {
    return await handler(args, ctx)
  } catch (err) {
    log.error(`[Agent] Tool ${name} failed:`, err)
    return { success: false, output: '', error: (err as Error).message }
  }
}

function normalizeToolArgs(args: unknown): Record<string, string> | null {
  if (args == null || typeof args !== 'object') return null

  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (typeof value === 'string') {
      result[key] = value
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = String(value)
    } else if (Array.isArray(value) || typeof value === 'object') {
      result[key] = JSON.stringify(value)
    } else if (value == null) {
      result[key] = ''
    }
  }
  return result
}

function isPlaceholderChange(changes: string | null): boolean {
  if (!changes) return false
  return changes.includes('"search": "old"') && changes.includes('"replace": "new"')
}

function isPlaceholderToolCall(call: { tool: ToolName; args: Record<string, string> }): boolean {
  const { tool, args } = call
  if (tool === 'write_file' && args.path === 'relative/path') {
    return args.content?.trim() === '...'
  }
  if (tool === 'edit_file' && args.path === 'file.ts') {
    return isPlaceholderChange(args.changes ?? null)
  }
  if (tool === 'edit_file' && isPlaceholderChange(args.changes ?? null)) return true
  return false
}

export function parseToolCalls(text: string): Array<{ tool: ToolName; args: Record<string, string> }> {
  const calls: Array<{ tool: ToolName; args: Record<string, string> }> = []
  const blockRegex = /```tool\s*\n([\s\S]*?)```/gi
  let match

  while ((match = blockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim())
      if (parsed.tool && HANDLERS[parsed.tool as ToolName]) {
        const normalizedArgs = normalizeToolArgs(parsed.args ?? {})
        if (!normalizedArgs) continue
        const call = { tool: parsed.tool, args: normalizedArgs }
        if (!isPlaceholderToolCall(call)) calls.push(call)
      }
    } catch { /* skip invalid blocks */ }
  }

  const inlineRegex = /\[TOOL:(\w+)\s+(\{[\s\S]*?\})\]/g
  while ((match = inlineRegex.exec(text)) !== null) {
    try {
      const tool = match[1] as ToolName
      const args = JSON.parse(match[2])
      const normalizedArgs = normalizeToolArgs(args)
      if (!normalizedArgs) continue
      const call = { tool, args: normalizedArgs }
      if (HANDLERS[tool] && !isPlaceholderToolCall(call)) calls.push(call)
    } catch { /* skip */ }
  }

  return calls
}
