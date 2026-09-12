import { beforeEach, describe, expect, test } from 'bun:test'
import { useIslandStore } from '../island'

function resetIslandStore() {
  useIslandStore.getState().syncFromSetup({ authenticated: false, step: 'idle' })
  useIslandStore.getState().setZone('information')
}

describe('useIslandStore', () => {
  beforeEach(() => {
    resetIslandStore()
  })

  test('starts on information while the wallet is still unconnected', () => {
    expect(useIslandStore.getState()).toMatchObject({ zone: 'information', stage: 'unconnected' })
  })

  test('keeps the chosen zone until setup is ready', () => {
    useIslandStore.getState().setZone('trading-zone')
    expect(useIslandStore.getState().stage).toBe('unconnected')

    useIslandStore.getState().syncFromSetup({ authenticated: true, step: 'creating_wallet' })
    expect(useIslandStore.getState().stage).toBe('preparing')
  })

  test('opens the trading zone once the wallet is ready', () => {
    useIslandStore.getState().syncFromSetup({
      authenticated: true,
      step: 'ready',
      address: '0x1111111111111111111111111111111111111111',
      settled: true,
    })
    expect(useIslandStore.getState().stage).toBe('information')

    useIslandStore.getState().setZone('trading-zone')
    expect(useIslandStore.getState()).toMatchObject({ zone: 'trading-zone', stage: 'trading-zone' })
  })
})
