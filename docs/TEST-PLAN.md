# Rogs Arena — Test Plan (zero tolerance)

The checklist every verification run is measured against. **PASS** means the real result matches the
"Correct means" column *exactly*, on the real deployment, with **zero console errors and zero failed
network requests** for UI items. Anything else is **FAIL**. Items that need a dependency we don't have
are **UNTESTABLE** with the exact reason. Nothing is marked PASS by analogy.

Environments:
- **Chain:** Solana devnet + MagicBlock devnet-as ER. Program `J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q`, arena PDA `ApzYL11HC9puv4dbFk1QTCrE4wpLup8ta9QE2UKde2CJ`.
- **Backend:** Railway `https://arena-production-0bdd.up.railway.app` (MongoDB Atlas DB `rogs_arena`).
- **Frontend:** Vercel project `rogs-arena` (production URL filled in on first deploy).
- **Browser:** Claude in Chrome (real Chrome). Console + network are checked on every UI item.

Methods: **B** = real browser against the deployed app. **S** = real signed devnet transactions from
`packages/arena-sdk/scripts/*` (for program paths the UI deliberately never exposes). **H** = real HTTP/WS
request against the deployed service, observed in the browser network tab or from a script.

Status legend: `NOT RUN` · `PASS` · `FAIL` · `UNTESTABLE (reason)`.

---

## 1. On-chain program (MagicBlock ER + Solana)

| ID | Item | Method | Steps | Correct means | Status |
|---|---|---|---|---|---|
| CH-01 | Program deployed | S | `solana program show J83q…` on devnet | Upgradeable program, 654,792 bytes, authority `Ens1TxKQ…` | NOT RUN |
| CH-02 | Arena delegated | S | Read the arena account on base and ER | Base owner = `DELeGG…`; ER owner = program; router `getDelegationStatus` isDelegated=true | NOT RUN |
| CH-03 | Crank rolls rounds without a keeper | S | `watch-crank.ts` with keeper disabled | `current.id` increments and `last_roll_ts - previous end_ts ≤ 5s`; outcome is YES iff close ≥ strike | NOT RUN |
| CH-04 | Strike and close come from the MagicBlock oracle | S | Compare `RoundOpened.strike_price` / `RoundResolved.close_price` with the BTC/USD feed `71wtT…` at roll time | Both equal the feed's `price` at a `publish_time` within 10s of `last_roll_ts` | NOT RUN |
| CH-05 | init_player + delegate_player | S+B | Fresh wallet → setup | Player PDA exists, base owner `DELeGG…`, visible on the ER with owner = program | NOT RUN |
| CH-06 | Session key (Gum V2) authorises ER actions | S+B | `createSessionV2`, then `claim_chips` signed only by the session key | Tx succeeds on the ER; the session token PDA `["session_token_v2", program, signer, authority]` exists on base | NOT RUN |
| CH-07 | Wrong session / non-owner rejected | S | Session key of wallet A signs `buy` for wallet B's player; random key with no token signs `buy` | Both fail: `InvalidToken` / `Unauthorized`; balances unchanged | NOT RUN |
| CH-08 | claim_chips first join | S+B | New player claims | Balance = 250.000000; `joined=true`; `ChipsClaimed{first:true}` | NOT RUN |
| CH-09 | claim_chips faucet guard | S | Claim again immediately | Fails `FaucetCooldown` (or `FaucetBalanceTooHigh`); balance unchanged | NOT RUN |
| CH-10 | buy happy path | S+B | Buy YES $5 | Balance −5; shares = SDK `quoteBuy` exactly; `TradeExecuted` side 0; yes_price moves up | NOT RUN |
| CH-11 | buy limits | S | amount 0.5 USD; 101 USD; > balance | `AmountTooSmall`; `AmountTooLarge`; `InsufficientBalance` | NOT RUN |
| CH-12 | buy slippage | S | `min_shares = quote + 1` | `SlippageExceeded`; no state change | NOT RUN |
| CH-13 | trading lock | S | Buy in the last 5s of a round | `TradingLocked` | NOT RUN |
| CH-14 | sell happy path | S+B | Sell half of a position | Balance + `quoteSell.out`; shares reduced; `TradeExecuted` side 1 with `realized_pnl` | NOT RUN |
| CH-15 | sell more than held | S | Sell held+1 | `NothingToSell` | NOT RUN |
| CH-16 | attach_ability rules | S+B | Attach before lock; second card; after a sell; within 30s of end | First OK (`AbilityAttached`); others `AbilityAlreadySet` / `TradingLocked` | NOT RUN |
| CH-17 | report_heart | S | bpm 80 → OK; bpm 20 → fail | `heart_bpm=80` and the active position's `max_bpm` updated; bpm 20 fails `InvalidHeartRate` | NOT RUN |
| CH-18 | Settlement math | S | Settle after resolution | balance delta = payout + bonus from SDK `settleSlot`; slot cleared; wins/losses/streak updated | NOT RUN |
| CH-19 | Double / Protect / Calm bonuses | S | Positions with each card | Double = min(profit,10); Protect = min(loss,10); Calm = 10 only if max_bpm<120 with samples | NOT RUN |
| CH-20 | Cheers via VRF | S | `e2e-cheers-vrf.ts` | `cheers_pending=1` after settle; `request_cheers` succeeds; callback pays each candidate exactly 1.000000; `CheersPaid` includes the randomness | NOT RUN |
| CH-21 | settle idempotent | S | `settle_player` twice | Second call succeeds with no balance change and no event | NOT RUN |
| CH-22 | commit_player / commit_arena | S | Commit, then read base | Base data equals ER state (trades, balance / round, commits) while still delegated | NOT RUN |
| CH-23 | Authority-only instructions | S | `fund_treasury` / `commit_arena` signed by a random key | `Unauthorized` | NOT RUN |
| CH-24 | Rust unit tests | S | `cargo test -p rogs-arena --lib` | 22 passed, 0 failed | NOT RUN |
| CH-25 | SDK tests | S | `bun test` in packages/arena-sdk | All pass, including the live oracle read | NOT RUN |

