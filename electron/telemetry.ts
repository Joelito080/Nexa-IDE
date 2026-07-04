import { app } from 'electron'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import log from 'electron-log'

export interface TelemetryEvent {
  eventType: 'crash' | 'extension-failure' | 'ai-latency' | 'startup-time'
  timestamp: string
  payload: Record<string, any>
}

class TelemetryManager {
  private getSettingsPath(): string {
    return path.join(app.getPath('userData'), 'nexus-settings.json')
  }

  private getTelemetryLogPath(): string {
    return path.join(app.getPath('userData'), 'telemetry-logs.json')
  }

  async isTelemetryEnabled(): Promise<boolean> {
    try {
      const raw = await fs.readFile(this.getSettingsPath(), 'utf-8')
      const settings = JSON.parse(raw)
      return !!settings.telemetryEnabled
    } catch {
      return false
    }
  }

  async trackEvent(type: TelemetryEvent['eventType'], payload: Record<string, any>): Promise<void> {
    const enabled = await this.isTelemetryEnabled()
    if (!enabled) {
      log.info(`[Telemetry] Event skipped (user opted out): ${type}`)
      return
    }

    const event: TelemetryEvent = {
      eventType: type,
      timestamp: new Date().toISOString(),
      payload
    }

    log.info(`[Telemetry] Tracking event: ${type}`, payload)

    // Save to local cache file
    try {
      let events: TelemetryEvent[] = []
      const logPath = this.getTelemetryLogPath()
      try {
        const raw = await fs.readFile(logPath, 'utf-8')
        events = JSON.parse(raw)
        if (!Array.isArray(events)) events = []
      } catch {}

      events.push(event)
      await fs.writeFile(logPath, JSON.stringify(events, null, 2), 'utf-8')
    } catch (err) {
      log.error('[Telemetry] Failed to write local telemetry events:', err)
    }

    // Attempt remote upload (mock api endpoint)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)
      await fetch('https://telemetry.nexa-ide.com/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        signal: controller.signal
      }).catch(() => {})
      clearTimeout(timeoutId)
    } catch {}
  }
}

export const telemetry = new TelemetryManager()
