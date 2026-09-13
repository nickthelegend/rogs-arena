'use client'

import { env } from '@/env'
import { ArenaInstructions, createConnections, type ArenaConnections } from '@rogs/arena-sdk'
import { PublicKey } from '@solana/web3.js'
import { createContext, useContext, useState, type ReactNode } from 'react'

export type ArenaChain = {
  connections: ArenaConnections
  instructions: ArenaInstructions
  programId: PublicKey
  oracleFeed: PublicKey
}

const ArenaChainContext = createContext<ArenaChain | null>(null)

/** Built once per mount from the NEXT_PUBLIC_* config; connections open no socket until something subscribes. */
function createArenaChain(): ArenaChain {
  const programId = new PublicKey(env.NEXT_PUBLIC_PROGRAM_ID)
  const connections = createConnections({
    baseRpcUrl: env.NEXT_PUBLIC_BASE_RPC_URL,
    erRpcUrl: env.NEXT_PUBLIC_ER_RPC_URL,
    erWsUrl: env.NEXT_PUBLIC_ER_WS_URL,
    routerUrl: env.NEXT_PUBLIC_ROUTER_URL,
    validator: new PublicKey(env.NEXT_PUBLIC_ER_VALIDATOR),
  })

  return {
    connections,
    instructions: new ArenaInstructions(connections.base, programId),
    programId,
    oracleFeed: new PublicKey(env.NEXT_PUBLIC_ORACLE_BTC_FEED),
  }
}

export function ArenaChainProvider({ children }: { children: ReactNode }) {
  const [chain] = useState(createArenaChain)
  return <ArenaChainContext.Provider value={chain}>{children}</ArenaChainContext.Provider>
}

export function useArenaChain() {
  const context = useContext(ArenaChainContext)
  if (!context) throw new Error('useArenaChain must be used within ArenaChainProvider')
  return context
}
