import { app, safeStorage } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const licenseServiceUrl = pathToFileURL(path.join(process.cwd(), 'electron', 'tmp', 'licenseService.js')).href
let licenseService

const STORAGE_FILE = 'license-state.bin'
const USER_DATA = path.join(process.cwd(), '.electron-user-data')

function getStoragePath() {
  return path.join(USER_DATA, STORAGE_FILE)
}

function encryptPayload(value) {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value)
  }
  return Buffer.from(value, 'utf-8').toString('base64')
}

function decryptPayload(raw) {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(raw)
  }
  return Buffer.from(raw.toString('utf-8'), 'base64').toString('utf-8')
}

async function loadRawState() {
  try {
    const raw = await fs.readFile(getStoragePath())
    return JSON.parse(decryptPayload(raw))
  } catch (err) {
    return null
  }
}

async function saveRawState(state) {
  await fs.mkdir(path.dirname(getStoragePath()), { recursive: true })
  const payload = JSON.stringify(state, null, 2)
  const encrypted = encryptPayload(payload)
  if (Buffer.isBuffer(encrypted)) {
    await fs.writeFile(getStoragePath(), encrypted)
  } else {
    await fs.writeFile(getStoragePath(), encrypted, 'utf-8')
  }
}

function report(name, passed, details = '') {
  console.log(`\n[${passed ? 'PASS' : 'FAIL'}] ${name}`)
  if (details) console.log(details)
}

