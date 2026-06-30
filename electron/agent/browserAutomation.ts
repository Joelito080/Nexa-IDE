import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Browser, type Page, type ConsoleMessage, type Request } from 'playwright-chromium'
import log from 'electron-log'

export interface BrowserLogEntry {
  type: string
  text: string
  location?: string
  timestamp: string
}

const state = {
  browser: null as Browser | null,
  page: null as Page | null,
  logs: [] as BrowserLogEntry[],
}

function ensureLogEntry(type: string, text: string, location?: string) {
  return {
    type,
    text,
    location,
    timestamp: new Date().toISOString(),
  }
}

const MAX_BROWSER_LOGS = 1000

function pushLog(entry: BrowserLogEntry) {
  state.logs.push(entry)
  if (state.logs.length > MAX_BROWSER_LOGS) {
    state.logs.splice(0, state.logs.length - MAX_BROWSER_LOGS)
  }
}

function attachPageListeners(page: Page) {
  page.on('console', (message: ConsoleMessage) => {
    const text = message.text()
    const location = message.location()?.url
    pushLog(ensureLogEntry(message.type(), text, location))
  })

  page.on('pageerror', (error) => {
    pushLog(ensureLogEntry('pageerror', error.message))
  })

  page.on('requestfailed', (request: Request) => {
    pushLog(ensureLogEntry('requestfailed', `${request.url()} (${request.failure()?.errorText})`))
  })
}

async function createBrowser(headless = true): Promise<Browser> {
  log.info('[BrowserAutomation] Launching browser', { headless })
  const browser = await chromium.launch({ headless, args: ['--disable-web-security', '--no-sandbox'] })
  return browser
}

async function getPage(): Promise<Page> {
  if (!state.browser) {
    state.browser = await createBrowser()
  }

  if (!state.page || state.page.isClosed()) {
    state.page = await state.browser.newPage()
    state.logs = []
    attachPageListeners(state.page)
  }

  return state.page
}

export async function openBrowser(url: string, headless = true, timeout = 30000): Promise<string> {
  const page = await getPage()
  await page.goto(url, { waitUntil: 'networkidle', timeout })
  await page.waitForLoadState('networkidle', { timeout })
  return `Opened ${url} (${page.url()})`
}

export async function takeScreenshot(savePath: string, selector?: string): Promise<string> {
  const page = await getPage()
  const outputPath = path.resolve(savePath)
  await fsPromises.mkdir(path.dirname(outputPath), { recursive: true })

  if (selector) {
    const element = page.locator(selector)
    await element.waitFor({ state: 'visible', timeout: 10000 })
    await element.screenshot({ path: outputPath })
  } else {
    await page.screenshot({ path: outputPath, fullPage: true })
  }

  return outputPath
}

export async function clickElement(selector: string, timeout = 15000): Promise<string> {
  const page = await getPage()
  const element = page.locator(selector)
  await element.waitFor({ state: 'visible', timeout })
  await element.click({ timeout })
  return `Clicked ${selector}`
}

export async function typeText(selector: string, text: string, delay = 50, timeout = 15000): Promise<string> {
  const page = await getPage()
  const element = page.locator(selector)
  await element.waitFor({ state: 'visible', timeout })
  await element.click({ timeout })
  await element.fill('')
  await element.type(text, { delay, timeout })
  return `Typed text into ${selector}`
}

export async function inspectDom(selector = 'html', maxLength = 20000): Promise<string> {
  const page = await getPage()
  const element = page.locator(selector)
  await element.waitFor({ state: 'attached', timeout: 15000 })
  const outerHTML = await element.evaluate((el: Element) => el.outerHTML)
  return outerHTML.length > maxLength ? outerHTML.slice(0, maxLength) + '\n...[truncated]' : outerHTML
}

export async function getConsoleLogs(): Promise<BrowserLogEntry[]> {
  await getPage()
  return [...state.logs]
}

export async function closeBrowser(): Promise<void> {
  try {
    if (state.page && !state.page.isClosed()) {
      await state.page.close()
    }
  } catch (err) {
    log.error('[BrowserAutomation] Error closing page:', err)
  }
  try {
    if (state.browser && state.browser.isConnected()) {
      await state.browser.close()
    }
  } catch (err) {
    log.error('[BrowserAutomation] Error closing browser:', err)
  } finally {
    state.browser = null
    state.page = null
    state.logs = []
  }
}
