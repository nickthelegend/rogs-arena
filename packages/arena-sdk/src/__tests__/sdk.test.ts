import { describe, expect, test } from 'bun:test'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { Buffer } from 'buffer'

import {
  ABILITY_CALM,
  ABILITY_CAP,
  ABILITY_CHEERS,
  ABILITY_DOUBLE,
  ABILITY_PROTECT,
  BTC_USD_FEED,
  DEVNET_ENDPOINTS,
  OUTCOME_NO,
  OUTCOME_YES,
  PRICE_UPDATE_DISCRIMINATOR,
  PROGRAM_ID,
  USD,
  arenaCoder,
  arenaPda,
  crankTaskId,
  decodeArena,
  decodePlayer,
  decodePriceUpdate,
  describeLogs,
  fetchOraclePrice,
  isqrt,
  nextRoundEnd,
  parseArenaEvents,
  playerPda,
  quoteBuy,
  quoteSell,
  sessionTokenPda,
  settleSlot,
  toArenaMarket,
  withSlippage,
  yesPriceBps,
} from '../index'
import idl from '../idl/rogs_arena.json'

const L = 200n * USD

describe('math mirrors programs/rogs-arena/src/math.rs', () => {
  test('first buy matches the Rust vector', () => {
    const quote = quoteBuy(L, L, 5n * USD, 100n)!
    expect(quote.fee).toBe(50_000n)
    expect(quote.net).toBe(4_950_000n)
    expect(quote.poolOther).toBe(204_950_000n)
    expect(quote.poolBought).toBe(195_169_554n)
    expect(quote.shares).toBe(9_780_446n)
    expect(yesPriceBps(quote.poolBought, quote.poolOther)).toBe(5_122n)
  })

  test('buy then sell never profits and keeps the invariant', () => {
    for (const fee of [0n, 100n, 500n]) {
      for (const usd of [1n, 5n, 37n, 100n]) {
        const buy = quoteBuy(L, L, usd * USD, fee)!
        const sell = quoteSell(buy.poolBought, buy.poolOther, buy.shares, fee)!
        expect(sell.out <= usd * USD).toBe(true)
        expect(sell.poolSold * sell.poolOther >= buy.poolBought * buy.poolOther).toBe(true)
      }
    }
  })

  test('isqrt floors', () => {
    for (const value of [0n, 1n, 15n, 16n, 17n, 10n ** 22n, (1n << 100n) + 12_345n]) {
      const root = isqrt(value)
      expect(root * root <= value).toBe(true)
      expect((root + 1n) * (root + 1n) > value).toBe(true)
    }
  })

  test('settlement bonuses match the program rules', () => {
    const base = { yesShares: 9n * USD, noShares: 0n, cost: 5n * USD, proceeds: 0n, maxBpm: 0, heartSamples: 0 }
    expect(settleSlot({ ...base, ability: ABILITY_DOUBLE }, OUTCOME_YES)).toEqual({ payout: 9n * USD, profit: 4n * USD, bonus: 4n * USD, calm: false, cheers: false })
    expect(settleSlot({ ...base, ability: ABILITY_PROTECT }, OUTCOME_NO).bonus).toBe(5n * USD)
    expect(settleSlot({ ...base, ability: ABILITY_CALM }, OUTCOME_YES).bonus).toBe(0n)
    expect(settleSlot({ ...base, ability: ABILITY_CALM, maxBpm: 119, heartSamples: 2 }, OUTCOME_YES).bonus).toBe(ABILITY_CAP)
    expect(settleSlot({ ...base, ability: ABILITY_CALM, maxBpm: 120, heartSamples: 2 }, OUTCOME_YES).bonus).toBe(0n)
    expect(settleSlot({ ...base, ability: ABILITY_CHEERS }, OUTCOME_YES).cheers).toBe(true)
  })

  test('round alignment and slippage helpers', () => {
    expect(nextRoundEnd(1_000_000_000, 300)).toBe(1_000_000_200)
    expect(nextRoundEnd(1_000_000_170, 300)).toBe(1_000_000_500)
    expect(withSlippage(1_000_000n, 5)).toBe(950_000n)
  })
})

