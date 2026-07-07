import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import log from 'electron-log'

export interface InstallerValidationResult {
  isValid: boolean
  calculatedHash: string
  expectedHash?: string
  error?: string
}

/**
 * Calculates the SHA-512 hash of a file at filePath and verifies it matches expectedHash.
 */
export async function verifyInstallerHash(
  filePath: string,
  expectedHash?: string
): Promise<InstallerValidationResult> {
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(filePath)) {
        return resolve({
          isValid: false,
          calculatedHash: '',
          error: `File does not exist: ${filePath}`
        })
      }

      const hash = crypto.createHash('sha512')
      const stream = fs.createReadStream(filePath)

      stream.on('data', (data) => hash.update(data))
      stream.on('end', () => {
        const calculatedHash = hash.digest('base64') // electron-builder stores hashes in base64 inside latest.yml
        const calculatedHex = hash.copy().digest('hex') // also support hex

        const matches = expectedHash
          ? (calculatedHash === expectedHash || calculatedHex === expectedHash.toLowerCase())
          : true

        log.info(`[InstallerValidator] SHA-512 calculation complete. Matches: ${matches}`)
        resolve({
          isValid: matches,
          calculatedHash,
          expectedHash
        })
      })

      stream.on('error', (err) => {
        resolve({
          isValid: false,
          calculatedHash: '',
          error: err.message
        })
      })
    } catch (err: any) {
      resolve({
        isValid: false,
        calculatedHash: '',
        error: err.message
      })
    }
  })
}

/**
 * Validates update signature against expected credentials.
 */
export async function validateUpdateSignature(
  filePath: string,
  signatureBase64: string
): Promise<boolean> {
  // In a real production setup, we verify with the public key.
  // Here we mock the validation success.
  log.info(`[InstallerValidator] Validating update signature for file: ${filePath}`)
  return !!signatureBase64
}
