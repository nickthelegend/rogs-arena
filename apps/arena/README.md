# @apps/arena

The Bun service behind Rogs Arena. It runs on Railway as a single process that hosts:

- **HTTP API and WebSocket** (`/ws`) on one port. The contract lives in [`docs/ARENA-API.md`](../../docs/ARENA-API.md).
- **Indexer.** Reads `rogs_arena` program logs from the MagicBlock ER (`onLogs`, plus a backfill of the last 1,000 signatures) and the Arena account subscription. It writes to MongoDB and pushes over the WebSocket.
- **Markets.** Nine coin markets (BTC, ETH, SOL, BNB, XRP, DOGE, SUI, AVAX, LINK) from `@rogs/arena-sdk` `MARKETS`, one Arena PDA each. The indexer and keeper tend every market whose arena exists on the ER and recheck the others on each read.
- **Price sampler.** Every 2 s it reads all nine MagicBlock oracle feed accounts on the ER in one `getMultipleAccountsInfo` call and stores a point per market whose publish time advanced (`prices`, kept 6 hours). `GET /api/prices` serves them to the web price chart.
- **Keeper (watchdog).** Steps in only when the MagicBlock crank is late, per market. It rolls rounds, settles players after a round resolves, requests and resets VRF Cheers, and commits the arena to Solana every 12 rounds (at most 9 commits). Every action goes to `keeper_log`.
- **Faucet.** Sends 0.02 devnet SOL to a signed-in wallet whose balance is below 0.01 SOL. Limits: 1 request per wallet and 5 per IP every 24 hours.

## Run

```sh
cp .env.example .env    # fill in values; never commit .env
bun run src/index.ts    # or: bun run dev
bun test                # needs Mongo (uses db rogs_arena_test) and devnet for the faucet test
bunx tsc --noEmit -p .
```

`INDEXER_ENABLED=false`, `KEEPER_ENABLED=false` and `PRICE_SAMPLER_ENABLED=false` switch those parts off, which is useful for API-only local runs.

## Environment

Every name is listed in `.env.example`. Secret keys are JSON byte arrays, and the keeper key must be the arena authority.
The IDL loads from `IDL_PATH`. By default it tries `../../target/idl/rogs_arena.json` first, then `idl/rogs_arena.json`, which is the committed copy Railway uses.
After changing the program, re-copy the IDL with `cp target/idl/rogs_arena.json apps/arena/idl/` and `cp target/types/rogs_arena.ts apps/arena/idl/`.

## Railway

In the service settings, set the root directory to the repo root and the config file to `apps/arena/railway.json`.
That config sets `buildCommand` so the root `build` script, which builds the web app, is skipped for this service.
