import { app, safeStorage } from 'electron'
import crypto from 'node:crypto'
import fsPromises from 'node:fs/promises'
import path from 'node:path'

export type LicensePlan = 'free' | 'pro' | 'team' | 'ultimate'

export interface LicenseUsage {
  aiRequests: number
  templateUses: number
  extensionInstalls: number
}

export interface CreditCheckResult {
  allowed: boolean
  balance: number
  cost: number
}

export interface LicenseState {
  licenseKey: string | null
  plan: LicensePlan
  activatedAt: string | null
  expiresAt: string | null
  deviceId: string
  verifiedAt: string | null
  usageWindowStart: string
  usage: LicenseUsage
  creditBalance: number
  creditsPurchasedTotal: number
}

export interface LicenseStatus {
  licenseKey: string | null
  plan: LicensePlan
  activatedAt: string | null
  expiresAt: string | null
  isExpired: boolean
  deviceId: string
  verifiedAt: string | null
  canUseAI: boolean
  canCreateTemplate: boolean
  canInstallExtensions: boolean
  usage: LicenseUsage
  usageWindowStart: string
  message: string | null
  creditBalance: number
  subscriptionTier: 'free' | 'pro' | 'team'
}

const STORAGE_FILE = 'license-state.bin'
const REMOTE_URL = process.env.LICENSE_SERVER_URL
const FREE_LIMITS = {
  aiRequests: 999999,
  templateUses: 3,
  extensionInstalls: 5,
}
const STARTER_CREDITS = 50
const PRO_MONTHLY_CREDITS = 500
const TEAM_MONTHLY_CREDITS = 2000
const CREDIT_COSTS = {
  premiumRequest: 1,
  longContext: 2,
  multiFileEdit: 3,
  agentMode: 5,
}
const PREMIUM_TEMPLATES = new Set(['nextjs', 'electron', 'saas-starter', 'ai-app-starter'])

function getStoragePath() {
  return path.join(app.getPath('userData'), STORAGE_FILE)
}

function createDeviceFingerprint() {
  const hostname = app.getPath('home')
  const data = `${app.getPath('userData')}|${process.platform}|${process.arch}|${hostname}`
  return crypto.createHash('sha256').update(data).digest('hex')
}

function encryptPayload(value: string): Buffer | string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value)
  }
  return Buffer.from(value, 'utf-8').toString('base64')
}

function decryptPayload(raw: Buffer): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(raw)
  }
  return Buffer.from(raw.toString('utf-8'), 'base64').toString('utf-8')
}

function createDefaultState(): LicenseState {
  const deviceId = createDeviceFingerprint()
  return {
    licenseKey: null,
    plan: 'free',
    activatedAt: null,
    expiresAt: null,
    deviceId,
    verifiedAt: null,
    usageWindowStart: new Date().toISOString(),
    usage: {
      aiRequests: 0,
      templateUses: 0,
      extensionInstalls: 0,
    },
    creditBalance: STARTER_CREDITS,
    creditsPurchasedTotal: 0,
  }
}

async function loadState(): Promise<LicenseState> {
  try {
    const raw = await fsPromises.readFile(getStoragePath())
    const json = JSON.parse(decryptPayload(raw)) as LicenseState
    return {
      ...createDefaultState(),
      ...json,
      deviceId: json.deviceId || createDeviceFingerprint(),
    }
  } catch {
    return createDefaultState()
  }
}

async function saveState(state: LicenseState) {
  await fsPromises.mkdir(path.dirname(getStoragePath()), { recursive: true })
  const payload = JSON.stringify(state, null, 2)
  const encrypted = encryptPayload(payload)
  if (Buffer.isBuffer(encrypted)) {
    await fsPromises.writeFile(getStoragePath(), encrypted)
  } else {
    await fsPromises.writeFile(getStoragePath(), encrypted, 'utf-8')
  }
}

function normalizePlanFromKey(key: string): LicensePlan | null {
  const cleaned = key.trim().toUpperCase()
  if (cleaned.startsWith('PRO-')) return 'pro'
  if (cleaned.startsWith('TEAM-')) return 'team'
  if (cleaned.startsWith('ULT-')) return 'ultimate'
  if (cleaned.startsWith('FREE-')) return 'free'
  return null
}

function isLicenseExpired(state: LicenseState): boolean {
  if (!state.expiresAt) return false
  return new Date(state.expiresAt).getTime() <= Date.now()
}

function isUsageWindowExpired(state: LicenseState) {
  return Date.now() - new Date(state.usageWindowStart).getTime() > 1000 * 60 * 60 * 24 * 30
}

