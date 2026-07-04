export interface Thresholds {
  green: number
  yellow: number
  red: number
}

export interface HealthSettings {
  thresholds: {
    tokenPressure: Thresholds
    latency: Thresholds
    errors: Thresholds
    resets: Thresholds
  }
  weights: {
    tokenPressure: number
    latency: number
    errors: number
    resets: number
  }
}

function scoreFromThresholds(value: number, t: Thresholds, invert = false): number {
  // invert=false means higher value worse (e.g., token pressure, latency, errors, resets)
  // value normalized as-is. We'll map piecewise to [0,1]
  if (Number.isNaN(value) || value === null || value === undefined) return 0
  if (!invert) {
    if (value < t.green) return 0
    if (value >= t.red) return 1
    if (value < t.yellow) {
      return 0.5 * ((value - t.green) / Math.max(1e-6, (t.yellow - t.green)))
    }
    // between yellow and red
    return 0.5 + 0.5 * ((value - t.yellow) / Math.max(1e-6, (t.red - t.yellow)))
  } else {
    // lower is worse (not used currently)
    if (value > t.green) return 0
    if (value <= t.red) return 1
    if (value > t.yellow) {
      return 0.5 * ((t.green - value) / Math.max(1e-6, (t.green - t.yellow)))
    }
    return 0.5 + 0.5 * ((t.yellow - value) / Math.max(1e-6, (t.yellow - t.red)))
  }
}

export function computeHealthScore(metrics: any, settings: HealthSettings) {
  const thresholds = settings.thresholds
  const weights = settings.weights

  // token pressure: expect 0..1 (ratio)
  const tokenRatio = (() => {
    if (metrics.currentTokenUsage == null || metrics.tokenBudget == null) return 0
    const denom = Math.max(1, metrics.tokenBudget)
    return Math.min(1, metrics.currentTokenUsage / denom)
  })()

  const tokenScore = scoreFromThresholds(tokenRatio, thresholds.tokenPressure)

  // latency in seconds
  const latency = metrics.latencyAverage ?? metrics.latency?.average ?? 0
  const latencyScore = scoreFromThresholds(latency, thresholds.latency)

  // errors count
  const errors = metrics.errorCount ?? metrics.errors?.length ?? 0
  const errorsScore = scoreFromThresholds(errors, thresholds.errors)

  // resets count
  const resets = metrics.resetCount ?? metrics.resetHistory?.length ?? 0
  const resetsScore = scoreFromThresholds(resets, thresholds.resets)

  const healthScore = (
    tokenScore * (weights.tokenPressure || 0) +
    latencyScore * (weights.latency || 0) +
    errorsScore * (weights.errors || 0) +
    resetsScore * (weights.resets || 0)
  )

  let status: 'Healthy' | 'Heavy' | 'Overloaded' = 'Healthy'
  if (healthScore >= 0.7) status = 'Overloaded'
  else if (healthScore >= 0.4) status = 'Heavy'
  else status = 'Healthy'

  const color = status === 'Healthy' ? 'green' : status === 'Heavy' ? 'yellow' : 'red'

  return {
    healthScore,
    status,
    color,
    breakdown: { tokenScore, latencyScore, errorsScore, resetsScore },
  }
}
