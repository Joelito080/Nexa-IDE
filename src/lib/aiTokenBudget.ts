export interface PromptSection {
  id: string
  content: string
  preserve?: boolean
  allowTruncate?: boolean
  priority?: number
  category?: 'system' | 'attachments' | 'selectedFile' | 'importedFiles' | 'workspace' | 'history' | 'user' | 'directive'
}

export interface TokenBudgetResult {
  prompt: string
  truncated: boolean
  promptTokens: number
  reservedOutputTokens: number
  truncationEvents?: string[]
}

export function estimateTokens(text: string): number {
  return Math.max(0, Math.ceil(text.length / 4))
}

export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const maxChars = Math.max(0, Math.floor(maxTokens * 4))
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n...[truncated for context limit]...`
}

export function calculatePromptBudget(maxTokens: number, contextLimit: number, reserveOutputRatio = 0.2) {
  const reservedOutputTokens = Math.max(1, Math.ceil(maxTokens * reserveOutputRatio))
  const promptBudget = Math.max(0, Math.min(contextLimit - reservedOutputTokens, maxTokens - reservedOutputTokens))
  return { promptBudget, reservedOutputTokens }
}

export function buildTokenBudgetedPrompt(params: {
  sections: PromptSection[]
  historySections?: PromptSection[]
  promptBudget: number
  reservedOutputTokens?: number
}): TokenBudgetResult {
  const { sections, historySections = [], promptBudget, reservedOutputTokens = Math.ceil(promptBudget * 0.2) } = params
  let remainingBudget = promptBudget
  let truncated = false
  const truncationEvents: string[] = []

  const finalizedParts: string[] = []

  const addSection = (section: PromptSection) => {
    const sectionTokens = estimateTokens(section.content)

    if (section.preserve) {
      if (sectionTokens <= remainingBudget) {
        finalizedParts.push(section.content)
        remainingBudget -= sectionTokens
      } else if (section.allowTruncate && remainingBudget > 0) {
        const truncatedContent = truncateToTokenBudget(section.content, remainingBudget)
        finalizedParts.push(truncatedContent)
        remainingBudget = 0
        truncated = true
        truncationEvents.push(`${section.id}: Truncated preserved section (needed ${sectionTokens}, had ${remainingBudget})`)
      } else if (!section.allowTruncate) {
        finalizedParts.push(section.content)
        truncated = true
        truncationEvents.push(`${section.id}: Preserved section exceeded budget (${sectionTokens} tokens)`)
      }
      return
    }

    if (sectionTokens <= remainingBudget) {
      finalizedParts.push(section.content)
      remainingBudget -= sectionTokens
      return
    }

    if (section.allowTruncate && remainingBudget > 0) {
      const truncatedContent = truncateToTokenBudget(section.content, remainingBudget)
      finalizedParts.push(truncatedContent)
      remainingBudget = 0
      truncated = true
      truncationEvents.push(`${section.id}: Truncated (needed ${sectionTokens}, had ${remainingBudget})`)
    } else if (section.allowTruncate) {
      truncationEvents.push(`${section.id}: Omitted (budget exhausted)`)
    }
  }

  const orderedSections = [...sections]
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))

  for (const section of orderedSections) {
    if (section.category === 'history') continue
    addSection(section)
  }

  if (historySections.length > 0 && remainingBudget > 0) {
    const preservedHistory: PromptSection[] = []
    const reversed = [...historySections].reverse()
    for (const section of reversed) {
      const sectionTokens = estimateTokens(section.content)
      if (sectionTokens <= remainingBudget) {
        preservedHistory.unshift(section)
        remainingBudget -= sectionTokens
      } else if (section.allowTruncate && remainingBudget > 0) {
        const truncatedContent = truncateToTokenBudget(section.content, remainingBudget)
        preservedHistory.unshift({ ...section, content: truncatedContent })
        remainingBudget = 0
        truncated = true
        truncationEvents.push(`${section.id}: History truncated`)
        break
      } else {
        break
      }
    }
    for (const section of preservedHistory) {
      finalizedParts.push(section.content)
    }
  }

  const prompt = finalizedParts.filter(Boolean).join('\n\n')
  return {
    prompt,
    truncated,
    promptTokens: estimateTokens(prompt),
    reservedOutputTokens,
    truncationEvents,
  }
}