async function run() {
  try {
    licenseService = await import(licenseServiceUrl)
    app.setPath('userData', USER_DATA)
    await app.whenReady()

    const reportItems = []
    const bugs = []

    const reset = async () => {
      const current = await loadRawState()
      if (current) {
        await licenseService.deactivateLicense()
      }
    }

    await reset()

    const activationKey = 'PRO-1234-5678'
    const activationStatus = await licenseService.activateLicense(activationKey)
    const activationPassed = activationStatus.plan === 'pro' && activationStatus.licenseKey === activationKey && activationStatus.deviceId && activationStatus.activatedAt && activationStatus.verifiedAt
    reportItems.push({ name: 'Activation - valid key activates and binds device', passed: activationPassed })
    if (!activationPassed) bugs.push('Activation failed to assign PRO plan or device binding.')

    const persistedStatus = await licenseService.getLicenseStatus()
    const persistencePassed = persistedStatus.licenseKey === activationKey && persistedStatus.plan === 'pro' && persistedStatus.deviceId === activationStatus.deviceId
    reportItems.push({ name: 'Activation persistence - status persisted after reload', passed: persistencePassed })
    if (!persistencePassed) bugs.push('License status did not persist after reload.')

    await licenseService.deactivateLicense()
    const freeStatus = await licenseService.getLicenseStatus()
    reportItems.push({ name: 'Free plan baseline after deactivate', passed: freeStatus.plan === 'free' && freeStatus.licenseKey === null })

    let aiOk = true
    for (let i = 1; i <= 25; i += 1) {
      const rec = await licenseService.recordAIRequest()
      if (rec.error || rec.usage.aiRequests !== i) {
        aiOk = false
        break
      }
    }
    const blockedAI = await licenseService.recordAIRequest()
    const freeAIQuotaPassed = aiOk && blockedAI.error && blockedAI.error.includes('AI usage limit')
    reportItems.push({ name: 'Free AI quota - increments and blocks at 25/day', passed: freeAIQuotaPassed })
    if (!freeAIQuotaPassed) bugs.push(`Free AI quota failed: ${blockedAI.error || 'no block'}`)

    let templateOk = true
    for (let i = 1; i <= 3; i += 1) {
      const rec = await licenseService.recordTemplateUsage()
      if (rec.error || rec.usage.templateUses !== i) {
        templateOk = false
        break
      }
    }
    const blockedTemplate = await licenseService.recordTemplateUsage()
    const freeTemplatePassed = templateOk && blockedTemplate.error && blockedTemplate.error.includes('Template usage limit')
    reportItems.push({ name: 'Free template quota - increments and blocks at 3/day', passed: freeTemplatePassed })
    if (!freeTemplatePassed) bugs.push(`Free template quota failed: ${blockedTemplate.error || 'no block'}`)

    let extensionOk = true
    for (let i = 1; i <= 5; i += 1) {
      const rec = await licenseService.recordExtensionInstall()
      if (rec.error || rec.usage.extensionInstalls !== i) {
        extensionOk = false
        break
      }
    }
    const blockedExt = await licenseService.recordExtensionInstall()
    const freeExtensionPassed = extensionOk && blockedExt.error && blockedExt.error.includes('Extension install limit')
    reportItems.push({ name: 'Free extension quota - increments and blocks at 5 total', passed: freeExtensionPassed })
    if (!freeExtensionPassed) bugs.push(`Free extension quota failed: ${blockedExt.error || 'no block'}`)

    const proStatus = await licenseService.activateLicense('PRO-9999-0000')
    const proActivatePassed = proStatus.plan === 'pro' && proStatus.licenseKey === 'PRO-9999-0000'
    reportItems.push({ name: 'Pro activation from valid key', passed: proActivatePassed })
    if (!proActivatePassed) bugs.push('Pro activation did not assign plan correctly.')

    let proUnlimitedPassed = true
    for (let i = 0; i < 10; i += 1) {
      const ai = await licenseService.recordAIRequest()
      if (ai.error) {
        proUnlimitedPassed = false
        break
      }
    }
    for (let i = 0; i < 6; i += 1) {
      const tpl = await licenseService.recordTemplateUsage()
      if (tpl.error) {
        proUnlimitedPassed = false
        break
      }
    }
    for (let i = 0; i < 6; i += 1) {
      const ext = await licenseService.recordExtensionInstall()
      if (ext.error) {
        proUnlimitedPassed = false
        break
      }
    }
    reportItems.push({ name: 'Pro unlimited quotas - AI/templates/extensions unaffected', passed: proUnlimitedPassed })
    if (!proUnlimitedPassed) bugs.push('Pro unlimited quota enforcement failed.')

    const raw = await loadRawState()
    raw.expiresAt = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
    await saveRawState(raw)
    const refreshed = await licenseService.refreshLicenseStatus()
    const refreshPassed = refreshed.plan === 'pro' && refreshed.isExpired === false && refreshed.expiresAt && new Date(refreshed.expiresAt).getTime() > Date.now()
    reportItems.push({ name: 'Refresh license - revalidates and unexpires plan', passed: refreshPassed })
    if (!refreshPassed) bugs.push('Refresh did not restore active plan correctly.')

    const beforeDeactivate = await licenseService.getLicenseStatus()
    const beforeUsage = beforeDeactivate.usage
    await licenseService.deactivateLicense()
    const afterDeactivate = await licenseService.getLicenseStatus()
    const deactivatePassed = afterDeactivate.plan === 'free' && afterDeactivate.licenseKey === null && afterDeactivate.usage.aiRequests === beforeUsage.aiRequests && afterDeactivate.usage.templateUses === beforeUsage.templateUses && afterDeactivate.usage.extensionInstalls === beforeUsage.extensionInstalls
    reportItems.push({ name: 'Deactivate - resets to free and preserves usage', passed: deactivatePassed })
    if (!deactivatePassed) bugs.push('Deactivate did not preserve usage counters or reset plan.')

    const afterReload = await licenseService.getLicenseStatus()
    const persistenceAgain = afterReload.plan === 'free' && afterReload.usage.aiRequests === afterDeactivate.usage.aiRequests
    reportItems.push({ name: 'Persistence - reload reads stored license state', passed: persistenceAgain })
    if (!persistenceAgain) bugs.push('State did not persist after reload.')

    console.log('\n===== LICENSE HARNESS REPORT =====')
    const passedItems = reportItems.filter((item) => item.passed)
    const failedItems = reportItems.filter((item) => !item.passed)
    console.log(`Passed: ${passedItems.length}/${reportItems.length}`)
    failedItems.forEach((item) => console.log(`- FAILED: ${item.name}`))
    if (bugs.length) {
      console.log('\nBugs found:')
      bugs.forEach((bug) => console.log(`- ${bug}`))
    }
    if (failedItems.length === 0) {
      console.log('\nAll tests passed.')
    }

    app.quit()
  } catch (err) {
    console.error('Harness error:', err)
    app.quit()
  }
}

run()
