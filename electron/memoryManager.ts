import log from 'electron-log'

// ── Generic LRU Cache with optional TTL ─────────────────────────────────────
export class LRUCache<K, V> {
  private _maxSize: number
  private ttl: number
  private map = new Map<K, { value: V; timestamp: number }>()

  constructor(maxSize: number, ttl = 0) {
    this._maxSize = maxSize
    this.ttl = ttl
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (this.ttl && Date.now() - entry.timestamp > this.ttl) {
      this.map.delete(key)
      return undefined
    }
    // Move to end (most recently used)
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, { value, timestamp: Date.now() })
    if (this.map.size > this._maxSize) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
  }

  delete(key: K): void {
    this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }

  get maxSize(): number {
    return this._maxSize
  }

  prune(): number {
    if (!this.ttl) return 0
    const now = Date.now()
    let removed = 0
    for (const [key, entry] of this.map) {
      if (now - entry.timestamp > this.ttl) {
        this.map.delete(key)
        removed++
      }
    }
    return removed
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries() as unknown as IterableIterator<[K, V]>
  }
}

// ── Memory Pressure Monitor ──────────────────────────────────────────────────
type EvictFn = () => void

interface CacheRegistration {
  name: string
  cache: LRUCache<any, any>
}

export class MemoryManager {
  private registrations: CacheRegistration[] = []
  private evictFns: EvictFn[] = []
  private monitorInterval: ReturnType<typeof setInterval> | null = null
  private heapLimitMB: number

  constructor(heapLimitMB = 512) {
    this.heapLimitMB = heapLimitMB
  }

  register(name: string, cache: LRUCache<any, any>): void {
    if (this.registrations.some((r) => r.name === name)) return
    this.registrations.push({ name, cache })
  }

  onPressure(fn: EvictFn): void {
    this.evictFns.push(fn)
  }

  startMonitoring(intervalMs = 30_000): void {
    if (this.monitorInterval) return
    this.monitorInterval = setInterval(() => this.check(), intervalMs)
    this.monitorInterval.unref?.()
  }

  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval)
      this.monitorInterval = null
    }
  }

  check(): { heapMB: number; usagePercent: number; evicted: boolean } {
    const usage = process.memoryUsage()
    const heapMB = Math.round(usage.heapUsed / 1024 / 1024)
    const percent = Math.round((heapMB / this.heapLimitMB) * 100)

    let evicted = false
    if (percent > 80) {
      log.warn(`[MemoryManager] Heap ${heapMB}MB (${percent}% of ${this.heapLimitMB}MB) — evicting all caches`)
      this.evictAll()
      evicted = true
    } else if (percent > 60) {
      for (const { name, cache } of this.registrations) {
        const removed = cache.prune()
        if (removed) log.debug(`[MemoryManager] Pruned ${removed} expired entries from ${name}`)
      }
    }

    return { heapMB, usagePercent: percent, evicted }
  }

  evictAll(): void {
    for (const { name, cache } of this.registrations) {
      const before = cache.size
      cache.clear()
      if (before > 0) log.debug(`[MemoryManager] Cleared ${name} (${before} entries)`)
    }
    for (const fn of this.evictFns) {
      fn()
    }
  }

  getStats(): { name: string; size: number; maxSize: number }[] {
    return this.registrations.map(({ name, cache }) => ({
      name, size: cache.size, maxSize: cache.maxSize,
    }))
  }

  /** Log a snapshot of all registered cache sizes */
  report(): void {
    const stats = this.getStats()
    log.info('[MemoryManager] Cache report:')
    for (const s of stats) {
      log.info(`  ${s.name}: ${s.size} / ${s.maxSize} entries`)
    }
  }
}

export const memoryManager = new MemoryManager()