## 2. Arena service HTTP API (Railway)

| ID | Endpoint / case | Method | Correct means | Status |
|---|---|---|---|---|
| API-01 | `GET /health` | H | 200 `{ok:true, mongo:true, er:true, programId:"J83q…", arena:{roundId>0,status:1}}` | NOT RUN |
| API-02 | `GET /api/arena` | H | 200 ArenaSnapshot; `round.roundId` equals the ER arena `current.id`; all arrays present | NOT RUN |
| API-03 | `GET /api/rounds?limit=5` | H | ≤5 rounds newest first; each resolved one has outcome YES/NO matching the on-chain history | NOT RUN |
| API-04 | `GET /api/trades?roundId=<n>` | H | Every `TradeExecuted` of that round; `sig` resolvable on the ER; amounts in USD | NOT RUN |
| API-05 | `GET /api/points`, `/api/closes`, `/api/settlements`, `/api/cheers` | H | Shapes per docs/ARENA-API.md; data matches on-chain events | NOT RUN |
| API-06 | `GET /api/chat?limit=50` | H | Ascending, ≤50, persisted across a service restart | NOT RUN |
| API-07 | `POST /api/auth/nonce` bad wallet | H | 400 `{error}` | NOT RUN |
| API-08 | auth verify: good signature / bad signature / reused nonce | H | token / 401 / 401 | NOT RUN |
| API-09 | `POST /api/profile` without token; invalid name; valid | H | 401; 400; 200 ProfileDto, then `GET /api/profile/:wallet` returns it | NOT RUN |
| API-10 | `POST /api/faucet` without token; funded wallet; unfunded wallet; repeat | H | 401; `{skipped:true}`; `{signature}` whose transfer of 0.02 SOL lands on devnet; 429 | NOT RUN |
| API-11 | CORS | H | Vercel origin gets `access-control-allow-origin`; a foreign origin doesn't | NOT RUN |
| API-12 | Errors | H | Unknown route → 404 JSON `{error}`; no stack traces anywhere | NOT RUN |

