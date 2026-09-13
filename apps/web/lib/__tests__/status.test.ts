import { describe, expect, test } from 'bun:test'
import { formatStatusReadout, median, pushSample, RTT_SAMPLE_WINDOW } from '../status'

describe('median', () => {
  test('ignores a slow outlier such as the first TLS handshake', () => {
    expect(median([410, 42, 45, 40, 44])).toBe(44)
    expect(median([40, 50])).toBe(45)
    expect(median([])).toBeNull()
  })
})

describe('pushSample', () => {
  test('keeps a rolling window of the newest samples', () => {
    let samples: number[] = []
    for (let value = 1; value <= RTT_SAMPLE_WINDOW + 2; value++) samples = pushSample(samples, value)

    expect(samples).toEqual([3, 4, 5, 6, 7])
  })
})

describe('formatStatusReadout', () => {
  test('shows measured numbers and a dash when nothing is measured', () => {
    expect(formatStatusReadout(47.6, 59.8)).toBe('ER RTT 48 MS | 60 FPS')
    expect(formatStatusReadout(null, null)).toBe('ER RTT — MS | — FPS')
  })
})
