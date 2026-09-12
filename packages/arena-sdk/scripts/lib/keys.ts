import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Keypair } from '@solana/web3.js'

/** Loads ~/.config/solana/rogs-<name>.json (kept outside the repo). */
export function loadKeypair(name: 'deployer' | 'keeper' | 'faucet') {
  const path = join(homedir(), '.config', 'solana', `rogs-${name}.json`)
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8')) as number[]))
}