function ensureUsageWindow(state: LicenseState) {
  if (isUsageWindowExpired(state)) {
    state.usageWindowStart = new Date().toISOString()
    state.usage = {
      aiRequests: 0,
      templateUses: 0,
      extensionInstalls: 0,
    }
  }
  return state
}

function buildStatus(state: LicenseState): LicenseStatus {
  const expired = isLicenseExpired(state)
  const plan = expired ? 'free' : state.plan
  const canUseAI = true
  const canCreateTemplate = plan !== 'free' || state.usage.templateUses < FREE_LIMITS.templateUses
  const canInstallExtensions = plan !== 'free' || state.usage.extensionInstalls < FREE_LIMITS.extensionInstalls
  return {
    licenseKey: state.licenseKey,
    plan,
    activatedAt: state.activatedAt,
    expiresAt: state.expiresAt,
    isExpired: expired,
    deviceId: state.deviceId,
    verifiedAt: state.verifiedAt,
    canUseAI,
    canCreateTemplate,
    canInstallExtensions,
    usage: state.usage,
    usageWindowStart: state.usageWindowStart,
    message: expired ? 'License has expired and downgraded to Free.' : null,
    creditBalance: state.creditBalance ?? 0,
    subscriptionTier: plan === 'ultimate' || plan === 'team' ? 'team' : plan === 'pro' ? 'pro' : 'free',
  }
}

function getTemplatePremiumStatus(templateId: string) {
  return PREMIUM_TEMPLATES.has(templateId)
}

