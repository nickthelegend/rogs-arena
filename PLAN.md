# PLAN.md — Rogs Arena (rizz-club → Solana + MagicBlock)

> **Single source of truth for the build.** A builder agent must be able to pick up any task below cold.
> Status tags: `DONE` · `IN PROGRESS` · `NOT STARTED` · `BLOCKED (reason)`. Priority: **P0** = required to submit, **P1** = required to win, **P2** = stretch.
> Update a task's status the moment it changes, and write *why* next to anything not DONE.

- **Hackathon:** MagicBlock **Solana Blitz v8** (Global Startup Village). Submissions close **2026-09-13 12:30 UTC = 18:00 IST** (live countdown verified at https://build.magicblock.app/?stage=blitz#submit on 2026-09-12 21:37 UTC).
- **Rules that bind this plan:** "Every submission must integrate MagicBlock's Ephemeral Rollup." Judged on **creativity, technical depth, and how compellingly it showcases what's possible on Solana.** Prizes 500/250/150 USDC + 100 USDC Wizardio's Choice. The form asks for: name, description, ≤3 categories, website, GitHub repo, pitch & demo, **explorer link, program addresses**, team Telegram handles, submitter info + wallet.
- **Owner constraints (non-negotiable):**
  1. Keep **every existing rizz-club UI component**. Only the backend/data layer changes, plus Somnia→Solana wording.
  2. MagicBlock is mandatory, and must be load-bearing, not a checkbox.
  3. MongoDB (Atlas) for persistence. The URI lives only in env vars, never in git.
  4. Frontend on **Vercel**. Backend on **Railway** only where a server is genuinely needed.
  5. **No mocks, no fallback data, no stubbed logic** anywhere in the shipped product.
  6. Pause only for real money, mainnet actions, or a credential that doesn't exist anywhere.

---

## 0. Verified snapshot (2026-09-13 ~03:30–04:00 IST)

| Fact | Evidence |
|---|---|
| Source app is `rogs/rizz-club`: a turborepo + bun monorepo with `apps/web` (Next 16.3.3, React 19.2.8, 19.7k LOC), `apps/watcher` (2.1k), `apps/bot` (3.4k), and `packages/{shared,ui,eslint-config,typescript-config}` | inventory run |
| It ran on **Somnia testnet via dreamDEX EC** (`@somnia-chain/markets-sdk` 0.28.1): BTC 5-minute binary YES/NO order-book markets | `apps/web/lib/dreamdex.ts`, `hooks/use-current-market.ts:15` |
| Auth and server-side signing through **Privy**. Data in **Supabase Postgres (Drizzle)** and **Firebase RTDB** | `apps/web/env.ts`, `db/schema.ts`, `lib/firebase.ts` |
| No real `.env` files exist, only `.env.example`. **No Privy, Supabase, Firebase, WalletConnect or Somnia credentials exist anywhere** | inventory run |
| Baseline on a scratch copy: `bun install` OK. Tests: web 188/188, bot 47/47, watcher 21/21 pass | scratchpad `baseline.log` |
| Baseline `next build` **fails**: `lib/privy.ts:4` constructs `PrivyClient` at import and needs `PRIVY_APP_ID` | `baseline.log` |
| Baseline `tsc`: web has 4 missing-png-module errors (no `next-env.d.ts`); bot has 1 test cast error; watcher's `tsconfig baseUrl` was removed in TS 7 | `baseline.log` |
| Not a git repo. GitHub `nickthelegend/rogs-arena` does not exist yet | `gh repo view` |
| MongoDB Atlas `cluster0.hfcalen.mongodb.net` is reachable from this machine: `ping ok`, only `admin`/`local` DBs (empty) | probe script |
| Vercel CLI 54.14.2 logged in (`niveshgajengi`, scope `nicolas-projects-f497bb7f`). Railway CLI 5.52.1 logged in (Nivesh Gajengi) | CLI whoami |
| Toolchain: solana-cli 3.1.11 (Agave), anchor-cli 0.32.1, rustc 1.94, node 26.5, bun 1.3.11, docker 29 | version checks |
| **Devnet deployer** `Ens1TxKQ99BeYH9yPZTw2wJs1j156oMdYs9iBhenyVvr` (`~/.config/solana/rogs-deployer.json`, outside the repo) holds **10 devnet SOL** | `solana balance` |
| Keypair paths on the `Extreme SSD` volume contain a space, and `solana-keygen` rejects them as absolute paths. Use `~/.config/solana/...` or relative paths | memory note |
| MagicBlock devnet status: asia/europe/usa `er`, `rpc_router`, `pricing_oracle`, `vrf_oracle` all **live**; TEE router down | status API |
| **BTC/USD MagicBlock Pricing Oracle feed (Pyth Lazer) on devnet ER:** `71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr`, updated every ~1s, price ≈ 77,255 (8 decimals). SOL/USD: `ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu` | `getProgramAccounts(PriCems5…)` on devnet-as and the oracle README |
| Oracle account layout (PriceUpdateV2): disc `[234,161,14,36,172,239,15,232]`, write_authority 8..40, verification_level 40, feed_id 41..73 (**= the account's own pubkey bytes**), price i64 @73, conf @81, exponent i32 @89 (**stored as +8, meaning 8 decimals**), publish_time i64 @93, posted_slot u64 @125 | decode and official app `binaryPrediction.ts:278-311` |
| `ephemeral-rollups-sdk` **0.17.0** (crates.io latest) has features `anchor-compat` (Anchor ≥0.28 <1.0), `vrf`, `crank` (`ScheduleCrankCpi`), `access-control`, `spl` | local registry `Cargo.toml` |
| This exact stack (anchor-lang 0.32.1 + ER SDK 0.17.0 `anchor-compat`+`vrf` + `session-keys` 3.1.1) **already built on this machine** | `solana-magicblock-v8/chain/programs/fogduel/Cargo.toml` |
| `session-keys` 3.1.1 exposes `SessionTokenV2` (seed `session_token_v2`). The client creates it with `SessionTokenManager.program.methods.createSessionV2(topUp, validUntil, lamports)` from `@magicblock-labs/gum-sdk` | `binary-prediction` example |

Reference code on disk, all read-only:
- Official examples: `/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-rogs/d1d6270e-9033-4edf-8300-81396531a54b/scratchpad/mb-examples`. Useful ones: `binary-prediction/anchor`, `crank-counter/anchor`, `oracle-priced-purchase/anchor`, `roll-dice/anchor`, `rewards-delegated-vrf`, `session-keys/anchor`. A vendored copy also lives at `../magicblock-v8/vendor/magicblock-engine-examples`.
- MagicBlock agent skill: `../magicblock-v8/.agents/skills/magicblock/` (SKILL.md plus references). Read `delegation.md`, `session-keys.md`, `vrf.md`, `cranks.md`, `pricing-oracle.md`, `typescript-setup.md` and `fees-and-commit-economics.md` before touching MagicBlock code.
- Proven sibling projects on this machine: `../solana-magicblock-v8/chain/programs/fogduel/src/lib.rs` (session_auth_or, VRF request/callback, delegate/commit contexts under Anchor 0.32.1) and `../magicblock-v8` (devnet deploy scripts, Next.js wallet-adapter app).

---

## 1. Goals

### 1.1 What "done" means for THIS project
Rizz Club's full product loop runs on **Solana devnet + MagicBlock Ephemeral Rollups** under the name **Rogs Arena**, with every rizz-club UI component still present and wired to real on-chain data:

1. **Enter the zone.** A player connects a Solana wallet (Phantom/Solflare) or a one-click guest wallet. A real keypair is funded by a real devnet faucet transfer. The player's `Player` PDA is created and **delegated to a MagicBlock ER**, and a **session key** (Gum `SessionTokenV2`) is created so trading is one-tap and gasless.
2. **BTC 5-minute rounds.** A real on-chain binary YES/NO market per 5-minute window. The strike and the close are read inside the ER from the **MagicBlock Pricing Oracle BTC/USD feed**. Rounds roll themselves via a **MagicBlock Crank** on the ER; a Railway keeper exists only as a watchdog.
3. **Trade.** Buy YES/NO with a $ amount and sell (take profit) at on-chain AMM prices. Each trade is a real ER transaction signed by the session key, with ~10–50ms confirmations shown in the UI.
4. **Ability cards, enforced on-chain.**
   - Double price: profit bonus, capped at $10.
   - Protect loss: loss refund, capped at $10.
   - Calm pulse / Steal Heart: +$10 on a win **only if the on-chain reported heart rate is <120 bpm and fresh**.
   - Cheers: on a win, **10 random other traders get $1 each, chosen by MagicBlock VRF** inside the ER.
5. **Heart rate.** Web Bluetooth bpm is broadcast live and written on-chain (gasless ER tx, throttled).
6. **Progression.** Trade Masters, Streak Climber, Steal Heart and Day Trader stats live **on-chain in the Player account**, not localStorage.
7. **Live social layer.** Chart of trades + live BTC price from the oracle, per-round leaderboard, chat, and presence. Persisted in **MongoDB**, pushed in realtime from the Railway service. Trades and rounds are indexed from real ER program logs.
8. **Settles to Solana.** Round state is periodically committed from the ER back to Solana. Players can commit/undelegate their account. The explorer shows the program, delegation, and commit transactions.
9. **Deployed.** Program on devnet. Frontend on Vercel. Arena service on Railway, connected to Atlas. Repo on GitHub.
10. **Verified.** Rust unit tests for all on-chain math and rules. A devnet E2E script that proves the full lifecycle with real signatures. A browser test plan executed against the deployed app with zero console/network errors.

### 1.2 What "winning" means here (judge lens)
- **Load-bearing MagicBlock depth, visibly.** Seven MagicBlock capabilities each do real work that is hard without it: ER delegation, commit, session keys, Pricing Oracle read inside the ER, Crank-driven rounds, VRF-picked Cheers, and gasless high-frequency heart-rate writes. A **/proof** page shows live evidence: delegation status via the router, ER vs base latency, the last crank roll, the last VRF fulfillment, the last commit signature, and oracle freshness.
- **Creativity.** Heartbeat-gated abilities ("Steal Heart only pays if you stay calm, measured on-chain") plus social VRF gifting. No other Blitz trading app has that.
- **Honesty.** No fake activity. Bots, if enabled, place real on-chain trades and are **labeled as bots**. Heart rate is labeled self-reported. The README's "what this does NOT prove" section is explicit.
- **Demo.** One judge can open the Vercel URL, click "Play as guest", and within ~30 seconds place a real ER trade, watch the round roll, and see settlement. No extension required.

---

## 2. Architecture decisions (the contract builders code against)

### 2.1 Repo layout (target)
Git root is `/Volumes/Extreme SSD/Projects/rogs`, published as GitHub `nickthelegend/rogs-arena`, created **private**. The owner flips it public at submission.
```
rogs/
  PLAN.md  README.md  SUBMISSION.md  package.json (name "rogs-arena", bun workspaces)  turbo.json  bun.lock
  Anchor.toml  Cargo.toml (workspace)  rust-toolchain? (none; use installed)
  programs/rogs-arena/            # Anchor 0.32.1 program (NEW)
  tests/                          # anchor ts tests (local) + devnet e2e (NEW)
  packages/arena-sdk/             # TS client: idl, pda, math, oracle, tx builders (NEW)
  packages/shared/                # keep; firebase-path → realtime channel consts
  packages/ui, eslint-config, typescript-config   # keep
  apps/web/                       # Next.js UI (KEEP ALL COMPONENTS) → Vercel
  apps/arena/                     # Bun service: http api + websocket + indexer + keeper + faucet (+bots) → Railway (NEW, replaces watcher+bot)
  apps/watcher, apps/bot          # Somnia-only backend → removed after arena parity (backend, not UI)
  scripts/                        # bootstrap, deploy, e2e
  docs/                           # TEST-PLAN, MAGICBLOCK-AUDIT, JUDGE-REPORT, COMPLETION, ARCHITECTURE
```

### 2.2 On-chain program `rogs_arena` (Anchor 0.32.1)
`Cargo.toml` deps:
- `anchor-lang = { version = "0.32.1", features = ["init-if-needed"] }`
- `ephemeral-rollups-sdk = { version = "0.17.0", features = ["anchor-compat", "vrf", "crank"] }`
- `session-keys = { version = "3.1.1", features = ["no-entrypoint"] }`
- No pyth crate. The oracle account is decoded with a local typed Borsh mirror of `PriceUpdateV2`, after discriminator/owner/key checks.

**Units:** chip micro-dollars (6 decimals), so 1 USD = `1_000_000`. Chips are real on-chain balances inside `Player`. The UI shows them as "USD (devnet chips)".

**Constants** (config where noted):

| Constant | Value |
|---|---|
| `ROUND_SECONDS` (config) | 300 |
| `TRADE_LOCK_SECONDS` | 5 |
| `MAX_PRICE_AGE_SECONDS` | 30 |
| `LIQUIDITY` (config) | 200 USD per round |
| `FEE_BPS` (config) | 100 |
| `MIN_TRADE` / `MAX_TRADE` | 1 USD / 100 USD |
| `START_CHIPS` | 250 USD |
| `FAUCET_AMOUNT` | 100 USD |
| `FAUCET_COOLDOWN` | 3600s |
| `FAUCET_MAX_BALANCE` | 50 USD |
| `ABILITY_CAP` | 10 USD |
| `CALM_BPM_LIMIT` | 120 |
| `HEART_BPM_RANGE` | 30..=230 |
| `HEART_MAX_AGE` | 120s (relative to round `end_ts`) |
| `CHEERS_RECIPIENTS` | 10 |
| `CHEERS_AMOUNT` | 1 USD |
| `RECENT_TRADERS` | 16 |
| `HISTORY_LEN` | 64 |
| `POSITION_SLOTS` | 4 |
| `ORACLE_PROGRAM_ID` | `PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd` |

**Accounts**

1. **`Arena`** (zero_copy, PDA `["arena"]`, ~5 KB, **delegated**):
   - Config and counters: `authority`, `keeper`, `oracle_feed`, `round_seconds i64`, `liquidity u64`, `fee_bps u64`, `treasury u64`, `claims_outstanding u64`, `total_volume u64`, `total_trades u64`, `total_players u64`, `crank_task_id i64`, `last_roll_ts i64`, `bump u8`.
   - `current: RoundState`: `id u64`, `start_ts`, `end_ts`, `strike_price i64`, `close_price i64`, `price_expo i32`, `status u8` (0 idle, 1 open, 2 resolved), `outcome u8` (0 none, 1 YES, 2 NO, 3 VOID), `yes_pool`, `no_pool`, `collateral`, `volume`, `trades`.
   - `history: [RoundSummary; 64]` + `history_head` + `history_len`.
   - `recent: [Pubkey; 16]` + `recent_head`.
2. **`Player`** (Borsh `#[account]`, PDA `["player", owner]`, ~300 B, **delegated**):
   - `owner`, `joined bool`, `balance u64`.
   - `positions: [Position; 4]`, where each `Position` is `{ round_id, yes_shares, no_shares, cost, proceeds, ability u8, active bool }`.
   - Stats: `trades_total u32`, `wins_total u32`, `losses_total u32`, `win_streak u16`, `best_streak u16`, `same_side_streak u16`, `last_side u8`, `calm_wins u32`, `day_index i64`, `day_trades u16`, `badges u32`, `pnl_total i64`, `volume_total u64`.
   - Heart and cheers: `heart_bpm u16`, `heart_ts i64`, `cheers_pending u8`, `cheers_inflight u8`, `cheers_received u64`.
   - `last_faucet_ts i64`, `bump`.

**Market math.** Fixed-product binary market maker (FPMM), fully collateralised, u128 intermediates.
- **Buy** `c_gross` of outcome X:
  - `fee = c_gross*fee_bps/1e4`, `c = c_gross - fee`.
  - `(Y,N) += (c,c)`; `k = Y0*N0`.
  - The pool keeps `ceil(k / other1)` of X and pays out `shares = X1 - ceil(k/other1)`.
  - `collateral += c`, `treasury += fee`.
- **Sell** `s` shares of X:
  - `r = floor(((X+s+O) - isqrt((X+s+O)^2 - 4*s*O)) / 2)`, decremented until `(X+s-r)*(O-r) >= k`.
  - `fee = r*fee_bps/1e4`, `out = r - fee`.
  - Pools become `(X+s-r, O-r)`, `collateral -= r`, `treasury += fee`.
- **Probability:** YES price = `N/(Y+N)`.
- **Invariant:** `collateral == minted sets`, so the round is always solvent.
- **Resolve** with outcome W:
  - `pool_winning = W==YES ? Y : W==NO ? N : (Y+N)/2`.
  - `treasury += pool_winning`; `claims_outstanding += collateral - pool_winning`.
- **Settle** a slot:
  - `payout = W==YES ? yes : W==NO ? no : (yes+no)/2`.
  - `profit = payout + proceeds - cost`.
  - Ability: Double gives `min(profit,CAP)` if `profit>0`. Protect gives `min(-profit,CAP)` if `profit<0`. Calm gives `CAP` if `profit>0` and bpm is in [30,120) and `|heart_ts - end_ts| <= HEART_MAX_AGE`. Cheers does `cheers_pending += 1` if `profit>0`.
  - Bonuses are paid from `treasury`, capped at what's available.
  - Stats: wins/losses, `win_streak` (+1 on profit>0, reset on profit<0, unchanged on 0), `best_streak`, `calm_wins` (win AND calm, with or without the card, matching `lib/progress.ts:146`), `pnl_total`, badges.

**Audit-driven rules** (web data audit, 2026-09-13):
- **Outcome.** YES iff `close >= strike`, matching rizz-club's question "BTC closes at or above its opening price" (`apps/web/lib/market-history.ts:8`, `features/chart-market/index.tsx:70-71`). There is **no VOID** outcome. A round that can't read a fresh oracle price doesn't resolve; it retries.
- **`attach_ability(ability u8)`** (ER, owner or session). Requires an active position in the *current open* round with no ability yet, and `now < end_ts - TRADE_LOCK_SECONDS`. This replaces the parked-card POST that let cards be applied after the result was known (G-32).
- **`TradeExecuted`** carries `realized_pnl i64` on sells (`proceeds_this_sale - cost × sold/held`). The indexer turns sells into `closes` rows `{marketId, trader, outcome, exit: tp|sl, profit, shares, t}` (the G-39 shape).
- **Market time series.** The arena service samples the Arena YES/NO price on every account change (at most 1 Hz) and sends a heartbeat every 5s while the round is open. Points go to Mongo `points{roundId, t, yes, no}`, capped per round, and out over WS `market` in the old Firebase `market/{pushId}` shape `{t, yes, no, source, marketId, symbol, expirySeconds}` (G-43).

**Instructions**

| # | Name | Runs on | Signer / auth | Effect |
|---|---|---|---|---|
| 1 | `initialize_arena(oracle_feed, round_seconds, liquidity, fee_bps, treasury_seed)` | base | authority | init Arena, keeper=authority, treasury=seed |
| 2 | `delegate_arena()` | base | authority | `#[delegate]` `del` arena, validator in remaining_accounts |
| 3 | `init_player()` | base | owner (payer) | init Player PDA |
| 4 | `delegate_player()` | base | owner | `#[delegate]` `del` player |
| 5 | `claim_chips()` | ER | owner **or session** | first call: +START_CHIPS, joined, total_players++; later: cooldown + low balance → +FAUCET_AMOUNT (from treasury) |
| 6 | `buy(outcome u8, amount u64, min_shares u64, ability u8)` | ER | owner **or session** | FPMM buy in current round; auto-settle resolved slots found in history; attach ability once per position; stats; push recent; `emit TradeExecuted` |
| 7 | `sell(outcome u8, shares u64, min_out u64)` | ER | owner **or session** | FPMM sell; `emit TradeExecuted` |
| 8 | `settle_player()` | ER | permissionless | settle every active slot whose round is resolved (history or current); `emit PositionSettled` per slot |
| 9 | `report_heart(bpm u16)` | ER | owner **or session** | store bpm + ts (range checked) |
| 10 | `roll_round()` | ER | permissionless (crank / keeper) | no-op if `now < end_ts`; else read oracle, resolve, push history, open next (end aligned to the next 5-min boundary, ≥60s away), `emit RoundResolved/RoundOpened` |
| 11 | `schedule_round_crank(task_id, interval_ms, iterations)` | ER | authority | `ScheduleCrankCpi` for `roll_round` [arena w, oracle r], store task id |
| 12 | `request_cheers(caller_seed [u8;32])` | ER | any payer | `#[vrf]`; winner `cheers_pending>0`; candidates = `remaining_accounts` Player PDAs verified against `arena.recent` (≠ winner, ≤12); request on `DEFAULT_EPHEMERAL_QUEUE` with callback metas [arena, winner, candidates…] |
| 13 | `cheers_callback(randomness [u8;32])` | ER | `#[vrf_callback]` (VRF identity) | Fisher-Yates with randomness; pay ≤10 recipients `CHEERS_AMOUNT` from treasury; `emit CheersPaid{winner, recipients, amount, randomness}` |
| 14 | `commit_arena()` | ER | keeper/authority | `MagicIntentBundleBuilder.commit([arena])` (P1; respect the commit quota, see fees doc) |
| 15 | `commit_player()` / `undelegate_player()` | ER | owner | commit / commit_and_undelegate player (P1) |

- Session-enabled contexts use `#[derive(Accounts, Session)]` with `#[session(signer = signer, authority = player.owner)] session_token: Option<Account<SessionTokenV2>>`, and the handler is guarded by `#[session_auth_or(ctx.accounts.player.owner == ctx.accounts.signer.key(), ArenaError::Unauthorized)]`.
- **ER rule:** signers that aren't delegated are **not `mut`** in ER contexts. Mirror the binary-prediction `PlaceBet` context.
- **Events:** `TradeExecuted{round_id, owner, outcome, side, amount, shares, fee, yes_price_bps, ability, ts}`, `RoundOpened{round_id,start_ts,end_ts,strike,expo}`, `RoundResolved{round_id,close,outcome,yes_pool,no_pool,volume,trades,house_back}`, `PositionSettled{round_id,owner,payout,profit,ability,bonus,calm}`, `ChipsClaimed{owner,amount,first}`, `CheersRequested{winner}`, `CheersPaid{winner,recipients,amount,randomness}`.

### 2.3 MagicBlock usage map (what a judge can trigger)

| Capability | Where | Judge-visible proof |
|---|---|---|
| ER delegation (`#[delegate]`, router) | `delegate_arena`, `delegate_player`; client checks `getDelegationStatus` | /proof delegation rows plus explorer base txs |
| Gasless ER execution | buy/sell/claim/heart/settle/roll | trade latency badge; ER signatures |
| Session keys (`SessionTokenV2`) | every high-frequency ix | one wallet approval, then no popups; token PDA shown in /proof |
| Pricing Oracle in the ER | `roll_round` strike/close; client chart subscribes to the feed | live BTC price with publish-time freshness |
| Cranks | `schedule_round_crank` → `roll_round` | round rolls with no Railway action; /proof "last roll by crank" |
| VRF | `request_cheers` / `cheers_callback` | Cheers toast listing the 10 recipients plus the randomness |
| Commit / undelegate | `commit_arena`, `undelegate_player` | base-layer account shows the committed round state; commit signature via `GetCommitmentSignature` |

### 2.4 Off-chain
- **Mongo DB `rogs_arena`.** Every collection gets its indexes created at boot:
  - `users{wallet(uniq), displayName, avatar, frame, isBot, createdAt, updatedAt}`
  - `trades{sig(uniq), roundId, owner, outcome, side, amount, shares, fee, yesPriceBps, ability, ts}`
  - `rounds{roundId(uniq), start, end, strike, close, outcome, yesPool, noPool, volume, trades, openedSig, resolvedSig}`
  - `settlements{sig+owner+roundId(uniq), payout, profit, ability, bonus, calm, ts}`
  - `cheers{sig(uniq), winner, recipients[], amount, randomness, ts}`
  - `chat{_id, wallet, name, text, ts}`
  - `faucet{wallet, ip, sig, lamports, ts}`
  - `sessions{token(uniq), wallet, expiresAt}` (login nonce/sig auth)
  - `presence` stays in memory only
- **Railway service `apps/arena`** (Bun, one process):
  - **HTTP API:** `GET /health`, `GET /api/arena` (snapshot), `GET /api/rounds?limit`, `GET /api/trades?roundId`, `GET /api/leaderboard?roundId`, `GET /api/chat?limit`, `POST /api/auth/nonce`, `POST /api/auth/verify` (ed25519 wallet signature → token), `POST /api/profile` (auth), `POST /api/faucet` (auth; devnet SOL transfer from the faucet wallet, rate-limited in Mongo).
  - **WebSocket `/ws`:**
    - client→server: `hello{token?}`, `presence`, `heart{bpm}`, `chat{text}` (auth required).
    - server→client: `snapshot`, `trader`, `trader_left`, `chat`, `trade`, `round`, `settle`, `cheers`, `heart`.
  - **Indexer:** ER `onLogs(programId)` parsed with the Anchor `EventParser` into Mongo and WS broadcasts. Backfills via ER `getSignaturesForAddress` on boot.
  - **Keeper (watchdog, not primary):** every 2s reads Arena.
    - If `now > end_ts + 8s`, send `roll_round` (crank late).
    - After each resolved round, call `settle_player` for every owner with trades in that round, then `request_cheers` for players with `cheers_pending > 0`.
    - Every 12 rounds, call `commit_arena` (P1).
    - On boot, if crank iterations are exhausted or the task is missing, it re-schedules (authority key).
  - **Bots (P2, off by default):** N keypairs placing real ER trades, `users.isBot=true`, shown with a bot tag.
- **Vercel `apps/web`:** UI only. It talks directly to devnet base RPC, MagicBlock router and ER (reads + session-signed txs), and to Railway (API + WS). No Mongo credentials on Vercel.

### 2.5 Frontend seam: hook → new source (components untouched)

| Existing hook / lib | Old source | New source |
|---|---|---|
| `components/providers.tsx` | Privy + wagmi + react-query + CurrentMarketProvider | Solana wallet-adapter (Phantom/Solflare) + guest wallet + ArenaProvider (connections, session) + react-query + CurrentMarketProvider |
| `hooks/use-current-market.ts` (`useCurrentMarket`, `useMarketCountdown`, `marketWindowSeconds`, `currentMarketIds`) | Somnia `loadMarkets` every 5s | Arena account on ER via `onAccountChange` → `ArenaMarket` object with the fields components read (`id`, `symbol`, `quote`, `active`, `outcomes[{label,symbol}]`, `info{marketId,tradingStart,expiry,intervalSec}`, plus YES price) |
| `hooks/use-trading.ts` (same return shape) | Next API + Privy server signing | arena-sdk `buy/sell/settle` signed by session key → ER; positions from `Player` account subscription; `quoteBalance` = chips |
| `hooks/use-trade-setup.ts`, `lib/trade-setup.ts` | Privy wallet + session signer setup | steps: connect → faucet SOL (Railway) → `init_player`+`delegate_player` (base) → `createSessionV2` (base) → `claim_chips` (ER) |
| `hooks/use-market-trades.ts`, `use-market-timeseries.ts`, `use-market-history.ts`, `use-market-closes.ts` + `lib/market-*.ts` | Somnia fills/candles/Firebase closes | Railway `/api/trades`, `/api/rounds` + WS `trade`/`round`/`settle`; YES timeseries from trade prices |
| `features/chart-btc`, `lib/btc.ts` | Somnia EMA price feed | MagicBlock oracle BTC/USD account subscription on ER (decode PriceUpdateV2) |
| `hooks/use-traders.ts`, `lib/traders.ts` | Firebase `traders` presence/heart | Railway WS presence + `heart` + `/api/leaderboard` |
| `hooks/use-leaderboard.ts`, `lib/leaderboard.ts` | Firebase + Somnia PnL | Railway `/api/leaderboard?roundId` (settlements + live positions) |
| `hooks/use-chat.ts` | Firebase `/chat` | Railway WS `chat` + `/api/chat` |
| `hooks/use-heart-rate.ts` | Web Bluetooth + Firebase | keep Web Bluetooth; broadcast via WS; `report_heart` ER tx every ≥5s while live |
| `hooks/use-progress.ts`, `lib/progress.ts` | localStorage | `Player` stats (same `ProgressState` shape: trades, streak, calmWins, dayKey, dayTrades) |
| `hooks/use-users.ts`, `use-display-name.ts`, `services/users.ts` | Postgres via Drizzle | Railway `/api/profile` + `users` |
| `app/api/*` (abilities, faucet, privy-auth, trading/*, wallet/*) | Somnia/Privy server | **deleted** (backend moved on-chain and to Railway) |

### 2.6 Env vars (names only; values never committed)
- **Web (Vercel):** `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`, `NEXT_PUBLIC_BASE_RPC_URL`, `NEXT_PUBLIC_ROUTER_URL`, `NEXT_PUBLIC_ER_RPC_URL`, `NEXT_PUBLIC_ER_WS_URL`, `NEXT_PUBLIC_PROGRAM_ID`, `NEXT_PUBLIC_ORACLE_BTC_FEED`, `NEXT_PUBLIC_ARENA_API_URL`, `NEXT_PUBLIC_ARENA_WS_URL`.
- **Arena (Railway):** `MONGODB_URI`, `MONGODB_DB=rogs_arena`, `PROGRAM_ID`, `BASE_RPC_URL`, `ER_RPC_URL`, `ER_WS_URL`, `ROUTER_URL`, `ORACLE_BTC_FEED`, `KEEPER_SECRET_KEY` (JSON array), `FAUCET_SECRET_KEY`, `AUTHORITY_SECRET_KEY` (crank re-schedule only), `CORS_ORIGIN`, `PORT`, `BOTS_ENABLED=false`.
- **Local:** `.env.local` / `apps/arena/.env` (gitignored). `.env.example` files list the names only.

### 2.7 Addresses & endpoints
- **Base:** `https://api.devnet.solana.com` (or `https://rpc.magicblock.app/devnet`).
- **Router:** `https://devnet-router.magicblock.app`.
- **ER:** `https://devnet-as.magicblock.app` / `wss://devnet-as.magicblock.app`. Confirm the validator identity with `getIdentity` in P2.01 (binary-prediction default: `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57`).
- **Programs:**

| Program | Address |
|---|---|
| Delegation | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` |
| Magic | `Magic11111111111111111111111111111111111111` |
| MagicContext | `MagicContext1111111111111111111111111111111` |
| Session | `KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5` |
| VRF | `Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz` |
| VRF ephemeral queue | `5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc` |
| Oracle | `PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd` |

---

## 3. Phases & tasks

### Phase 0 — Repo, hygiene, environment (target: done by 05:00 IST)
- **P0.01** `DONE` — Fund the dedicated devnet deployer `Ens1TxKQ…` (10 SOL, verified).
- **P0.02** `DONE` — Verify MongoDB Atlas reachability (ping ok; empty cluster).
- **P0.03** `DONE` — Verify Vercel + Railway CLI logins.
- **P0.04** `DONE` (P0) — Promote `rizz-club/*` (including dotfiles) to the repo root `rogs/`, then remove the empty `rizz-club/` dir.
  - *Accept:* `rogs/apps/web/package.json` exists and `rogs/rizz-club` is gone.
  - Wait until the audit agents that read `rizz-club/` paths have finished.
- **P0.05** `DONE` (P0) — `git init`, then commit the untouched original as `chore: import rizz-club baseline`.
  - The `.gitignore` must add `target/`, `test-ledger/`, `.anchor/`, `*.keypair.json`, `keys/`, `.env*` (except `.env.example`), `.vercel`, `.railway`.
  - *Accept:* `git log` shows the baseline commit and `git status` is clean.
- **P0.06** `NOT STARTED` (P0) — Rename the brand (no component deletions):
  - Root `package.json` name `rizz` → `rogs-arena`.
  - `PROGRESS_STORAGE_KEY` `rizz.progress` → no longer used after P5.
  - User-visible "Rizz"/"Rizz Club" → "Rogs Arena"; `<title>`/metadata in `app/layout.tsx`.
  - README rewrite in P9.
  - *Accept:* `grep -ri "rizz" apps packages --include=*.ts* | grep -v node_modules` returns only intentional credits.
- **P0.07** `DONE` (P0) — Create GitHub `nickthelegend/rogs-arena` **private** and push.
  - *Accept:* `gh repo view` works.
- **P0.08** `DONE` (P0) — Copy the MagicBlock skill into `rogs/.agents/skills/magicblock` so every agent can read it.
- **P0.09** `DONE` (P0) — Merge the findings of the three audit agents (web data layer, UI seam, watcher+bot) into §4 Gap register.

### Phase 1 — On-chain program + unit tests (target: 08:00 IST)
- **P1.01** `DONE` (P0) — Scaffold the Anchor workspace at the root:
  - `Anchor.toml` (`[programs.devnet] rogs_arena`, `[provider] wallet="~/.config/solana/rogs-deployer.json"`, cluster devnet).
  - Workspace `Cargo.toml` and `programs/rogs-arena/Cargo.toml` with the deps from §2.2.
  - Generate the program keypair with `anchor keys sync`.
  - *Accept:* `anchor build` compiles an empty `#[ephemeral] #[program]`.
- **P1.02** `DONE` (P0) — `state.rs`: `Arena` (zero_copy, Pod structs, explicit padding), `RoundState`, `RoundSummary`, `Player`, `Position`, constants.
  - *Accept:* size asserts in unit tests: `size_of::<Arena>() <= 10_000`, `Player::INIT_SPACE` matches.
- **P1.03** `DONE` (P0) — `math.rs`: FPMM `quote_buy`, `quote_sell` (isqrt u128), `yes_price_bps`, `resolve_split`, `settle_slot` (payout/profit/bonus), all pure functions with checked arithmetic.
- **P1.04** `DONE` (P0) — `oracle.rs`: typed `PriceUpdateV2` mirror.
  - `read_btc_price(ai, expected_key, now)` checks owner == ORACLE_PROGRAM_ID, discriminator, feed_id == key bytes, posted_slot>0, price>0, age ≤ MAX_PRICE_AGE.
  - Returns `(price i64, decimals u32, publish_time i64)`.
- **P1.05** `IN PROGRESS` (P0) — Instructions 1–10 per §2.2 with events and errors (`error.rs`).
- **P1.06** `IN PROGRESS` (P1) — `schedule_round_crank` (ScheduleCrankCpi, mirror `crank-counter/anchor`).
- **P1.07** `IN PROGRESS` (P1) — `request_cheers` + `cheers_callback` (VRF, mirror `fogduel lib.rs:679-743, 1236-1266`; ephemeral queue). Callback writes candidate Players from `remaining_accounts` safely: deserialize, mutate, `exit`.
- **P1.08** `IN PROGRESS` (P1) — `commit_arena`, `commit_player`, `undelegate_player` via `MagicIntentBundleBuilder` (deprecated free functions are forbidden).
- **P1.09** `DONE` (P0) — Rust unit tests (`cargo test -p rogs-arena`). Every assertion uses explicit numbers.
  - *Done 04:32 IST: `cargo test -p rogs-arena --lib` gives 22 passed / 0 failed. Covers FPMM vectors, 1,000 randomized solvency sequences, ability caps, the calm-pulse bpm rule, cheers, stats/badges, round alignment, and oracle decode plus rejections.*
  - FPMM: buy→sell round-trip never profits (fee>0), buy shares monotonic in amount, sell out ≤ collateral, invariant `(Y*N) >= k` after every op, zero/overflow guards.
  - Resolve/settle: collateral conservation (house_back + claims == collateral) for YES/NO/VOID across randomized sequences (deterministic seed loop, 1,000 cases).
  - Abilities: double cap at 10, protect cap at 10, calm requires bpm<120 and freshness (bpm 119 pays, 120 doesn't, stale doesn't), cheers pending only on win.
  - Stats: streak up/reset/unchanged-on-zero, day rollover resets day_trades, badges thresholds (100/5/70/20), same-side streak.
  - Oracle decode: good account, wrong disc, wrong owner, wrong key, posted_slot 0, stale, negative price.
  - Cheers selection: excludes winner, unique, ≤10, deterministic per randomness, handles <10 candidates.
  - Round alignment: `end_ts` on a 5-min boundary ≥60s away.
- **P1.10** `DONE` (P0) — `anchor build` produces IDL `target/idl/rogs_arena.json` + types. Record the `.so` size.
  - *Done 04:30 IST:* build is clean on Anchor 0.32.1 + ER SDK 0.17.0 (anchor-compat, vrf, crank) + session-keys 3.1.1. Needed `cargo update -p anchor-lang@1.2.0 --precise 0.32.1`, because session-keys had resolved to anchor-lang 1.2.0. Unit tests: 21/22 passing; the failure is a wrong hand-computed vector (P1.09).
  - *Accept:* build succeeds; `.so` < 900 KB.

### Phase 2 — Devnet deploy, bootstrap, real E2E (target: 09:30 IST)
- **P2.01** `DONE` (P0) — Confirm the ER validator identity: `curl devnet-as getIdentity`. Record it in §2.7 and `packages/arena-sdk/src/constants.ts`.
- **P2.02** `DONE` (P0) — `anchor deploy --provider.cluster devnet` with `rogs-deployer`.
  - *Done 04:33 IST: deploy tx `5vthq6k395hxPFrTg3DVrR9a28X2WKxNPbcn93k3cRJgmCJ1FMfTotSb4UaLYbXS679F6Z7HmBzRyCBp7mysdgkC`, 654,792 bytes, upgrade authority `Ens1TxKQ…`.*
  - *Accept:* `solana program show <PROGRAM_ID> --url devnet` shows authority `Ens1…`.
- **P2.03** `DONE` (P0) — Generate the operational keypairs in `~/.config/solana/rogs-{keeper,faucet}.json` and fund them from the deployer: keeper 0.5 SOL, faucet 2 SOL.
- **P2.04** `DONE` (P0) — `scripts/bootstrap-arena.ts`: `initialize_arena` (oracle 71wtT…, 300s, 200 USD liquidity, 100 bps, treasury 1,000,000 USD) → `delegate_arena` (validator from P2.01) → wait for router `isDelegated` → `roll_round` on ER (opens round 1) → `schedule_round_crank` (interval 2000ms, iterations 200,000).
  - *Done 05:12 IST: arena `ApzYL11HC9puv4dbFk1QTCrE4wpLup8ta9QE2UKde2CJ`. initialize `5rNzLixYDXJgi5jRXV9y8KrWjbu7S3ifJ2PFX3RU8VdE9cYcCj2aDxtbojAoRBgyGYkVFQpoJT74Y3jNSfZKm62K`; delegate `3zd4N4eyK9VmApBbCYmHJA3o3CEivpceVetGw7pYx6UhAYiRJALK3NB6EjYvrkSQFVkuk1kXngUxYsTWCeFVBMwh`; first roll on the ER `QNfXgdo6QLYL1MnGoGSUrFjywWpcNGUNBvXL4mkjBgNwhZX79jB2v2CWFGu64Vm9V1qabbXrbdozoEq9PRwbHaW` (strike 77,255.71); crank schedule `4sbYLjmct88x4X2LKtanBzmr2u4ZaEWfFf3myfhNsaDmqks652i9ofonSTQDHRBqPiyFag4ahNb4p5DfZk21R4Lf` (task 5441772889676668). Script: `packages/arena-sdk/scripts/bootstrap-arena.ts`.*
  - *Accept:* every signature is printed, and the Arena on ER has `current.status==1` with a strike ≈ live BTC.
- **P2.05** `IN PROGRESS` (P0) — `scripts/e2e-devnet.ts` (real, repeatable). With two fresh players funded by the deployer:
  - *Running `packages/arena-sdk/scripts/e2e-devnet.ts`, which writes docs/E2E-RUN.md.*
  1. init+delegate, then `createSessionV2`.
  2. `claim_chips` for both.
  3. P1 buys YES $5 with Calm; P2 buys NO $5 with Cheers.
  4. `report_heart(80)` for P1.
  5. `sell` part of P2.
  6. Wait for the crank roll; assert `last_roll_ts` changed **without** the keeper.
  7. `settle_player` both; assert balances/stats/bonuses by exact math using `packages/arena-sdk` math.
  8. If a Cheers win happened, `request_cheers` and wait for the callback event.
  9. `commit_arena` and read the base-layer Arena bytes updated.
  - Writes `docs/E2E-RUN.md` with signatures and explorer links.
- **P2.06** `NOT STARTED` (P1) — `tests/rogs-arena.ts` (anchor test against a local validator) for base-only paths: initialize, init_player, delegate account-owner change, access control (non-owner buy rejected, wrong session authority rejected).

### Phase 3 — `packages/arena-sdk` (target: 09:00 IST, can overlap with Phase 2)
- **P3.01** `DONE` (P0) — Package scaffold (`@rogs/arena-sdk`, TS source exports). Deps: `@coral-xyz/anchor@0.32.1`, `@solana/web3.js@^1.98`, `@magicblock-labs/ephemeral-rollups-sdk@0.17.0`, `@magicblock-labs/gum-sdk@^3.0.10`, `bn.js`.
- **P3.02** `DONE` (P0) — `constants.ts`, `pda.ts` (arena, player, sessionTokenV2), `idl.ts` (copy of the IDL + types).
- **P3.03** `DONE` (P0) — `oracle.ts`: `decodePriceUpdate(buf)` → `{price, decimals, publishTime, postedSlot}`; `subscribeBtcPrice(conn, cb)`.
- **P3.04** `DONE` (P0) — `accounts.ts`: decode the zero-copy Arena with the Anchor coder; Player fetch/subscribe; the `ArenaMarket` adapter used by `use-current-market`.
- **P3.05** `DONE` (P0) — `math.ts`: TS mirror of the FPMM + settlement. Unit tests (`bun test`) cross-check fixed vectors emitted by the Rust tests.
- **P3.06** `DONE` (P0) — `tx.ts`: builders and senders.
  - Builders: `initAndDelegatePlayer`, `createSession`, `claimChips`, `buy`, `sell`, `settlePlayer`, `reportHeart`, `requestCheers`, `rollRound`, `commitArena`.
  - `sendErTx` uses an ER blockhash and confirms; on error it fetches logs and surfaces the AnchorError message (pattern `binaryPrediction.ts:384-459`).
  - `getDelegationStatus` goes through the router.
- **P3.07** `DONE` (P0) — `events.ts`: `parseArenaEvents(logs)` via the Anchor `EventParser`.
  - *Done 05:05 IST: `packages/arena-sdk` passes 12 bun tests. They cover math vectors identical to Rust, PDAs, oracle decode plus a live BTC/USD read from devnet-as, zero-copy Arena/Player decode, event parsing, and error decoding. `tsc --noEmit` is clean. Gum `createSessionV2` is built from the bundled gpl_session IDL with Anchor 0.32.*

### Phase 4 — Railway service `apps/arena` (target: 11:00 IST)
- **P4.01** `IN PROGRESS` (P0) — Scaffold the Bun app (`@apps/arena`).
  - `src/env.ts` (zod; fail fast on missing vars).
  - `src/db.ts` (MongoClient singleton, collections, `createIndexes` at boot).
  - `railway.json` (RAILPACK, start `bun run --filter @apps/arena start`, healthcheck `/health`).
- **P4.02** `NOT STARTED` (P0) — `src/indexer.ts`: ER `onLogs` → parse → upsert `trades/rounds/settlements/cheers` → broadcast. Backfill from `getSignaturesForAddress` on boot (last 1,000). Idempotent on `sig`.
- **P4.03** `NOT STARTED` (P0) — `src/keeper.ts`: the watchdog roll, post-roll `settle_player` fan-out, `request_cheers`, crank health check + re-schedule, `commit_arena` every 12 rounds (P1). Every action is logged with its signature.
- **P4.04** `NOT STARTED` (P0) — `src/realtime.ts`: `Bun.serve` websocket.
  - Presence map with a 15s heartbeat and 45s TTL (same constants as `packages/shared/src/firebase-path.ts`).
  - Chat persisted to Mongo (auth token required, 280 chars, 1 msg/sec rate limit).
  - Heart broadcast.
  - Snapshot on connect.
- **P4.05** `NOT STARTED` (P0) — `src/http.ts`: the routes from §2.4, CORS (`CORS_ORIGIN` list), JSON errors with an `error` string (no stack traces).
- **P4.06** `NOT STARTED` (P0) — Auth: `POST /api/auth/nonce{wallet}` → nonce saved with a 5-minute TTL. `POST /api/auth/verify{wallet, signature}` checks ed25519 (tweetnacl) and returns a 24h token.
- **P4.07** `NOT STARTED` (P0) — Faucet: `POST /api/faucet` (auth) sends 0.02 devnet SOL from `FAUCET_SECRET_KEY` if the wallet balance is <0.01 SOL. Limits: 1 per wallet per 24h, 5 per IP per 24h (Mongo). Returns the signature.
- **P4.08** `NOT STARTED` (P0) — Tests (`bun test`): auth verify with a real ed25519 keypair, rate limiter with real Mongo (test DB `rogs_arena_test`, dropped after), event parser on real devnet logs captured in P2.05.
- **P4.09** `NOT STARTED` (P2) — Bots: `BOTS_ENABLED` with N keypairs funded by the faucet wallet; real ER trades every 20–60s; `users.isBot=true`.

### Phase 5 — Web backend swap, keep every component (target: 13:00 IST)
- **P5.01** `IN PROGRESS` (P0) — Dependencies:
  - Remove `@privy-io/*`, `wagmi`, `viem`, `@somnia-chain/markets-sdk`, `firebase`, `drizzle-orm`, `drizzle-zod`, `drizzle-kit`, `postgres`.
  - Add `@solana/web3.js`, `@solana/wallet-adapter-{base,react,react-ui,wallets}`, `@rogs/arena-sdk`, `bs58`, `tweetnacl`, `buffer`.
  - Delete `db/`, `drizzle/`, `drizzle.config.ts`, `lib/{privy,wagmi,viem,firebase,dreamdex,admin-tusdc}.ts`, `app/api/**`, `services/**` (backend only).
- **P5.02** `NOT STARTED` (P0) — `env.ts` → the new client vars (§2.6). No import-time service construction (fixes G-04).
- **P5.03** `NOT STARTED` (P0) — `components/providers.tsx`:
  - Wallet providers (devnet), a **guest wallet** adapter (Keypair in localStorage key `rogs.guest`, labeled "Guest wallet (devnet)").
  - `ArenaProvider` holds base/ER connections, the session key manager and the Railway auth token.
  - Keep `QueryClientProvider` and `CurrentMarketProvider`.
- **P5.04** `NOT STARTED` (P0) — `hooks/use-current-market.ts` backed by the Arena subscription. Keep the exported API and `TARGET_MARKET_INTERVAL_SECONDS`.
- **P5.05** `NOT STARTED` (P0) — `hooks/use-trade-setup.ts` + `lib/trade-setup.ts`: the Solana setup steps with the same step UI states. Each step is idempotent: skip when the account exists, is delegated, the session is valid, or the player has joined.
- **P5.06** `NOT STARTED` (P0) — `hooks/use-trading.ts`:
  - Same return keys. `placeTrade(outcome, side, amount, abilityId)` maps `abilityId` 1..4 to on-chain kinds.
  - `takeProfit` sells.
  - `claimRewards` calls `settle_player`.
  - Status messages from real results, including the ability settlement message from the `PositionSettled` event.
- **P5.07** `NOT STARTED` (P0) — `lib/trading.ts`: replace the Somnia `UnifiedMarket` helpers with the `ArenaMarket` equivalents (keep the function names components use). Update `lib/__tests__/trading.test.ts` accordingly.
- **P5.08** `NOT STARTED` (P0) — BTC chart (`features/chart-btc`, `lib/btc.ts`) from the oracle subscription. Market chart and trades (`use-market-trades/timeseries/history/closes`) from the Railway API + WS.
- **P5.09** `NOT STARTED` (P0) — Traders/presence/heart (`use-traders`, `lib/traders.ts`, `use-heart-rate`) via WS, plus the on-chain `report_heart` throttle (≥5s, only while bpm is live).
- **P5.10** `NOT STARTED` (P0) — Leaderboard (`use-leaderboard`, `lib/leaderboard.ts`) from `/api/leaderboard`. Chat (`use-chat`) from WS/API with wallet-signed auth.
- **P5.11** `NOT STARTED` (P0) — Progress (`use-progress`, `lib/progress.ts`) from Player on-chain stats, keeping `PROGRESS_TRACKS` and `progressTracks()`.
- **P5.12** `NOT STARTED` (P0) — Users and display names (`use-users`, `use-display-name`) from `/api/profile`.
- **P5.13** `NOT STARTED` (P0) — Copy: Somnia/dreamDEX/STT/tUSDC/0x formatting → Solana/devnet/chips/base58 short keys. Explorer links use `https://explorer.solana.com/tx/<sig>?cluster=devnet`; ER txs use the MagicBlock explorer (`?cluster=custom&customUrl=https://devnet-as.magicblock.app`).
- **P5.14** `NOT STARTED` (P1) — New route `/proof`, added without touching existing components. Shows router delegation status for Arena/Player, the latest ER vs base latency sample, the last crank roll (ts, sig), the last VRF cheers (randomness, recipients), the last commit sig with a base explorer link, oracle price + publish-time age, and the program id/explorer.
- **P5.16** `NOT STARTED` (P0) — `features/status/index.tsx`: replace the hard-coded "Stable 57 MS | 50 FPS" (G-44) with a real rolling ER round-trip measured from the latest confirmed ER transactions or `getSlot` pings, plus a real `requestAnimationFrame` FPS. Keep the same markup.
- **P5.17** `NOT STARTED` (P1) — `lib/format.ts`: format timestamps in the viewer's local timezone instead of the fixed GMT+7 (G-45). Update `lib/__tests__/format.test.ts`.
- **P5.18** `NOT STARTED` (P0) — `lib/preload.ts` and `components/preload-gate.tsx`: preload from the Railway `/api/arena` snapshot and the first WS `snapshot`, drop the Firebase one-off gets, and remove the `/preload` special case (G-53).
- **P5.15** `NOT STARTED` (P0) — Tests updated and green: `bun test` in apps/web. `next build` succeeds with only the §2.6 vars; `tsc --noEmit` is clean (`next-env.d.ts` generated).

### Phase 6 — Deploy & wire (target: 14:00 IST)
- **P6.01** `NOT STARTED` (P0) — Railway: `railway init` project `rogs-arena` → service `arena` → set §2.6 vars (Mongo URI from the owner's message, keypairs from `~/.config/solana/rogs-*.json`) → `railway up` → generate domain.
  - *Accept:* `GET https://<domain>/health` returns `{ok:true, mongo:true, er:true, arena:{roundId}}`.
- **P6.02** `NOT STARTED` (P0) — Atlas network access: confirm Railway can connect (the health `mongo:true`). If it's blocked → `BLOCKED` (the owner must add 0.0.0.0/0 in Atlas; no API key available).
- **P6.03** `NOT STARTED` (P0) — Vercel: `vercel link` (project `rogs-arena`, root `apps/web`) → env vars → `vercel --prod`.
  - *Accept:* the production URL loads with zero console errors.
- **P6.04** `NOT STARTED` (P0) — Set CORS on Railway to the Vercel domain(s). Point the WS URL to `wss://<railway-domain>/ws`.
- **P6.05** `NOT STARTED` (P1) — Push to GitHub with a README deploy section; tag `blitz-v8-submission`.

### Phase 7 — Verification (target: 16:00 IST)
- **P7.01** `NOT STARTED` (P0) — `docs/TEST-PLAN.md`: every page, component, API route, instruction and flow, including edge cases (no wallet, rejected signature, insufficient chips, trading lock in the last 5s, stale oracle, double-click buy, refresh mid-trade, WS disconnect, expired session, Railway down). Each item states its exact expected result.
- **P7.02** `NOT STARTED` (P0) — Execute against production (Vercel + Railway + devnet) in the browser (Claude in Chrome / in-app browser). Record PASS/FAIL, console and network state per item.
- **P7.03** `NOT STARTED` (P0) — Fix every FAIL at the root cause, re-run that item, then re-run the whole plan top to bottom.
- **P7.04** `NOT STARTED` (P0) — Re-run `scripts/e2e-devnet.ts` against production config; attach the signatures.

### Phase 8 — Audits, judging, completion % (target: 17:00 IST)
- **P8.01** `NOT STARTED` (P1) — `docs/MAGICBLOCK-AUDIT.md`: every MagicBlock touchpoint classified GENUINELY USED / IMPORTED BUT UNUSED / FAKED / MISSING, with file:line and a live proof (signature or request). Plus **50 ranked feature ideas** (capability, depth, why a judge notices).
- **P8.02** `NOT STARTED` (P1) — `docs/JUDGE-REPORT.md`: skeptical 5-minute judge pass against the live app. Scores per criterion, dealbreakers/deductions/polish, the single biggest blocker, place-or-cut verdict.
- **P8.03** `NOT STARTED` (P1) — Fix the judge's dealbreakers and deductions, then re-verify.
- **P8.04** `NOT STARTED` (P1) — `docs/COMPLETION.md`: a checklist built from §1.1 with verified status → percentage before and after fixes.

### Phase 9 — Submission package (target: 17:30 IST; owner submits by 18:00)
- **P9.01** `NOT STARTED` (P0) — README rewrite: pitch, architecture diagram, MagicBlock map, how to run, deployed addresses, honest limitations.
- **P9.02** `NOT STARTED` (P0) — `SUBMISSION.md` with every form field prefilled: program id + explorer link, Vercel URL, repo URL, categories, description.
- **P9.03** `NOT STARTED` (P1) — Demo script in `docs/DEMO.md`: 90-second path and shot list. Recording needs the owner's screen; the owner records if the automated capture isn't acceptable.

---

## 4. Gap register (every gap → the task that closes it)

| ID | Gap (evidence) | Severity | Closed by |
|---|---|---|---|
| G-01 | All trading is Somnia dreamDEX order-book calls signed server-side via Privy: `apps/web/app/api/trading/position/route.ts:1-579` | dealbreaker | P1.05, P3.06, P5.06 |
| G-02 | Current market comes from the Somnia indexer (`createDreamDexExchange().loadMarkets`): `hooks/use-current-market.ts:81-130` | dealbreaker | P5.04 |
| G-03 | Auth/wallet is Privy-only (`usePrivy`, `getAccessToken`, `tradeWallet`): `hooks/use-trading.ts:30-82`, `lib/privy.ts`, `app/api/privy-auth.ts`, `env.ts:6-18`. **No Privy credentials exist**, so replace rather than reuse | dealbreaker | P5.02, P5.03, P5.05 |
| G-04 | `next build` fails without Privy env because `lib/privy.ts:4` builds the client at import (baseline log) | dealbreaker | P5.01, P5.02 |
| G-05 | Postgres/Supabase via Drizzle: `db/schema.ts:4-98`, `db/index.ts`, `drizzle.config.ts:8`, `DATABASE_URL`. No credentials | dealbreaker | P4.01, P5.01, P5.12 |
| G-06 | Firebase RTDB for traders/closes/chat: `lib/firebase.ts`, `packages/shared/src/firebase-path.ts:3-24`, `NEXT_PUBLIC_FIREBASE_*`. No credentials | dealbreaker | P4.04, P5.08–P5.10 |
| G-07 | Ability payouts are EVM transfers from an admin key off-chain: `services/ability-settle.ts:71-104`, `lib/admin-tusdc.ts`, `SOMNIA_PRIVATE_KEY` | major | P1.05 (treasury bonuses), P5.06 |
| G-08 | Cheers recipients are picked with `Math.random` on the server from Firebase traders: `lib/ability-payout.ts:73-100`, `services/ability-settle.ts:61-69,84` | major | P1.07 (MagicBlock VRF) |
| G-09 | Calm pulse / Steal Heart pays $10 on any win and never checks bpm<120, contradicting README.md:55: `lib/ability-payout.ts:61` | major | P1.03, P1.05 |
| G-10 | Progress/badges exist only in localStorage (per-browser, trivially forgeable): `lib/progress.ts:1,157-197` | major | P1.05 stats, P5.11 |
| G-11 | README badge thresholds (10 each) don't match code (100/5/70/20): `README.md:31-34` vs `lib/progress.ts:36-41` | minor | P9.01 |
| G-12 | Errors silently swallowed: `hooks/use-trading.ts:170` (`.catch(() => {})`), `:191`; ability apply failures ignored `position/route.ts:298-300` | major | P5.06 (surface errors) |
| G-13 | Debug timing payloads and verbose console logs returned to clients: `position/route.ts:46-95,321,540` | minor | P5.01 (route removed) |
| G-14 | Cheers payout dedupe keyed by the string `to:amount`, so repeated cheers to the same recipient are skipped: `services/ability-settle.ts:74-90` | major | P1.07 idempotent on-chain state |
| G-15 | `apps/bot` simulates activity with canned chat lines ("this open is fake", "classic fake break") and scripted trades: `apps/bot/src/chat.ts:46,97,195`, `apps/bot/src/trade.ts:40`, `apps/bot/index.ts:57-66` | major (fakery risk) | P4.09 (real, labeled) or removal |
| G-16 | `apps/watcher` is Somnia-only (markets-sdk → Firebase publisher): `apps/watcher/src/**` | major | P4.02 replaces it |
| G-17 | Type errors: `features/dynamic-island/pane-trading-zone.tsx:15-16`, `features/leaderboard/leaderboard-row.tsx:15-16` (png modules), `apps/bot/src/trade/__tests__/batch.test.ts:7`, `apps/watcher/tsconfig.json:31` (TS7 baseUrl) | minor | P5.15; watcher/bot removed |
| G-18 | No git history in the imported copy | minor | P0.05 |
| G-19 | Zero Solana/MagicBlock code anywhere (no program, no ER, no session keys) | dealbreaker | Phases 1–3 |
| G-20 | Brand leftovers: root package name `rizz` (`package.json:2`), storage key `rizz.progress` (`lib/progress.ts:1`), UI strings | minor | P0.06 |
| G-21 | `docs/somnia-market-history-data.md` is obsolete Somnia research | minor | P9.01 (remove/replace) |
| G-22 | EVM-specific validation: `market_id` must match `^0x…64hex` (`position/route.ts:36`); viem `isAddress` checks (`ability-settle.ts:64,76,86`) | major | P5.01 (routes removed), P3.02 (base58) |
| G-23 | Grep hits: `components/section-history.tsx:24,74,81,90,108,226,233` (`stub` = a 28px path connector length; layout constant, not a stub implementation → verify rendering only); `components/section-chat.tsx:214` (placeholder copy "Sign in to chat" → wallet wording); `apps/watcher/src/load/__tests__/publisher.test.ts:53-234` (`createFakeClock` test double for the Firebase publisher → removed with watcher); `apps/bot/*` simulate* (G-15) | minor | P5.10, P4.02, P4.09 |
| G-24 | Rewards claim scans Somnia markets and redeems via SDK: `app/api/trading/rewards/route.ts` | major | P1.05 `settle_player`, P5.06 |
| G-25 | Faucet mints tUSDC / sends STT from an admin EVM key: `app/api/faucet/route.ts`, `lib/admin-tusdc.ts` | major | P4.07 (devnet SOL), P1.05 `claim_chips` |
| G-26 | `applyParkedAbility` invents the stake (`Math.min(shares, 5)`): `services/ability-settle.ts:181` | major | on-chain cost basis (P1.03) |
| G-27 | Settlement falls back to a share-based estimate when the indexer lags: `services/ability-settle.ts:221-226` | major | exact on-chain settlement (P1.05) |
| G-28 | Every env credential except Mongo is absent (Privy, Supabase, Firebase, WalletConnect, Somnia) | dealbreaker | whole migration; nothing depends on them afterwards |
| G-29 | Deploy config targets bot/watcher/web services on Railway; `scripts/railway-build.ts` hard-codes them; no Vercel config | major | P4.01, P6.01, P6.03 |
| G-30 | Positions are only valid for the live market; closing positions and ability plays rely on DB rows (`services/ability-plays.ts`) rather than chain state | major | P1.05 Player.positions |
| G-31 | Faucet API has no auth or rate limit, and the caller picks the amount, which drains the admin key: `api/faucet/route.ts:32-173`, `api/wallet/route.ts:3` | major (security) | P4.07 |
| G-32 | **Abilities can be attached after the result is known.** The parked-card flow POSTs market+ability at round end and it settles instantly: `features/dynamic-island/index.tsx:70-110`, `api/abilities/settle/route.ts:31-40`, `services/ability-settle.ts:150-190` | dealbreaker (exploit) | P1.05 `attach_ability` allowed only before the trade lock |
| G-33 | Unlimited ability cards: the rack resets on reload and there's no server inventory: `components/ability-provider.tsx:67` | major | P1.05 (one ability per position, enforced on-chain) |
| G-34 | No unique constraint on ability plays, and a play in `settling` can be claimed again, so concurrent double payouts are possible: `services/ability-plays.ts:66-97`, `drizzle/0000_chief_bruce_banner.sql:67` | major | on-chain state (P1.05) |
| G-35 | A partial payout failure re-pays on retry, and Cheers recipients are re-randomized per retry: `services/ability-settle.ts:84,97-103,136-139` | major | P1.07 |
| G-36 | Two `useTrading` instances race their settle calls: `features/dynamic-island/index.tsx:117`, `features/dynamic-island/pane-trading-zone.tsx:45-60`, `hooks/use-trading.ts:175-196` | major | P5.06 (single ArenaProvider source; settle idempotent on-chain) |
| G-37 | Firebase is writable by anyone, so chat, traders, market, trades and closes are spoofable, and Cheers pays addresses read from that data: `hooks/use-chat.ts:38-63`, `hooks/use-traders.ts:65-81` | major (security) | P4.04 + P4.06 (wallet-signed auth), P1.07 (candidates from on-chain `recent`) |
| G-38 | `hooks/use-users.ts:7` calls `/api/users`, which doesn't exist | broken | P5.12 |
| G-39 | `closes` is written only by bots, so real users' take-profit exits never appear: `hooks/use-market-closes.ts:21-41`, `apps/bot/src/trade.ts:156` | broken | P4.02 (closes from on-chain sell events with realized PnL) |
| G-40 | A partial sell settles the whole ability play on estimated proceeds: `services/ability-settle.ts:192-207`, `app/api/trading/position/route.ts:488-492` | major | P1.03 exact position accounting |
| G-41 | External-wallet logins produce no signable wallet, and the presence/chat address can differ from the trading wallet: `lib/trade-setup.ts:101-111,288-289`, `hooks/use-traders.ts:41`, `lib/traders.ts:149` | broken | P5.03/P5.05 (one wallet identity) |
| G-42 | Serverless-unsafe in-memory caches and long sequential tx loops: `app/api/privy-auth.ts:18`, `lib/dreamdex.ts:26-27`, `app/api/trading/rewards/route.ts:106-157` | major | P5.01 (routes removed) |
| G-43 | Whole-node Firebase subscriptions, and `closes` grows forever: `hooks/use-market-timeseries.ts:39-48`, `hooks/use-market-trades.ts:21-31` | major | P4.02/P5.08 (per-round queries) |
| G-44 | **Fake status readout**, a hard-coded "Stable 57 MS \| 50 FPS": `features/status/index.tsx:18` | major (fakery a judge spots) | P5.16 (measured ER latency + real FPS) |
| G-45 | Timestamps are locked to GMT+7: `lib/format.ts:32-46` | minor | P5.17 |
| G-46 | The BTC price and the tab title use Somnia SDK React hooks inside components: `features/chart-btc/index.tsx:18-34,114-121`, `components/live-tabname.tsx:9-25` | dealbreaker | P5.08 (swap only the hook source) |
| G-47 | Dead code: `services/users.ts`, the unused auth tables, `hooks/use-users.ts`, `components/cta-btn-group.tsx` (with `console.log` :28-33), `api/wallet*`, `lib/wagmi.ts`, the analytics export `lib/firebase.ts:18`, the WalletConnect env var, the `drizzle-zod` dep, and `public/frames/change-name.ts` (a Node script served publicly) | minor | P5.01 (remove backend dead code and the public Node script; UI components stay) |
| G-48 | Swallowed errors: `services/ability-settle.ts:65-68,165,184-186,221-223`, `app/api/trading/rewards/route.ts:159`, `hooks/use-current-market.ts:115-116`, `hooks/use-market-history.ts:45-47`, `features/dynamic-island/index.tsx:100-102` | major | P5.04, P5.06, P5.08 |
| G-49 | Mismatched defaults: slippage is 5% on the client but 2% on the server (`lib/trading.ts:5-6` vs `position/route.ts:42`), and the faucet amounts differ between client and server (`api/faucet/route.ts:15-18` vs `lib/trade-setup.ts:5-8`) | minor | P5.06 (min_shares from the on-chain quote at 5% slippage) |
| G-50 | Card names in code (`lib/ability.ts:28-33`: Double price, Protect loss, Calm pulse, Cheers) differ from the README (Double Profit, Protect Fund, Steal Heart, Cheers) | minor | P9.01 |
| G-51 | Video assets are hot-linked from i.pinimg.com: `features/dynamic-island/index.tsx:215`, `features/dynamic-island/pane-trading-zone.tsx:487` | minor | P7 verify; self-host if they fail |
| G-52 | The watcher's default interval is 15m, not 5m, and it publishes from inside the ink UI component: `apps/watcher/src/config.ts:19`, `apps/watcher/src/ui/dashboard.tsx:54` | minor | Phase 4 replaces the watcher |
| G-53 | `components/preload-gate.tsx:47` special-cases a `/preload` route that doesn't exist; preload does one-off Firebase gets (`lib/preload.ts:9`) | minor | P5.18 (preload from the Railway snapshot) |
| G-54 | The leaderboard is computed entirely client-side from spoofable Firebase data: `hooks/use-leaderboard.ts:21-51`, `lib/leaderboard.ts:210-324` | major | P4.02/P5.10 (inputs from indexed on-chain events; `lib/leaderboard.ts` math kept) |
| G-55 | Display names exist only in localStorage: `lib/display-name.ts:61-78` | minor | P5.12 (profile API) |
| G-56 | Wallet addresses are lowercased all over the code, which corrupts case-sensitive base58 keys: `packages/shared/src/firebase-path.ts:19,23`, `lib/display-name.ts:39,58,66`, `lib/leaderboard.ts:220,263`, `hooks/use-market-closes.ts:30`, `lib/market-closes.ts:40`, `components/section-chat.tsx:41-42`, `lib/ability-payout.ts:79,84`, `lib/avatar.ts:6`, `hooks/use-current-market.ts:64` | dealbreaker | P5 web agent C1 item 7 |
| G-57 | Every client trims chat to the newest 50 by deleting the oldest messages, including other people's: `hooks/use-chat.ts:38-50`, `apps/bot/src/chat.ts:175-187` | major | P4.04 (server-side cap), P5.10 |
| G-58 | `bpm &&` renders a stray "0" when bpm is 0: `features/dynamic-island/pane-trading-zone.tsx:112` | minor | P5 web agent C1 item 10 |
| G-59 | No maximum trade amount or balance check before trading: `features/dynamic-island/pane-trading-zone.tsx:97-99` | major | on-chain MIN/MAX_TRADE + InsufficientBalance (P1.05); UI surfaces the error (P5.06) |
| G-60 | Badges ignore wins held to expiry, and a break-even take-profit counts as a win: `hooks/use-trading.ts:296-303` | major | on-chain stats in settle (P1.03), P5.11 |
| G-61 | Faucet buttons render before balances load; SDK clients are never closed (`components/live-tabname.tsx:20`, `features/chart-btc/index.tsx:115`); the leaderboard shows 0 PnL while prices load (`lib/leaderboard.ts:165`) | minor | P5.05, P5.08, P5.10 |
| G-62 | About page shows template text and a hard-coded version: `features/about/index.tsx:20,26`; `components/inventory.tsx` is dead and references images that don't exist | minor | P5.13 |
| G-63 | The display font is "ABC Gravity Trial", a trial license: `app/layout.tsx:8-11`, `styles/globals.css:17` | minor (legal) | P9.01 note; owner decision |
| G-64 | Watcher crash on an unhandled flush rejection, wrong bot close records, bots trimming real users' chat, and plaintext EVM keys in `apps/bot/.env`: all Somnia-only apps | closed by removal | apps/bot + apps/watcher removed 2026-09-13; replaced by apps/arena (Phase 4) |

---

## 5. Risks & honest fallbacks (none of these are mocks)
- **Crank flakiness on devnet** → the Railway keeper watchdog calls the same permissionless `roll_round`. Both paths are real; /proof shows which one rolled.
- **Oracle stale >30s** → `roll_round` errors (no stale settle); the UI shows "oracle stale, round paused". Retry automatically.
- **VRF callback delay** → the UI shows "Cheers pending (VRF)" until `CheersPaid`; the keeper retries `request_cheers` after 60s.
- **Commit quota** (10 plain commits per delegation) → commit the Arena every 12 rounds and track the count. If the quota is hit, the task is marked `BLOCKED` with the exact error, and the next approach is fee-vault wiring per `fees-and-commit-economics.md`.
- **Atlas IP allowlist** → a genuine owner-only setting. Mark it `BLOCKED` with the exact error if Railway cannot connect.
- **Demo recording** → needs the owner's screen/mic if automated capture isn't acceptable.
- **Lessons from the sibling projects** (reuse-map agent):
  - Call `exit(&crate::ID)` before commit/undelegate CPIs, or `ExternalAccountDataModified` follows.
  - A non-delegated wallet can't be a writable/rent payer on the ER.
  - `confirmTransaction` resolves for failed transactions too; always check `value.err` and poll `getTransaction` on the ER.
  - Never reuse a base blockhash on the ER.
  - `ephemeral-vrf-sdk` 0.17 has `create_request_randomness_ix` (the scoped variant is gone); `invoke_signed_vrf` scopes it.
  - Importing the ER TS SDK root can pull wasm into the Next bundle; import subpaths or configure webpack (`magicblock-v8/app/src/lib/magicblock.ts:1-9`, `next.config.mjs:16-40`).
  - After a program upgrade an ER may keep serving the old bytecode; re-verify behavior on the ER after every deploy.

## 6. Completion checklist (feeds docs/COMPLETION.md)
Items C-01…C-20 map 1:1 to §1.1 points 1–10, split into verifiable checks: wallet/guest entry, delegation, session, chips, round crank, oracle strike/close, buy, sell, settle, 4 abilities (4 checks), heart on-chain, progression on-chain, chart/leaderboard/chat/presence, indexer persistence, commit to base, deploys (3), tests (unit + e2e + browser).
