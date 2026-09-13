import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { BN, BorshCoder, type Idl } from '@coral-xyz/anchor'
import { MARKET_ROUND_BASE } from '@rogs/arena-sdk'
import { PublicKey } from '@solana/web3.js'
import { ArenaChain, priceToNumber } from '../chain'
import { env } from '../env'
import {
  mapCheers,
  mapHeart,
  mapRoundOpened,
  mapRoundResolved,
  mapSettlement,
  mapTrade,
  pointFromPools,
  roundFromState,
  roundFromSummary,
  yesPriceBps,
} from '../mappers'
import type { TradeDto } from '../types'

const SIG = '4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZAMdL4VZHirAn7t6Ku1qXvMvdpdSpgRqbnZ1Ym2Fw3Wdv4BnMkbNj5L5o'
const owner = new PublicKey('59o1MkshqjC4oQcZsTCCn13BxDuFHGmNNrFfdYNhrj9r')
const friend = new PublicKey('5Ssi6m56mzksijwkzVrHxGFom2vnP7YZPXagYD9nYWBV')
const TS = 1_757_750_400

const buyEvent = {
  round_id: new BN(42),
  owner,
  outcome: 1,
  side: 0,
  amount: new BN(5_000_000),
  shares: new BN(8_000_000),
  fee: new BN(50_000),
  yes_price_bps: new BN(5_432),
  realized_pnl: new BN(0),
  ability: 3,
  balance: new BN(245_000_000),
  ts: new BN(TS),
}

const sellLossEvent = {
  ...buyEvent,
  outcome: 2,
  side: 1,
  amount: new BN(3_300_000),
  shares: new BN(4_400_000),
  fee: new BN(33_000),
  yes_price_bps: new BN(6_250),
  realized_pnl: new BN(-1_700_000),
  ability: 0,
}

const settledEvent = {
  round_id: new BN(41),
  owner,
  outcome: 1,
  payout: new BN(12_000_000),
  profit: new BN(7_000_000),
  ability: 1,
  bonus: new BN(7_000_000),
  calm: false,
  cheers: true,
  balance: new BN(264_000_000),
  ts: new BN(TS),
}

const openedEvent = {
  round_id: new BN(7),
  start_ts: new BN(1_757_750_100),
  end_ts: new BN(1_757_750_400),
  strike_price: new BN('7725512345678'),
  price_expo: 8,
  liquidity: new BN(200_000_000),
}

const resolvedEvent = {
  round_id: new BN(7),
  strike_price: new BN('7725512345678'),
  close_price: new BN('7730000000000'),
  price_expo: 8,
  outcome: 1,
  yes_pool: new BN(180_000_000),
  no_pool: new BN(222_500_000),
  volume: new BN(64_250_000),
  trades: new BN(9),
  house_back: new BN(180_000_000),
  ts: new BN(1_757_750_402),
}

const cheersEvent = {
  owner,
  recipients: [friend, PublicKey.default],
  amount_each: new BN(1_000_000),
  randomness: Array.from({ length: 32 }, (_, i) => i),
  ts: new BN(TS),
}

const expectedBuy: TradeDto = {
  id: `${SIG}:0`,
  sig: SIG,
  market: 'BTC',
  roundId: 42,
  owner: owner.toBase58(),
  side: 'BUY',
  outcome: 'YES',
  amount: 5,
  shares: 8,
  price: 0.625,
  yesPrice: 0.5432,
  fee: 0.05,
  realizedPnl: 0,
  ability: 3,
  t: 1_757_750_400_000,
}

