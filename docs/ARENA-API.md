# Arena service API (Railway) — contract between `apps/arena` and `apps/web`

Both sides implement this document exactly. All amounts crossing the API are plain numbers in
USD chips (on-chain micro units ÷ 1e6) unless marked `raw`. Timestamps: `t` fields are **milliseconds**,
`*Ts` fields are **unix seconds**. Wallet addresses are base58 strings and are **never lowercased**.

- HTTP base: `NEXT_PUBLIC_ARENA_API_URL` (local `http://localhost:8787`)
- WebSocket: `NEXT_PUBLIC_ARENA_WS_URL` (local `ws://localhost:8787/ws`)
- Errors: non-2xx with JSON `{ "error": "human readable message" }`. Never stack traces.

## Auth (wallet signature)

1. `POST /api/auth/nonce` body `{ wallet }` → `{ nonce, message }`
   `message` is exactly: `Rogs Arena sign-in\nwallet: <wallet>\nnonce: <nonce>` (nonce valid 5 minutes, single use).
2. Client signs the UTF-8 bytes of `message` with the wallet's ed25519 key.
3. `POST /api/auth/verify` body `{ wallet, signature }` (signature base58) → `{ token, wallet, expiresAt }` (24h).
4. Protected HTTP routes: header `Authorization: Bearer <token>`. WebSocket: send token in `hello`.

## DTOs

```ts
type Outcome = 'YES' | 'NO'

type RoundDto = {
  roundId: number
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

type PointDto = { roundId: number; t: number; yes: number; no: number; source: 'chain' }

type CloseDto = {
  id: string               // `${sig}:${eventIndex}`
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

type CheersDto = { sig: string; owner: string; recipients: string[]; amountEach: number; randomness: string; t: number }

type ProfileDto = { wallet: string; displayName: string | null; createdAt: number; updatedAt: number }

type ArenaSnapshot = {
  round: RoundDto | null
  recentRounds: RoundDto[]      // newest first, <= 96
  trades: TradeDto[]            // current round, ascending t, <= 400
  points: PointDto[]            // current round, ascending t
  closes: CloseDto[]            // current round
  traders: TraderDto[]
  anonymous: number
  online: number
  chat: ChatDto[]               // ascending t, <= 50
  cheers: CheersDto[]           // newest first, <= 20
  serverTime: number            // ms
}
```

## HTTP routes

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/health` | – | `{ ok, mongo, er, programId, arena: { roundId, status: 'idle' \| 'open' \| 'resolved', endTs } \| null, indexer: { lastSig, lastEventAt }, keeper: { lastRollSig, lastRollAt } }` |
| GET | `/api/arena` | – | `ArenaSnapshot` |
| GET | `/api/rounds?limit=96` | – | `RoundDto[]` newest first (limit ≤ 200) |
| GET | `/api/trades?roundId=` | – | `TradeDto[]` ascending |
| GET | `/api/points?roundId=` | – | `PointDto[]` ascending |
| GET | `/api/closes?roundId=` | – | `CloseDto[]` |
| GET | `/api/settlements?roundId=&owner=` | – | `SettlementDto[]` (either filter optional) |
| GET | `/api/chat?limit=50` | – | `ChatDto[]` ascending |
| GET | `/api/cheers?limit=20` | – | `CheersDto[]` newest first |
| GET | `/api/profile/:wallet` | – | `ProfileDto` or 404 |
| POST | `/api/profile` | Bearer | body `{ displayName }` (trimmed, 2–24 chars, letters/digits/space/_-.) → `ProfileDto` |
| POST | `/api/auth/nonce` | – | see Auth |
| POST | `/api/auth/verify` | – | see Auth |
| POST | `/api/faucet` | Bearer | sends 0.02 devnet SOL to the token's wallet if its balance < 0.01 SOL → `{ signature, lamports }`; `{ skipped: true, balance }` if already funded; 429 on limits (1 per wallet / 24h, 5 per IP / 24h) |

## WebSocket `/ws` (JSON text frames)

Client → server:
- `{ "type": "hello", "sessionId": "<tab id>", "token"?: "<auth token>" }` — first message; anonymous if no/invalid token.
- `{ "type": "presence" }` — every 15 s.
- `{ "type": "heart", "bpm": number | null }` — authenticated only; bpm 30..230 or null to clear.
- `{ "type": "chat", "message": string }` — authenticated only; 1..280 chars; max 1 per second per wallet.

Server → client:
- `{ "type": "snapshot", "data": ArenaSnapshot }` — reply to `hello`.
- `{ "type": "traders", "traders": TraderDto[], "anonymous": number, "online": number }` — on change, ≤ 1/s.
- `{ "type": "chat", "message": ChatDto }`
- `{ "type": "trade", "trade": TradeDto }`
- `{ "type": "point", "point": PointDto }`
- `{ "type": "round", "round": RoundDto }` — on open and on resolve.
- `{ "type": "close", "close": CloseDto }`
- `{ "type": "settlement", "settlement": SettlementDto }`
- `{ "type": "cheers", "cheers": CheersDto }`
- `{ "type": "error", "error": string }`

Presence: a session is online while presence arrives within 45 s (sweep every 5 s). A heart rate is shown while its
`heartRateAt` is within 45 s. Display name = profile `displayName`, else `address.slice(0, 4) + '…' + address.slice(-4)`.

## Indexing rules (arena service)

Source of truth is program logs on the ER (`onLogs(programId)` + backfill with `getSignaturesForAddress` / `getTransaction`),
decoded with Anchor's `EventParser` and the IDL at `target/idl/rogs_arena.json`.

- `TradeExecuted` → `trades` (+ `point` from `yesPriceBps / 1e4`); if `side == 1` also `closes` with `exit = realizedPnl >= 0 ? 'tp' : 'sl'`.
- `RoundOpened` / `RoundResolved` → `rounds` upsert by `roundId`.
- `PositionSettled` → `settlements`.
- `CheersPaid` → `cheers`.
- `HeartReported` → trader heart rate (on-chain confirmation of the WS value).
- Arena account subscription on the ER → a `point` heartbeat every 5 s while the round is open.
- All writes are idempotent on their ids; outcome `1 → YES`, `2 → NO`.
