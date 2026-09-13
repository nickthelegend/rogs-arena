import { Buffer } from 'buffer'

// @solana/web3.js and the Anchor browser build reach for a global Buffer at call time.
const scope = globalThis as typeof globalThis & { Buffer?: typeof Buffer }
if (!scope.Buffer) scope.Buffer = Buffer

export {}