describe('pdas', () => {
  test('arena and player PDAs are derived from the deployed program id', () => {
    const owner = new PublicKey('59o1MkshqjC4oQcZsTCCn13BxDuFHGmNNrFfdYNhrj9r')
    expect(arenaPda().equals(PublicKey.findProgramAddressSync([Buffer.from('arena')], PROGRAM_ID)[0])).toBe(true)
    expect(playerPda(owner).equals(PublicKey.findProgramAddressSync([Buffer.from('player'), owner.toBuffer()], PROGRAM_ID)[0])).toBe(true)
    const signer = Keypair.generate().publicKey
    expect(sessionTokenPda(signer, owner)).toBeInstanceOf(PublicKey)
  })

  test('crank task id is a stable positive i64', async () => {
    const id = await crankTaskId('rogs-arena:rounds')
    expect(id > 0n && id < 2n ** 63n).toBe(true)
    expect(await crankTaskId('rogs-arena:rounds')).toBe(id)
  })
})

function feedBuffer(feed: PublicKey, price: bigint, publishTime: number, postedSlot: bigint, level = 1) {
  const data = Buffer.alloc(134)
  data.set(PRICE_UPDATE_DISCRIMINATOR, 0)
  data[40] = level
  data.set(feed.toBytes(), 41)
  data.writeBigInt64LE(price, 73)
  data.writeInt32LE(8, 89)
  data.writeBigInt64LE(BigInt(publishTime), 93)
  data.writeBigUInt64LE(postedSlot, 125)
  return data
}

describe('oracle', () => {
  test('decodes a PriceUpdateV2 layout and rejects bad ones', () => {
    const decoded = decodePriceUpdate(BTC_USD_FEED, feedBuffer(BTC_USD_FEED, 7_725_514_539_148n, 1_700_000_000, 99n))
    expect(decoded.price).toBeCloseTo(77_255.14539148, 6)
    expect(decoded.decimals).toBe(8)
    expect(() => decodePriceUpdate(BTC_USD_FEED, feedBuffer(BTC_USD_FEED, 1n, 1, 0n))).toThrow('not been published')
    expect(() => decodePriceUpdate(BTC_USD_FEED, feedBuffer(PROGRAM_ID, 1n, 1, 1n))).toThrow('different feed')
    expect(() => decodePriceUpdate(BTC_USD_FEED, feedBuffer(BTC_USD_FEED, 1n, 1, 1n, 0))).toThrow('fully verified')
  })

  test('reads the live BTC/USD feed from the MagicBlock devnet ER', async () => {
    const er = new Connection(DEVNET_ENDPOINTS.erRpcUrl, 'confirmed')
    const price = await fetchOraclePrice(er)
    expect(price.price).toBeGreaterThan(1_000)
    expect(Math.abs(Date.now() / 1000 - price.publishTime)).toBeLessThan(60)
  }, 20_000)
})

