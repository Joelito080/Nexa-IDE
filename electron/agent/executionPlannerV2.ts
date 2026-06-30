import path from 'node:path'
import { ProjectGraph } from './projectGraphAnalyzer'

export interface ExecutionStep {
  id: string
  filePath: string
  description: string
  prompt: string
}

export interface ExecutionPlan {
  summary: string
  steps: ExecutionStep[]
  files: string[]
}

function normalizePathForPrompt(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).replace(/\\/g, '/')
}

export function createExecutionPlan(
  task: string,
  context: string,
  graph: ProjectGraph,
  relevantFiles: string[],
): ExecutionPlan {
  const files = relevantFiles.length ? relevantFiles : [path.join(graph.rootPath, 'package.json')]
  const steps: ExecutionStep[] = files.map((filePath, index) => {
    const relative = normalizePathForPrompt(graph.rootPath, filePath)
    const node = graph.nodes[filePath]
    const dependencyHint = node
      ? `This file imports ${node.dependencies.length} files and is imported by ${node.importedBy.length} files.`
      : 'No dependency metadata is available for this file.'

    const description = `Review and safely update ${relative} to address the task with minimal local changes.`
    const prompt = `TASK: ${task}

PROJECT CONTEXT:
${context}

TARGET FILE: ${relative}
${dependencyHint}

RULES:
- Only modify ${relative} unless explicitly requested.
- Do not regenerate the entire project or unrelated files.
- Apply the smallest possible patch.
- Preserve style, imports, and existing behavior.
- Do not delete folder structure.

ACTION:
Make only the required edits to fix or implement this request in ${relative}. Provide valid tool blocks for write_file or edit_file if a file change is needed.`

    return {
      id: `step-${index + 1}`,
      filePath,
      description,
      prompt,
    }
  })

  const summary = `Generated ${steps.length} file-level step(s) for task: ${task}. Files: ${steps.map((s) => normalizePathForPrompt(graph.rootPath, s.filePath)).join(', ')}`
  return { summary, steps, files }
}