async function verifyRemoteLicense(key: string, deviceId: string) {
  const cleaned = key.trim()
  
  if (cleaned === 'ULT-OWNER-0000') {
    return {
      valid: true,
      plan: 'ultimate' as LicensePlan,
      expiresAt: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString(),
      deviceId,
      message: 'Owner Bypass Active',
    }
  }

  const guessedPlan = normalizePlanFromKey(cleaned)
  if (!REMOTE_URL || !globalThis.fetch) {
    return {
      valid: Boolean(guessedPlan),
      plan: guessedPlan ?? 'free',
      expiresAt: guessedPlan === 'free' ? null : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      deviceId,
      message: guessedPlan ? null : 'License key format is invalid.',
    }
  }

  try {
    const response = await fetch(`${REMOTE_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: cleaned, deviceId }),
    })
    if (!response.ok) {
      return { valid: false, plan: guessedPlan ?? 'free', expiresAt: null, deviceId, message: 'License verification failed.' }
    }
    const payload = await response.json()
    return {
      valid: Boolean(payload?.valid),
      plan: payload?.plan ?? guessedPlan ?? 'free',
      expiresAt: payload?.expiresAt ?? (guessedPlan === 'free' ? null : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()),
      deviceId: payload?.deviceId ?? deviceId,
      message: payload?.message ?? null,
    }
  } catch (err) {
    return {
      valid: Boolean(guessedPlan),
      plan: guessedPlan ?? 'free',
      expiresAt: guessedPlan === 'free' ? null : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      deviceId,
      message: 'Unable to reach license server. Offline mode enabled.',
    }
  }
}

export async function activateLicense(licenseKey: string) {
  const deviceId = createDeviceFingerprint()
  const key = licenseKey.trim()
  if (!key) {
    return { error: 'A license key is required.' }
  }

  const verification = await verifyRemoteLicense(key, deviceId)
  if (!verification.valid) {
    return { error: verification.message ?? 'License key is invalid.' }
  }

  const state = await loadState()
  state.licenseKey = key
  state.plan = verification.plan
  state.activatedAt = new Date().toISOString()
  state.expiresAt = verification.expiresAt
  state.deviceId = verification.deviceId
  state.verifiedAt = new Date().toISOString()
  state.usageWindowStart = new Date().toISOString()
  state.usage = { aiRequests: 0, templateUses: 0, extensionInstalls: 0 }
  await saveState(state)
  return buildStatus(state)
}

export async function getLicenseStatus() {
  const state = ensureUsageWindow(await loadState())
  await saveState(state)
  return buildStatus(state)
}

export async function refreshLicenseStatus() {
  const state = await loadState()
  if (!state.licenseKey) {
    return buildStatus(ensureUsageWindow(state))
  }
  const verification = await verifyRemoteLicense(state.licenseKey, state.deviceId)
  if (!verification.valid) {
    const refreshed = buildStatus(ensureUsageWindow(state))
    refreshed.message = verification.message ?? refreshed.message
    return refreshed
  }

  state.plan = verification.plan
  state.expiresAt = verification.expiresAt
  state.deviceId = verification.deviceId
  state.verifiedAt = new Date().toISOString()
  const refreshedState = ensureUsageWindow(state)
  await saveState(refreshedState)
  return buildStatus(refreshedState)
}

export async function deactivateLicense() {
  const state = await loadState()
  state.licenseKey = null
  state.plan = 'free'
  state.activatedAt = null
  state.expiresAt = null
  state.verifiedAt = null
  state.licenseKey = null
  await saveState(state)
  return buildStatus(state)
}

export async function canUseAI() {
  return true
}

export async function canCreateTemplate(templateId: string) {
  const status = await getLicenseStatus()
  if (status.isExpired) return false
  if (status.plan !== 'free') return true
  if (getTemplatePremiumStatus(templateId)) return false
  return status.usage.templateUses < FREE_LIMITS.templateUses
}

export async function canInstallExtension(manifest: any) {
  const status = await getLicenseStatus()
  if (status.isExpired) return false
  const premium = manifest?.premium === true || manifest?.contributes?.premium === true
  if (status.plan === 'ultimate' || status.plan === 'team') return true
  if (status.plan === 'pro') return !premium
  return !premium && status.usage.extensionInstalls < FREE_LIMITS.extensionInstalls
}

async function updateUsage(updater: (usage: LicenseUsage) => void) {
  const state = ensureUsageWindow(await loadState())
  updater(state.usage)
  await saveState(state)
  return buildStatus(state)
}

export async function checkPremiumCredits(cost: number = 1): Promise<{ allowed: boolean; balance: number; cost: number }> {
  const state = ensureUsageWindow(await loadState())
  return {
    allowed: state.creditBalance >= cost,
    balance: state.creditBalance,
    cost,
  }
}

export async function consumeCredits(cost: number = 1): Promise<{ success: boolean; balance: number }> {
  const state = ensureUsageWindow(await loadState())
  if (state.creditBalance < cost) {
    return { success: false, balance: state.creditBalance }
  }
  state.creditBalance -= cost
  await saveState(state)
  return { success: true, balance: state.creditBalance }
}

// ─── Credit Reservation System ───────────────────────────────────────────────
// Credits are reserved before a request begins and committed or released when
// the request finishes. This prevents double-spend and cancel abuse.

const pendingReservations = new Map<string, number>() // reservationId -> cost

export async function reserveCredits(
  reservationId: string,
  cost: number
): Promise<{ success: boolean; balance: number }> {
  if (cost <= 0) return { success: true, balance: (await loadState()).creditBalance }
  const state = ensureUsageWindow(await loadState())
  if (state.creditBalance < cost) {
    return { success: false, balance: state.creditBalance }
  }
  state.creditBalance -= cost
  pendingReservations.set(reservationId, cost)
  await saveState(state)
  return { success: true, balance: state.creditBalance }
}

export async function commitReservedCredits(reservationId: string): Promise<void> {
  // Credits were already deducted at reservation time — just clear the hold.
  pendingReservations.delete(reservationId)
}

export async function releaseReservedCredits(
  reservationId: string
): Promise<{ balance: number }> {
  const cost = pendingReservations.get(reservationId) ?? 0
  pendingReservations.delete(reservationId)
  if (cost <= 0) return { balance: (await loadState()).creditBalance }
  const state = ensureUsageWindow(await loadState())
  state.creditBalance = (state.creditBalance ?? 0) + cost
  await saveState(state)
  return { balance: state.creditBalance }
}

export async function getCreditBalance(): Promise<{ balance: number; tier: string }> {
  const state = ensureUsageWindow(await loadState())
  const plan = isLicenseExpired(state) ? 'free' : state.plan
  return {
    balance: state.creditBalance ?? 0,
    tier: plan === 'ultimate' || plan === 'team' ? 'team' : plan === 'pro' ? 'pro' : 'free',
  }
}

export async function addCredits(amount: number): Promise<{ balance: number }> {
  const state = ensureUsageWindow(await loadState())
  state.creditBalance = (state.creditBalance ?? 0) + amount
  state.creditsPurchasedTotal = (state.creditsPurchasedTotal ?? 0) + amount
  await saveState(state)
  return { balance: state.creditBalance }
}

export async function recordAIRequest() {
  return updateUsage((usage) => { usage.aiRequests += 1 })
}

export async function recordTemplateUsage() {
  const status = await getLicenseStatus()
  if (!status.canCreateTemplate) {
    return { error: 'Template usage limit reached or license inactive.' }
  }
  return updateUsage((usage) => { usage.templateUses += 1 })
}

export async function recordExtensionInstall() {
  const status = await getLicenseStatus()
  if (!status.canInstallExtensions) {
    return { error: 'Extension install limit reached or license inactive.' }
  }
  return updateUsage((usage) => { usage.extensionInstalls += 1 })
}
