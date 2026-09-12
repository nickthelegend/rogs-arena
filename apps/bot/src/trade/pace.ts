export type PaceBeat = {
  waitMs: number
  act: boolean
  reuseWallet: boolean
  kind: 'burst' | 'wander' | 'idle' | 'pass'
}

export type Pace = {
  burstLeft: number
}

export const defaultPaceMs = 8_000

function gaussian(random: () => number) {
  const u = Math.max(random(), Number.EPSILON)
  const v = Math.max(random(), Number.EPSILON)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function logNormal(median: number, sigma: number, random = Math.random) {
  return median * Math.exp(sigma * gaussian(random))
}

function between(min: number, max: number, random: () => number) {
  return min + random() * (max - min)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function createPace(): Pace {
  return { burstLeft: 0 }
}

export function nextBeat(pace: Pace, scaleMs = defaultPaceMs, random = Math.random): PaceBeat {
  const scale = Math.max(0, scaleMs)
  if (scale === 0) {
    return { waitMs: 0, act: true, reuseWallet: pace.burstLeft > 0, kind: pace.burstLeft > 0 ? 'burst' : 'wander' }
  }

  if (pace.burstLeft > 0) {
    pace.burstLeft -= 1
    return {
      waitMs: Math.round(between(0.35 * scale, 0.9 * scale, random)),
      act: true,
      reuseWallet: random() < 0.65,
      kind: 'burst',
    }
  }

  const roll = random()
  if (roll < 0.14) {
    pace.burstLeft = 1 + Math.floor(random() * 3)
    return {
      waitMs: Math.round(between(0.4 * scale, 1.1 * scale, random)),
      act: true,
      reuseWallet: false,
      kind: 'burst',
    }
  }

  if (roll < 0.22) {
    return {
      waitMs: Math.round(clamp(logNormal(3.8 * scale, 0.45, random), 2.2 * scale, 14 * scale)),
      act: random() < 0.35,
      reuseWallet: false,
      kind: 'idle',
    }
  }

  if (roll < 0.34) {
    return {
      waitMs: Math.round(clamp(logNormal(scale, 0.55, random), 0.35 * scale, 5 * scale)),
      act: false,
      reuseWallet: false,
      kind: 'pass',
    }
  }

  return {
    waitMs: Math.round(clamp(logNormal(scale, 0.7, random), 0.25 * scale, 6.5 * scale)),
    act: true,
    reuseWallet: random() < 0.18,
    kind: 'wander',
  }
}