describe('event → DTO mappers', () => {
  test('TradeExecuted BUY → trade + point, no close', () => {
    const { trade, point, close } = mapTrade(SIG, 0, buyEvent)
    expect(trade).toEqual(expectedBuy)
    expect(point).toEqual({ market: 'BTC', roundId: 42, t: 1_757_750_400_000, yes: 0.5432, no: 0.4568, source: 'chain' })
    expect(close).toBeNull()
  })

  test('TradeExecuted SELL at a loss → close with exit sl', () => {
    const { trade, point, close } = mapTrade(SIG, 2, sellLossEvent)
    expect(trade).toEqual({
      id: `${SIG}:2`,
      sig: SIG,
      market: 'BTC',
      roundId: 42,
      owner: owner.toBase58(),
      side: 'SELL',
      outcome: 'NO',
      amount: 3.3,
      shares: 4.4,
      price: 0.75,
      yesPrice: 0.625,
      fee: 0.033,
      realizedPnl: -1.7,
      ability: 0,
      t: 1_757_750_400_000,
    })
    expect(point).toEqual({ market: 'BTC', roundId: 42, t: 1_757_750_400_000, yes: 0.625, no: 0.375, source: 'chain' })
    expect(close).toEqual({
      id: `${SIG}:2`,
      market: 'BTC',
      roundId: 42,
      trader: owner.toBase58(),
      outcome: 'NO',
      exit: 'sl',
      profit: -1.7,
      shares: 4.4,
      t: 1_757_750_400_000,
    })
  })

  test('a break-even SELL counts as take profit', () => {
    const { close } = mapTrade(SIG, 0, { ...sellLossEvent, realized_pnl: new BN(0) })
    expect(close?.exit).toBe('tp')
    expect(close?.profit).toBe(0)
  })

  test('RoundOpened and RoundResolved', () => {
    expect(mapRoundOpened(SIG, openedEvent)).toEqual({
      market: 'BTC',
      roundId: 7,
      startTs: 1_757_750_100,
      endTs: 1_757_750_400,
      strikePrice: '7725512345678',
      priceExpo: 8,
      liquidity: 200,
      openedSig: SIG,
    })
    expect(mapRoundResolved(SIG, resolvedEvent)).toEqual({
      market: 'BTC',
      roundId: 7,
      strikePrice: '7725512345678',
      closePrice: '7730000000000',
      priceExpo: 8,
      outcome: 'YES',
      yesPool: 180,
      noPool: 222.5,
      volume: 64.25,
      trades: 9,
      resolvedSig: SIG,
    })
    expect(mapRoundResolved(SIG, { ...resolvedEvent, outcome: 2 }).outcome).toBe('NO')
  })

  test('PositionSettled, CheersPaid and HeartReported', () => {
    expect(mapSettlement(SIG, 1, settledEvent)).toEqual({
      id: `${SIG}:1`,
      sig: SIG,
      market: 'BTC',
      roundId: 41,
      owner: owner.toBase58(),
      outcome: 'YES',
      payout: 12,
      profit: 7,
      ability: 1,
      bonus: 7,
      calm: false,
      cheers: true,
      t: 1_757_750_400_000,
    })
    expect(mapCheers(SIG, cheersEvent, 'BTC')).toEqual({
      sig: SIG,
      market: 'BTC',
      owner: owner.toBase58(),
      recipients: [friend.toBase58(), '11111111111111111111111111111111'],
      amountEach: 1,
      randomness: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
      t: 1_757_750_400_000,
    })
    expect(mapHeart({ owner, bpm: 96, ts: new BN(TS) })).toEqual({ owner: owner.toBase58(), bpm: 96, t: 1_757_750_400_000 })
  })

  test('arena account state → rounds, and pool prices', () => {
    const state = {
      id: new BN(8),
      startTs: new BN(1_757_750_400),
      endTs: new BN(1_757_750_700),
      strikePrice: new BN('7730000000000'),
      closePrice: new BN(0),
      yesPool: new BN(300_000_000),
      noPool: new BN(100_000_000),
      collateral: new BN(300_000_000),
      volume: new BN(12_500_000),
      trades: new BN(3),
      priceExpo: 8,
      status: 1,
      outcome: 0,
    }
    expect(roundFromState(state)).toEqual({
      market: 'BTC',
      roundId: 8,
      startTs: 1_757_750_400,
      endTs: 1_757_750_700,
      strikePrice: '7730000000000',
      closePrice: null,
      priceExpo: 8,
      outcome: null,
      yesPool: 300,
      noPool: 100,
      volume: 12.5,
      trades: 3,
    })
    expect(roundFromState({ ...state, status: 2, outcome: 2, closePrice: new BN('7720000000000') })).toMatchObject({
      closePrice: '7720000000000',
      outcome: 'NO',
    })
    expect(roundFromSummary({ ...state, outcome: 1, closePrice: new BN('7731000000000') })).toMatchObject({
      roundId: 8,
      closePrice: '7731000000000',
      outcome: 'YES',
    })
    expect(yesPriceBps(new BN(300_000_000), new BN(100_000_000))).toBe(2_500)
    expect(yesPriceBps(new BN(0), new BN(0))).toBe(5_000)
    // Floors like the program: 1 / 3 → 3333 bps.
    expect(yesPriceBps(new BN(2), new BN(1))).toBe(3_333)
    expect(pointFromPools(8, state.yesPool, state.noPool, 1_757_750_405_123)).toEqual({
      market: 'BTC',
      roundId: 8,
      t: 1_757_750_405_123,
      yes: 0.25,
      no: 0.75,
      source: 'chain',
    })
  })

  test('namespaced round ids map every DTO to its market; ids outside the table throw', () => {
    const sol = 2 * MARKET_ROUND_BASE + 42
    const link = 8 * MARKET_ROUND_BASE + 1
    const { trade, point, close } = mapTrade(SIG, 0, { ...sellLossEvent, round_id: new BN(sol) })
    expect([trade.market, point.market, close?.market]).toEqual(['SOL', 'SOL', 'SOL'])
    expect(trade.roundId).toBe(sol)
    expect(mapRoundOpened(SIG, { ...openedEvent, round_id: new BN(link) })).toMatchObject({ market: 'LINK', roundId: link })
    expect(mapRoundResolved(SIG, { ...resolvedEvent, round_id: new BN(MARKET_ROUND_BASE + 7) }).market).toBe('ETH')
    expect(mapSettlement(SIG, 0, { ...settledEvent, round_id: new BN(5 * MARKET_ROUND_BASE + 3) }).market).toBe('DOGE')
    expect(mapCheers(SIG, cheersEvent, null).market).toBeNull()
    expect(() => mapTrade(SIG, 0, { ...buyEvent, round_id: new BN(9 * MARKET_ROUND_BASE + 1) })).toThrow(
      `Round id ${9 * MARKET_ROUND_BASE + 1} belongs to no known market`,
    )
  })

  test('oracle price helper', () => {
    expect(priceToNumber('7725512345678', 8)).toBe(77255.12345678)
    expect(priceToNumber(new BN('7725500000000'), 8)).toBe(77255)
    expect(priceToNumber('-150000000', -8)).toBe(-1.5)
    expect(priceToNumber('42', 0)).toBe(42)
  })
})