## 3. Realtime WebSocket, indexer, keeper

| ID | Item | Method | Correct means | Status |
|---|---|---|---|---|
| WS-01 | hello → snapshot | B/H | First frame is `snapshot` with the same round as `/api/arena` | NOT RUN |
| WS-02 | presence online count | B | A second tab raises `online` by 1 within 2s and drops it within 50s after closing | NOT RUN |
| WS-03 | chat authenticated | B | Sent message is broadcast to both tabs and present in `/api/chat` after reload | NOT RUN |
| WS-04 | chat unauthenticated / too long / flood | H | `error` frame each; nothing persisted | NOT RUN |
| WS-05 | trade broadcast | B | An ER trade appears as a `trade` frame within 5s, and on the market chart and leaderboard | NOT RUN |
| WS-06 | round broadcast | B | At rollover a `round` frame arrives; the UI countdown resets to the new round | NOT RUN |
| WS-07 | reconnect | B | Server restart or going offline → client reconnects and receives a fresh snapshot; no unhandled error | NOT RUN |
| IDX-01 | Indexer persistence | H | Trades from an E2E run exist in Mongo with matching sigs | NOT RUN |
| IDX-02 | Backfill after restart | H | After redeploy, trades made while down appear in `/api/trades` | NOT RUN |
| KPR-01 | Keeper settle fan-out | H | After resolution every trader of the round is settled within 30s without a manual `settle_player` | NOT RUN |
| KPR-02 | Keeper cheers | H | A Cheers win gets `request_cheers` from the keeper and `CheersPaid` follows | NOT RUN |
| KPR-03 | Keeper watchdog | H | Logs show the crank rolled the round and no duplicate roll tx | NOT RUN |

## 4. Web app (Vercel) — every screen and component

