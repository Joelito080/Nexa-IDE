export type LicensePlan = 'free' | 'pro' | 'ultimate'

export interface LicenseUsage {
  aiRequests: number
  templateUses: number
  extensionInstalls: number
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
}