describe('accounts and events', () => {
  test('decodes Arena and Player and builds the UI market', () => {
    const arena = Buffer.alloc(8 + 5936)
    arena.set(arenaCoder.accounts.accountDiscriminator('Arena'), 0)
    arena.writeBigInt64LE(300n, 8 + 96)
    arena.writeBigUInt64LE(200n * USD, 8 + 104)
    const current = 8 + 216
    arena.writeBigUInt64LE(3n, current)
    arena.writeBigInt64LE(1_000n, current + 8)
    arena.writeBigInt64LE(1_300n, current + 16)
    arena.writeBigUInt64LE(L, current + 40)
    arena.writeBigUInt64LE(L, current + 48)
    arena.writeInt32LE(8, current + 80)
    arena[current + 84] = 1
    const state = decodeArena(arenaPda(), arena)
    expect(state.roundSeconds).toBe(300)
    expect(state.liquidity).toBe(200n * USD)
    expect(state.current.id).toBe(3)
    const market = toArenaMarket(state, 1_100)!
    expect(market.info.expiry).toBe(1_300)
    expect(market.yesPrice).toBe(0.5)
    expect(market.active).toBe(true)
    expect(market.outcomes.map((outcome) => outcome.label)).toEqual(['YES', 'NO'])

    const player = Buffer.alloc(8 + 400)
    player.set(arenaCoder.accounts.accountDiscriminator('Player'), 0)
    const owner = Keypair.generate().publicKey
    player.set(owner.toBytes(), 8)
    player[41] = 1
    player.writeBigUInt64LE(250n * USD, 42)
    const decoded = decodePlayer(playerPda(owner), player)
    expect(decoded.owner.equals(owner)).toBe(true)
    expect(decoded.joined).toBe(true)
    expect(decoded.balance).toBe(250n * USD)
    expect(decoded.positions).toHaveLength(4)
  })

  test('parses emitted events from program logs', () => {
    const event = idl.events.find((item) => item.name === 'ChipsClaimed')!
    const owner = Keypair.generate().publicKey
    const payload = arenaCoder.types.encode('ChipsClaimed', {
      owner,
      amount: new (require('@coral-xyz/anchor').BN)(250_000_000),
      first: true,
      balance: new (require('@coral-xyz/anchor').BN)(250_000_000),
      ts: new (require('@coral-xyz/anchor').BN)(1_700_000_000),
    })
    const data = Buffer.concat([Buffer.from(event.discriminator), payload]).toString('base64')
    const logs = [`Program ${PROGRAM_ID.toBase58()} invoke [1]`, `Program data: ${data}`, `Program ${PROGRAM_ID.toBase58()} success`]
    const [parsed] = parseArenaEvents(logs)
    expect(parsed.name).toBe('ChipsClaimed')
    if (parsed.name === 'ChipsClaimed') {
      expect(parsed.data.owner.equals(owner)).toBe(true)
      expect(parsed.data.amount).toBe(250_000_000n)
      expect(parsed.data.first).toBe(true)
    }
  })

  test('parses events emitted under and after CPIs (real devnet VRF logs)', () => {
    // CheersCallback tx 3acK2K49…: this program runs at depth 2 under the VRF program.
    const callbackLogs = [
      'Program ComputeBudget111111111111111111111111111111 invoke [1]',
      'Program ComputeBudget111111111111111111111111111111 success',
      'Program Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz invoke [1]',
      'Program J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q invoke [2]',
      'Program log: Instruction: CheersCallback',
      'Program data: 5u5eCTZvdt0tBCXvypueAtVho8THLSIdk7PtCPztQKpYGfka1ZfMAQEAAACjH5f+TTZG4G+1C8gardSYtL2+oyiZGwSj623obifJrEBCDwAAAAAASlVELDDMn2ZqcNTMc9uUeGS+8jCC3GWK9TdcMSzHLLUi3qVqAAAAAA==',
      'Program J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q consumed 21279 of 266305 compute units',
      'Program J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q success',
      'Program Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz consumed 55283 of 299850 compute units',
      'Program Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz success',
    ]
    const [paid] = parseArenaEvents(callbackLogs)
    expect(paid?.name).toBe('CheersPaid')
    if (paid?.name === 'CheersPaid') {
      expect(paid.data.owner.toBase58()).toBe('42j1sjE7LUGWdgD25zVgypDx5jhkzbDCZzWMVzV8RqL4')
      expect(paid.data.recipients.map((key) => key.toBase58())).toEqual(['BymPzSSHHUbhcw9qB1TLQkzcV2HD17n3mB4Ax2FP9699'])
      expect(paid.data.amountEach).toBe(1_000_000n)
      expect(paid.data.randomness).toHaveLength(32)
    }

    // RequestCheers tx 3z18MVog…: the event is logged after an inner VRF invocation returns.
    const requestLogs = [
      'Program J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q invoke [1]',
      'Program log: Instruction: RequestCheers',
      'Program Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz invoke [2]',
      'Program log: Idx: 16',
      'Program Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz consumed 15968 of 164187 compute units',
      'Program Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz success',
      'Program data: /ZZ5e2xTepwtBCXvypueAtVho8THLSIdk7PtCPztQKpYGfka1ZfMAQEi3qVqAAAAAA==',
      'Program J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q consumed 55736 of 200000 compute units',
      'Program J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q success',
    ]
    const [requested] = parseArenaEvents(requestLogs)
    expect(requested?.name).toBe('CheersRequested')
    if (requested?.name === 'CheersRequested') {
      expect(requested.data.owner.toBase58()).toBe('42j1sjE7LUGWdgD25zVgypDx5jhkzbDCZzWMVzV8RqL4')
      expect(requested.data.candidates).toBe(1)
    }

    // A different program's data line at the same depth is ignored.
    expect(parseArenaEvents(['Program Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz invoke [1]', callbackLogs[5], 'Program Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz success'])).toEqual([])
  })

  test('describes anchor errors from logs', () => {
    const logs = ['Program log: AnchorError occurred. Error Code: TradingLocked. Error Number: 6004. Error Message: Trading is locked in the final seconds of the round.']
    expect(describeLogs(logs)).toEqual({ message: 'Trading is locked in the final seconds of the round', code: 6004 })
    expect(describeLogs(['Program X failed: custom program error: 0x1775'])?.message).toBe('Invalid outcome')
  })
})
