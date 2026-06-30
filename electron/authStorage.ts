import { app, safeStorage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

const AUTH_FILE = 'auth-session.dat'

function getAuthPath(): string {
  return path.join(app.getPath('userData'), AUTH_FILE)
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

/**
 * Persist auth session data encrypted with the OS keychain (Electron safeStorage).
 * Falls back to base64 encoding when OS encryption is unavailable.
 */
export async function saveAuthSession(data: string): Promise<void> {
  const filePath = getAuthPath()

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(data)
    await fs.writeFile(filePath, encrypted)
    return
  }

  const encoded = Buffer.from(data, 'utf-8').toString('base64')
  await fs.writeFile(filePath, encoded, 'utf-8')
}

export async function loadAuthSession(): Promise<string | null> {
  try {
    const filePath = getAuthPath()
    const raw = await fs.readFile(filePath)

    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(raw)
    }

    return Buffer.from(raw.toString('utf-8'), 'base64').toString('utf-8')
  } catch {
    return null
  }
}

export async function clearAuthSession(): Promise<void> {
  try {
    await fs.unlink(getAuthPath())
  } catch {
    // File may not exist — safe to ignore
  }
}