describe('EventParser over encoded program logs (real IDL)', () => {
  const idl = JSON.parse(readFileSync(env.IDL_PATH, 'utf8')) as Idl
  const coder = new BorshCoder(idl)
  const chain = new ArenaChain(env)

  const programData = (name: string, data: Record<string, unknown>) => {
    const event = idl.events?.find(candidate => candidate.name === name)
    if (!event) throw new Error(`event ${name} missing from IDL`)
    const body = coder.types.encode(name, data)
    return `Program data: ${Buffer.concat([Buffer.from(event.discriminator), body]).toString('base64')}`
  }

  test('decodes events in order and they map to the same DTOs', () => {
    const logs = [
      `Program ${env.PROGRAM_ID} invoke [1]`,
      'Program log: Instruction: Buy',
      programData('PositionSettled', settledEvent),
      programData('TradeExecuted', buyEvent),
      programData('CheersPaid', cheersEvent),
      `Program ${env.PROGRAM_ID} consumed 41000 of 200000 compute units`,
      `Program ${env.PROGRAM_ID} success`,
    ]
    const events = chain.parseEvents(logs)
    expect(events.map(event => [event.name, event.index])).toEqual([
      ['PositionSettled', 0],
      ['TradeExecuted', 1],
      ['CheersPaid', 2],
    ])
    const [settled, trade, cheers] = events
    expect(mapSettlement(SIG, settled!.index, settled!.data as typeof settledEvent).payout).toBe(12)
    expect(mapTrade(SIG, trade!.index, trade!.data as typeof buyEvent).trade).toEqual({ ...expectedBuy, id: `${SIG}:1` })
    expect(mapCheers(SIG, cheers!.data as typeof cheersEvent, null).randomness).toBe(
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    )
  })

  test('events from other programs are ignored', () => {
    const other = 'Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz'
    const logs = [`Program ${other} invoke [1]`, programData('TradeExecuted', buyEvent), `Program ${other} success`]
    expect(chain.parseEvents(logs)).toEqual([])
  })

  test('keeps events emitted under a CPI: real devnet VRF callback tx 3acK2K49…', () => {
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
    const events = chain.parseEvents(callbackLogs)
    expect(events.map(event => [event.name, event.index])).toEqual([['CheersPaid', 0]])
    const cheers = mapCheers('3acK2K49', events[0]!.data as typeof cheersEvent, 'BTC')
    expect(cheers).toMatchObject({
      sig: '3acK2K49',
      owner: '42j1sjE7LUGWdgD25zVgypDx5jhkzbDCZzWMVzV8RqL4',
      recipients: ['BymPzSSHHUbhcw9qB1TLQkzcV2HD17n3mB4Ax2FP9699'],
      amountEach: 1,
    })
    expect(cheers.randomness).toMatch(/^[0-9a-f]{64}$/)
    expect(cheers.t % 1000).toBe(0)

    // The same data line under a different innermost program is not ours.
    const foreign = ['Program Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz invoke [1]', callbackLogs[5]!, 'Program Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz success']
    expect(chain.parseEvents(foreign)).toEqual([])
  })

  test('keeps events logged after an inner invoke returns: real devnet request_cheers tx 3z18MVog…', () => {
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
    const events = chain.parseEvents(requestLogs)
    expect(events.map(event => event.name)).toEqual(['CheersRequested'])
    const data = events[0]!.data as { owner: PublicKey; candidates: number }
    expect(data.owner.toBase58()).toBe('42j1sjE7LUGWdgD25zVgypDx5jhkzbDCZzWMVzV8RqL4')
    expect(data.candidates).toBe(1)
  })
})
