'use client'

import { toggleFlippedId } from '@/lib/ability'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type AbilityFlippedState = {
  flippedIds: number[]
  toggleFlipped: (id: number) => void
}

export const useAbilityFlippedStore = create<AbilityFlippedState>()(
  persist(
    (set) => ({
      flippedIds: [],
      toggleFlipped: (id) => set((state) => ({ flippedIds: toggleFlippedId(state.flippedIds, id) })),
    }),
    {
      name: 'rizz-ability-flipped',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
)
