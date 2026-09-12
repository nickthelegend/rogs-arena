'use client'

import { islandStageFromSetup, type IslandStage, type IslandZone, type TradeSetupPhase } from '@/lib/trade-setup'
import { create } from 'zustand'

export type IslandSetupSnapshot = {
  authenticated: boolean
  step: TradeSetupPhase
  address?: string
  settled?: boolean
}

type IslandState = {
  zone: IslandZone
  stage: IslandStage
  setZone: (zone: IslandZone) => void
  syncFromSetup: (setup: IslandSetupSnapshot) => void
}

const idleSetup: IslandSetupSnapshot = {
  authenticated: false,
  step: 'idle',
}

export const useIslandStore = create<IslandState>()((set, get) => {
  let setup = idleSetup

  return {
    zone: 'information',
    stage: islandStageFromSetup({ ...idleSetup, zone: 'information' }),
    setZone: (zone) => set({ zone, stage: islandStageFromSetup({ ...setup, zone }) }),
    syncFromSetup: (next) => {
      setup = next
      set({ stage: islandStageFromSetup({ ...next, zone: get().zone }) })
    },
  }
})
