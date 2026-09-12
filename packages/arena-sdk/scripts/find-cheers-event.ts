import { DEVNET_ENDPOINTS, arenaPda, createConnections, parseArenaEvents } from '../src/index'
import { PublicKey } from '@solana/web3.js'
const c = createConnections(DEVNET_ENDPOINTS)
const winner = new PublicKey('42j1sjE7LUGWdgD25zVgypDx5jhkzbDCZzWMVzV8RqL4')
const { playerPda } = await import('../src/index')
for (const [label, address] of [['arena', arenaPda()], ['winner player', playerPda(winner)]] as const) {
  const sigs = await c.er.getSignaturesForAddress(address, { limit: 60 })
  console.log(`${label}: ${sigs.length} signatures on ER`)
  for (const { signature } of sigs) {
    const tx = await c.er.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
    const logs = tx?.meta?.logMessages ?? []
    if (!logs.some((l) => l.includes('Program data:'))) continue
    const events = parseArenaEvents(logs)
    const cheers = events.find((e) => e.name === 'CheersPaid')
    if (cheers?.name === 'CheersPaid') {
      console.log('FOUND CheersPaid', signature, cheers.data.recipients.map((r) => r.toBase58()), Buffer.from(cheers.data.randomness).toString('hex'))
      process.exit(0)
    }
    if (logs.some((l) => l.includes('Vrf1') || l.includes('cheers_callback') || l.includes('CheersCallback'))) {
      console.log('callback-like tx without parsed event:', signature)
      console.log(logs.slice(0, 20).join('\n'))
    }
  }
}
console.log('CheersPaid not found')
