import { askAI } from '../electron/aiService'

process.env.OPENROUTER_API_KEY = ''

const prompts = [
  { label: 'hello', text: 'hello' },
  { label: 'login page', text: 'build a login page' },
  { label: 'fix bug', text: 'fix this bug in my component' },
]

let passed = 0
for (const { label, text } of prompts) {
  const result = await askAI(text, {})
  const response = result?.response ?? ''
  const has402 = /\b402\b|insufficient credits|payment required/i.test(response)
  const ok = result?.success !== false && response.length > 40 && !has402
  console.log(`${ok ? 'PASS' : 'FAIL'} AI Free Mode: "${label}"${ok ? '' : `: ${response.slice(0, 80)}`}`)
  if (ok) passed += 1
}

console.log(`\n--- AI Summary: ${passed}/${prompts.length} passed ---`)
process.exit(passed === prompts.length ? 0 : 1)