| ID | Component / flow | Method | Correct means | Status |
|---|---|---|---|---|
| UI-01 | First load | B | Preload screen, then the full grid; title "Rogs Arena \| BTC …"; 0 console errors; 0 failed requests | NOT RUN |
| UI-02 | Header countdown | B | Counts down to the on-chain `end_ts` (±1s); rolls to the next round at 0 | NOT RUN |
| UI-03 | History timeline | B | 5-minute slots show Y/N matching on-chain round outcomes | NOT RUN |
| UI-04 | BTC chart + tab title | B | Live BTC price from the MagicBlock oracle (±0.5% of the feed read), updating ≥1/s; opening-price line equals the round strike | NOT RUN |
| UI-05 | Market chart | B | UP/DOWN odds line from real points; trade markers appear for real trades | NOT RUN |
| UI-06 | Empty states | B | A round with no trades shows empty chart/leaderboard copy, not blank or fake data | NOT RUN |
| UI-07 | Status panel | B | Latency is the real MagicBlock ER RTT (non-constant, ms); FPS is real; online count equals WS `online` | NOT RUN |
| UI-08 | Guest setup | B | "Play as guest" → faucet SOL → init+delegate → session → chips. The island ends at ready with 250.00 chips; every tx is real | NOT RUN |
| UI-09 | Wallet connect (Phantom/Solflare) | B | Wallet Standard modal lists installed wallets; connecting uses that pubkey | NOT RUN |
| UI-10 | Buy UP / DOWN | B | Island shows the fill, chips decrease by the amount, position shows shares, latency ms shown, ER explorer link opens | NOT RUN |
| UI-11 | Amount stepper and limits | B | Min 2 enforced; above balance or above 100 shows the program error text, no crash | NOT RUN |
| UI-12 | Take profit / stop loss (sell) | B | Sells all shares, chips increase by proceeds, close shows on the leaderboard as tp/sl | NOT RUN |
| UI-13 | Ability card flip + drag to island | B | Card flips; dropped with a position → on-chain `attach_ability` succeeds; the card is consumed; a second card is rejected with the program message | NOT RUN |
| UI-14 | Ability parked, then trade | B | Card dropped with no position → next buy carries the ability (`TradeExecuted.ability` = card id) | NOT RUN |
| UI-15 | Round end settlement in the UI | B | After rollover the position settles (keeper or claim); chips credited; ability result message is exact | NOT RUN |
| UI-16 | Leaderboard | B | Rows for real traders this round with shares/avg price/PnL; resets on the new round | NOT RUN |
| UI-17 | Chat | B | Needs a wallet; sending persists and broadcasts; placeholder correct when signed out; 280-char limit | NOT RUN |
| UI-18 | Display name | B | Edit name → saved via `/api/profile`, shown in chat/leaderboard after reload | NOT RUN |
| UI-19 | Progress badges | B | Values equal on-chain Player stats (trades, streak, calm wins, day trades) | NOT RUN |
| UI-20 | Heart rate (Web Bluetooth) | B | Real wearable bpm shown and reported on-chain | NOT RUN |
| UI-21 | Refresh mid-flow | B | Reload during setup or after a buy restores state from chain (no duplicate init, same session) | NOT RUN |
| UI-22 | Double-click buy | B | Exactly one trade tx per click-burst (button disabled while pending) | NOT RUN |
| UI-23 | Backend down | B | With the Railway API unreachable, chat/leaderboard show a readable error; trading on the ER still works | NOT RUN |
| UI-24 | Proof page `/proof` | B | Live delegation status (router), crank last roll, oracle price and age, last VRF cheers, last commit, program and explorer links — all real | NOT RUN |
| UI-25 | Responsive | B | 390px and 1440px widths: no horizontal overflow, controls reachable | NOT RUN |
| UI-26 | No mocks anywhere | S | `grep -ri "mock\|stub\|fake\|dummy\|placeholder\|lorem"` in apps/, packages/, programs/ → only legitimate uses (test doubles, input placeholder attrs), each justified | NOT RUN |

## 5. Deploy and integration

| ID | Item | Correct means | Status |
|---|---|---|---|
| DEP-01 | Railway deploy | Build succeeds, `/health` ok, logs show indexer subscribed and keeper running | NOT RUN |
| DEP-02 | Atlas from Railway | `/health.mongo=true` and writes visible in Atlas | NOT RUN |
| DEP-03 | Vercel deploy | Production build succeeds from apps/web with workspace packages | NOT RUN |
| DEP-04 | GitHub | `main` contains all code; no secrets committed (`git grep` for key material and the Mongo URI returns nothing) | NOT RUN |

---

## Run log

Findings and fixes are appended here per run: item ID, observed result, root cause, fix commit, re-run result.

### Run 1 — findings so far (2026-09-13, before the app deploy)

| Item | Observed | Root cause | Fix | Re-run |
|---|---|---|---|---|
| CH-20 | The VRF callback paid the candidate +1.000000 USD, but `parseArenaEvents` returned no `CheersPaid` for the callback tx `3acK2K49…` or `CheersRequested` for `3z18MVog…` | Anchor `EventParser` loses the invoke stack around CPIs. The callback runs this program at depth 2 under the VRF program, and `request_cheers` logs after an inner VRF invoke | `packages/arena-sdk/src/events.ts` now tracks the invoke stack and decodes `Program data:` only when this program is on top. A regression test uses both real devnet log arrays | PASS: the live tx `3acK2K49…` decodes `CheersPaid{recipients:[BymPz…], amountEach:1000000, randomness:32 bytes}`; SDK tests 13/13 |
