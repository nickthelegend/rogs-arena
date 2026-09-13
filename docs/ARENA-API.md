# Arena service API (Railway) — contract between `apps/arena` and `apps/web`

Both sides implement this document exactly. All amounts crossing the API are plain numbers in
USD chips (on-chain micro units ÷ 1e6) unless marked `raw`. Timestamps: `t` fields are **milliseconds**,
`*Ts` fields are **unix seconds**. Wallet addresses are base58 strings and are **never lowercased**.

- HTTP base: `NEXT_PUBLIC_ARENA_API_URL` (local `http://localhost:8787`)
- WebSocket: `NEXT_PUBLIC_ARENA_WS_URL` (local `ws://localhost:8787/ws`)
- Errors: non-2xx with JSON `{ "error": "human readable message" }`. Never stack traces.

## Markets

Nine coin markets, in this order (`id` is the program's market id): `BTC` 0, `ETH` 1, `SOL` 2, `BNB` 3, `XRP` 4,
`DOGE` 5, `SUI` 6, `AVAX` 7, `LINK` 8. The table lives in `@rogs/arena-sdk` `MARKETS`.

- **Market key** everywhere in HTTP and WS is the ticker string `market`: `'BTC' | 'ETH' | 'SOL' | 'BNB' | 'XRP' | 'DOGE' | 'SUI' | 'AVAX' | 'LINK'`.
  It is case-sensitive.
- **Missing** `market` means `'BTC'`, so clients from before multi-market support keep working.
- **Unknown** `market` (including `sol` or an empty string): HTTP 400 `{ "error": "market: market must be one of BTC, ETH, SOL, BNB, XRP, DOGE, SUI, AVAX, LINK" }`.
  Over WS the same text comes back as an `error` frame.
- **Round ids** are namespaced: `roundId = marketId * 2^40 + n`, where `n` is the market's round counter (1, 2, 3, …).
  - BTC ids stay small (1, 2, …), and ids are unique across markets.
  - `marketId = Math.floor(roundId / 2 ** 40)` and `n = roundId % 2 ** 40`.
  - APIs always take and return the full namespaced number.
- **Available:** a market is available once its Arena account exists on the ER.
  - Until then it has no rounds, and the service reports `available: false` without inventing data.
  - The service rechecks on every arena read, every few seconds.
- **Global data:** chat, cheers, profile, auth, faucet and traders/presence are not per market.

## Auth (wallet signature)

1. `POST /api/auth/nonce` body `{ wallet }` → `{ nonce, message }`
   `message` is exactly: `Rogs Arena sign-in\nwallet: <wallet>\nnonce: <nonce>` (nonce valid 5 minutes, single use).
2. Client signs the UTF-8 bytes of `message` with the wallet's ed25519 key.
3. `POST /api/auth/verify` body `{ wallet, signature }` (signature base58) → `{ token, wallet, expiresAt }` (24h).
4. Protected HTTP routes: header `Authorization: Bearer <token>`. WebSocket: send token in `hello`.

## DTOs

```ts
type Outcome = 'YES' | 'NO'
type Market = 'BTC' | 'ETH' | 'SOL' | 'BNB' | 'XRP' | 'DOGE' | 'SUI' | 'AVAX' | 'LINK' // sent as a string

type RoundDto = {
  market: string           // derived from roundId
  roundId: number          // namespaced: marketId * 2^40 + n
  startTs: number
  endTs: number
  strikePrice: string      // raw i64 oracle integer
  closePrice: string | null // raw
  priceExpo: number        // decimals (oracle stores +8 => divide raw by 1e8)
  outcome: Outcome | null
  yesPool: number          // USD
  noPool: number           // USD
  volume: number           // USD
  trades: number
  openedSig: string | null
  resolvedSig: string | null
}

type TradeDto = {
  id: string               // `${sig}:${eventIndex}`
  sig: string
  market: string
  roundId: number
  owner: string
  side: 'BUY' | 'SELL'
  outcome: Outcome
  amount: number           // USD: gross in for BUY, net out for SELL
  shares: number           // shares (1 share pays 1 USD if it wins)
  price: number            // average price per share, 0..1 (amount / shares)
  yesPrice: number         // YES probability after the trade, 0..1
  fee: number              // USD
  realizedPnl: number      // USD, SELL only (0 for BUY)
  ability: number          // 0 none, 1 double, 2 protect, 3 calm, 4 cheers
  t: number                // ms
}

type PointDto = { market: string; roundId: number; t: number; yes: number; no: number; source: 'chain' }

type CloseDto = {
  id: string               // `${sig}:${eventIndex}`
  market: string
  roundId: number
  trader: string
  outcome: Outcome
  exit: 'tp' | 'sl'        // tp when realizedPnl >= 0
  profit: number           // USD
  shares: number
  t: number
}

type SettlementDto = {
  id: string               // `${sig}:${eventIndex}`
  sig: string
  market: string
  roundId: number
  owner: string
  outcome: Outcome
  payout: number
  profit: number
  ability: number
  bonus: number
  calm: boolean
  cheers: boolean
  t: number
}

type TraderDto = {
  address: string
  name: string
  status: 'online' | 'offline'
  lastSeen: number         // ms
  heartRate: number | null
  heartRateAt: number | null
  isBot: boolean
}

type ChatDto = { id: string; address: string; name: string; message: string; t: number }

type CheersDto = {
  sig: string
  market: string | null    // market whose arena paid it (read from the VRF callback transaction); null if unreadable
  owner: string
  recipients: string[]
  amountEach: number
  randomness: string
  t: number
}

type ProfileDto = { wallet: string; displayName: string | null; createdAt: number; updatedAt: number }

type ArenaSnapshot = {
  market: string                // the market this snapshot is for
  round: RoundDto | null        // that market's newest round; null if it has none yet
  recentRounds: RoundDto[]      // that market, newest first, <= 96
  trades: TradeDto[]            // current round, ascending t, <= 400
  points: PointDto[]            // current round, ascending t
  closes: CloseDto[]            // current round
  traders: TraderDto[]          // global
  anonymous: number
  online: number
  chat: ChatDto[]               // global, ascending t, <= 50
  cheers: CheersDto[]           // global (each carries its market), newest first, <= 20
  serverTime: number            // ms
}

type MarketDto = {
  market: string           // ticker
  id: number               // program market id (0..8)
  name: string             // e.g. 'Solana'
  color: string            // hex, e.g. '#9945FF'
  priceDecimals: number    // decimals to show for USD prices
  arena: string            // Arena PDA (base58)
  oracleFeed: string       // MagicBlock oracle price feed account (base58)
  available: boolean       // Arena account exists on the ER
  round: RoundDto | null   // that market's newest round (same as ArenaSnapshot.round)
}
```

## HTTP routes

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/health` | – | `{ ok, mongo, er, programId, arena, markets, indexer: { enabled, lastSig, lastEventAt }, keeper: { enabled, lastRollSig, lastRollAt } }` where `arena: { roundId, status: 'idle' \| 'open' \| 'resolved', endTs } \| null` is **BTC** (unchanged shape) and `markets: { market, available, roundId: number \| null, status: 'idle' \| 'open' \| 'resolved' \| null, endTs: number \| null }[]` in MARKETS order, read live from the ER (nulls when not available) |
| GET | `/api/markets` | – | `MarketDto[]` in MARKETS order (always 9 rows) |
| GET | `/api/arena?market=` | – | `ArenaSnapshot` for that market |
| GET | `/api/rounds?market=&limit=96` | – | `RoundDto[]` of that market, newest first (limit ≤ 200) |
| GET | `/api/trades?market=&roundId=` | – | `TradeDto[]` ascending (empty if `roundId` belongs to another market) |
| GET | `/api/points?market=&roundId=` | – | `PointDto[]` ascending |
| GET | `/api/closes?market=&roundId=` | – | `CloseDto[]` |
| GET | `/api/settlements?market=&roundId=&owner=` | – | `SettlementDto[]` ascending `t`, ≤ 1000. With `owner` and neither `market` nor `roundId`, the rows cover **all markets**. Otherwise they are scoped to `market` (BTC when missing), and `roundId`/`owner` narrow further. |
| GET | `/api/chat?limit=50` | – | `ChatDto[]` ascending |
| GET | `/api/cheers?limit=20` | – | `CheersDto[]` newest first, all markets |
| GET | `/api/profile/:wallet` | – | `ProfileDto`; a wallet that never saved a name gets `displayName: null`, `createdAt: 0`, `updatedAt: 0` (200, so first visits log no failed request) |
| POST | `/api/profile` | Bearer | body `{ displayName }` (trimmed, 2–24 chars, letters/digits/space/_-.) → `ProfileDto` |
| POST | `/api/auth/nonce` | – | see Auth |
| POST | `/api/auth/verify` | – | see Auth |
| POST | `/api/faucet` | Bearer | sends 0.02 devnet SOL to the token's wallet if its balance < 0.01 SOL → `{ signature, lamports }`; `{ skipped: true, balance }` if already funded; 429 on limits (1 per wallet / 24h, 5 per IP / 24h) |

`market` is optional on every route that takes it. It defaults to `BTC`; an unknown value is a 400.

## WebSocket `/ws` (JSON text frames)

Client → server:
- `{ "type": "hello", "sessionId": "<tab id>", "token"?: "<auth token>", "market"?: "SOL" }`
  - First message. Anonymous if there is no token or it is invalid.
  - `market` picks the snapshot (BTC when missing).
- `{ "type": "market", "market": "SOL" }`
  - Switches the socket's market after `hello`; the server replies with a `snapshot` for that market.
  - If several switches arrive quickly, only snapshots for the market the socket is currently on are sent.
- `{ "type": "presence" }` — every 15 s.
- `{ "type": "heart", "bpm": number | null }` — authenticated only; bpm 30..230 or null to clear.
- `{ "type": "chat", "message": string }` — authenticated only; 1..280 chars; max 1 per second per wallet.

Server → client:
- `{ "type": "snapshot", "data": ArenaSnapshot }` — reply to `hello` and to `market`; `data.market` names the market.
- `{ "type": "traders", "traders": TraderDto[], "anonymous": number, "online": number }` — on change, ≤ 1/s.
- `{ "type": "chat", "message": ChatDto }`
- `{ "type": "trade", "trade": TradeDto }`
- `{ "type": "point", "point": PointDto }`
- `{ "type": "round", "round": RoundDto }` — on open and on resolve.
- `{ "type": "close", "close": CloseDto }`
- `{ "type": "settlement", "settlement": SettlementDto }`
- `{ "type": "cheers", "cheers": CheersDto }`
- `{ "type": "error", "error": string }` — also for an unknown `market` in `hello` or `market`, and for `market` before `hello`.

The broadcast frames (`trade`, `point`, `round`, `close`, `settlement`, `cheers`) go to **every** client, whatever market it
last asked for. Each carries `market` inside its DTO, so clients filter on that.

Presence: a session is online while presence arrives within 45 s (sweep every 5 s). A heart rate is shown while its
`heartRateAt` is within 45 s. Display name = profile `displayName`, else `address.slice(0, 4) + '…' + address.slice(-4)`.

## Indexing rules (arena service)

Source of truth is program logs on the ER (`onLogs(programId)` + backfill with `getSignaturesForAddress` / `getTransaction`),
decoded against the IDL (`target/idl/rogs_arena.json`, or the committed `apps/arena/idl/rogs_arena.json`).
One log subscription covers every market, and each event's market comes from its namespaced round id.

- `TradeExecuted` → `trades` (+ `point` from `yesPriceBps / 1e4`); if `side == 1` also `closes` with `exit = realizedPnl >= 0 ? 'tp' : 'sl'`.
- `RoundOpened` / `RoundResolved` → `rounds` upsert by `roundId`.
- `PositionSettled` → `settlements`.
- `CheersPaid` → `cheers`.
  - The event has no round id, so `market` is the market whose Arena PDA appears in the VRF callback transaction's accounts.
- `HeartReported` → trader heart rate (on-chain confirmation of the WS value).
- Account subscriptions on all nine Arena PDAs, plus a single `getMultipleAccounts` read of all of them every 5 s.
  - Together they mirror each market's rounds and emit a per-market `point` heartbeat while that market's round is open.
  - Markets whose arena is missing are skipped until it exists.
- All writes are idempotent on their ids; outcome `1 → YES`, `2 → NO`.
- MongoDB: every market-scoped document (`rounds`, `trades`, `points`, `closes`, `settlements`, `cheers`) stores `market`.
  - On startup, an idempotent migration stamps `market` on older documents that lack it.
  - It derives the value from `roundId`; cheers get `BTC`.
  - Per-market queries use `{ market, roundId }` / `{ market, owner }` indexes.

## Keeper (arena service)

For every available market, one market at a time per 2 s tick:
- Backup `roll_round` with that market's arena and oracle feed.
- Crank stall detection and reschedule. The task label is `rogs-arena:rounds:<arena PDA>:r<roundId>`; bootstrap schedules `rogs-arena:rounds:<arena PDA>`.
- `commit_arena` every 12 resolved rounds of that market, at most 9 per delegation, and at most one commit per tick across markets.
- `settle_player` with the arena of the market the round belongs to.

Cheers requests use the arena of the market the cheers was won in; the candidates are recent traders of that arena.
State is kept per market in `meta` (`keeper` for BTC, `keeper:<TICKER>` for the others).
