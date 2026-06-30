import { chromium } from 'playwright-chromium'

const mockApi = {
  invoke: async (channel) => (channel === 'test:isTestSuiteActive' ? true : null),
  settings: {
    load: async () => ({
      settings: {
        firstRunComplete: true,
        aiPanelOpen: true,
        sidebarOpen: false,
        bottomPanelOpen: false,
        aiChatHistory: Array.from({ length: 30 }, (_, i) => ({
          id: `m${i}`,
          role: i % 2 ? 'assistant' : 'user',
          content: `Message ${i}\n${'line\n'.repeat(8)}`,
          timestamp: new Date().toISOString(),
        })),
      },
    }),
    save: async () => ({}),
  },
  license: {
    status: async () => ({ tier: 'pro' }),
    canUseAI: async () => true,
    recordAIRequest: async () => ({}),
    activate: async () => ({ tier: 'pro' }),
  },
  ai: {
    listModels: async () => ({ models: [] }),
    getBudget: async () => ({ dailySpend: 0, limit: 5 }),
    onChunk: () => () => {},
    onEnd: () => () => {},
    onError: () => () => {},
  },
  workspace: { setRoot: async () => {}, mount: async () => ({}) },
  window: { onQuitRequest: () => () => {}, readyToQuit: () => {} },
  fs: { readDir: async () => [], stat: async () => ({ isFile: false }), writeFile: async () => ({}) },
  app: { allowPath: () => {}, logRendererError: async () => ({}) },
  on: () => () => {},
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

await page.addInitScript((api) => {
  window.electronAPI = api
}, mockApi)

await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('.nexus-scrollbar-visible', { timeout: 60000 })
await page.waitForTimeout(2000)

const result = await page.evaluate(() => {
  const msg = document.querySelector('.nexus-scrollbar-visible')
  const composer = document.querySelector('textarea')
  const header = document.querySelector('.shrink-0.relative.z-20')

  if (!msg) {
    return {
      ok: false,
      reason: 'message list not found',
      bodyText: document.body.innerText.slice(0, 300),
    }
  }

  const cs = getComputedStyle(msg)
  const msgRect = msg.getBoundingClientRect()
  const composerRect = composer?.getBoundingClientRect()
  const headerRect = header?.getBoundingClientRect()

  const before = msg.scrollTop
  msg.scrollTop = 999999
  const after = msg.scrollTop

  return {
    ok: true,
    overflowY: cs.overflowY,
    classes: msg.className,
    clientHeight: msg.clientHeight,
    scrollHeight: msg.scrollHeight,
    canScroll: msg.scrollHeight > msg.clientHeight + 5,
    scrollTopBefore: before,
    scrollTopAfter: after,
    scrollWorks: after > before,
    headerAboveMessages: headerRect ? headerRect.bottom <= msgRect.top + 2 : null,
    composerBelowMessages: composerRect ? composerRect.top >= msgRect.bottom - 2 : null,
    viewportHeight: window.innerHeight,
    pageOverflow: document.documentElement.scrollHeight > window.innerHeight,
  }
})

console.log(JSON.stringify(result, null, 2))
await browser.close()
process.exit(result.ok && result.canScroll && result.scrollWorks ? 0 : 1)
