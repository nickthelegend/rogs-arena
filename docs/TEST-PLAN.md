# Rogs Arena — Test Plan (zero tolerance)

The checklist every verification run is measured against. **PASS** means the real result matches the
"Correct means" column *exactly*, on the real deployment, with **zero console errors and zero failed
network requests** for UI items. Anything else is **FAIL**. Items that need a dependency we don't have
are **UNTESTABLE** with the exact reason. Nothing is marked PASS by analogy.

Environments:
- **Chain:** Solana devnet + MagicBlock devnet-as ER. Program `J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q`, arena PDA `ApzYL11HC9puv4dbFk1QTCrE4wpLup8ta9QE2UKde2CJ`.
- **Backend:** Railway `https://arena-production-0bdd.up.railway.app` (MongoDB Atlas DB `rogs_arena`).
- **Frontend:** Vercel `https://rogs-arena.vercel.app`.
- **Browser:** Claude in Chrome (real Chrome). Console + network are checked on every UI item.

Methods: **B** = real browser against the deployed app. **S** = real signed devnet transactions from
`packages/arena-sdk/scripts/*` (for program paths the UI deliberately never exposes). **H** = real HTTP/WS
request against the deployed service, observed in the browser network tab or from a script.

Status legend: `NOT RUN` · `PASS` · `FAIL` · `UNTESTABLE (reason)`.

---

## 1. On-chain program (MagicBlock ER + Solana)

| ID | Item | Method | Steps | Correct means | Status |
|---|---|---|---|---|---|
| CH-01 | Program deployed | S | `solana program show J83q…` on devnet | Upgradeable program, 654,792 bytes, authority `Ens1TxKQ…` | PASS — upgradeable, 654,792 bytes, authority Ens1TxKQ… (05:40) |
| CH-02 | Arena delegated | S | Read the arena account on base and ER | Base owner = `DELeGG…`; ER owner = program; router `getDelegationStatus` isDelegated=true | PASS — base owner DELeGG…, ER owner program, router isDelegated=true fqdn devnet-as (05:40) |
| CH-03 | Crank rolls rounds without a keeper | S | `watch-crank.ts` with keeper disabled | `current.id` increments and `last_roll_ts - previous end_ts ≤ 5s`; outcome is YES iff close ≥ strike | PASS — round 1 → 2 rolled 1s after end_ts with no keeper; YES with close 7726266920786 ≥ strike 7725570971918 (watch-crank.ts) |
| CH-04 | Strike and close come from the MagicBlock oracle | S | Compare `RoundOpened.strike_price` / `RoundResolved.close_price` with the BTC/USD feed `71wtT…` at roll time | Both equal the feed's `price` at a `publish_time` within 10s of `last_roll_ts` | PASS — round 5 strike 7724071556152 = feed price published at 1789255801 (roll at 1789255801); round 4 close equals the same feed value; 1,970 live updates sampled |
| CH-05 | init_player + delegate_player | S+B | Fresh wallet → setup | Player PDA exists, base owner `DELeGG…`, visible on the ER with owner = program | S PASS (E2E-RUN P1/P2 init+delegate) · B PASS (UI guest FTBkigFu…: Player BnN4iyxy… base owner DELeGG…, router isDelegated=true) |
| CH-06 | Session key (Gum V2) authorises ER actions | S+B | `createSessionV2`, then `claim_chips` signed only by the session key | Tx succeeds on the ER; the session token PDA `["session_token_v2", program, signer, authority]` exists on base | S PASS (claim_chips signed only by the session key, 281ms) · B PASS (UI: CreateSessionV2 5kdUvZNc…; buy and sell fee payer is session key E3mDMV…, fee 0) |
| CH-07 | Wrong session / non-owner rejected | S | Session key of wallet A signs `buy` for wallet B's player; random key with no token signs `buy` | Both fail: `InvalidToken` / `Unauthorized`; balances unchanged | PASS — "Invalid session token" and "Signer is not allowed to act for this account"; balances unchanged (TEST-RUN-CHAIN) |
| CH-08 | claim_chips first join | S+B | New player claims | Balance = 250.000000; `joined=true`; `ChipsClaimed{first:true}` | S PASS (balance 250.000000 after the first claim) · B PASS (UI: ER balance 250, joined=true right after setup) |
| CH-09 | claim_chips faucet guard | S | Claim again immediately | Fails `FaucetCooldown` (or `FaucetBalanceTooHigh`); balance unchanged | PASS — "Faucet is cooling down", balance unchanged |
| CH-10 | buy happy path | S+B | Buy YES $5 | Balance −5; shares = SDK `quoteBuy` exactly; `TradeExecuted` side 0; yes_price moves up | S PASS (shares 9780446 = quote; balance 245.000000) · B PASS (UI Buy UP $5: balance 250 -> 245, 9.780446 YES, TradeExecuted BUY sig 5Wg1QxjU… indexed) |
| CH-11 | buy limits | S | amount 0.5 USD; 101 USD; > balance | `AmountTooSmall`; `AmountTooLarge`; `InsufficientBalance` | PASS — below minimum / above maximum / "Not enough chips" with state unchanged |
| CH-12 | buy slippage | S | `min_shares = quote + 1` | `SlippageExceeded`; no state change | PASS — "Price moved beyond the allowed slippage", state unchanged |
| CH-13 | trading lock | S | Buy in the last 5s of a round | `TradingLocked` | PASS — buy at end_ts-3 → "Trading is locked in the final seconds of the round" |
| CH-14 | sell happy path | S+B | Sell half of a position | Balance + `quoteSell.out`; shares reduced; `TradeExecuted` side 1 with `realized_pnl` | S PASS (sold 5009741 shares for 2.465775; balance exact) · B PASS (UI TP: SELL 4uGdMzDF… proceeds 4.9005, realized -0.0995) |
| CH-15 | sell more than held | S | Sell held+1 | `NothingToSell` | PASS — "Not enough shares to sell" |
| CH-16 | attach_ability rules | S+B | Attach before lock; second card; after a sell; within 30s of end | First OK (`AbilityAttached`); others `AbilityAlreadySet` / `TradingLocked` | S PASS (attach OK tx JXRbJ8Z2…; second card, after-sell and last-30s rejected) · B NOT RUN |
| CH-17 | report_heart | S | bpm 80 → OK; bpm 20 → fail | `heart_bpm=80` and the active position's `max_bpm` updated; bpm 20 fails `InvalidHeartRate` | PASS — bpm 80 → heart 80, maxBpm 80; bpm 20 → "Heart rate is out of range" |
| CH-18 | Settlement math | S | Settle after resolution | balance delta = payout + bonus from SDK `settleSlot`; slot cleared; wins/losses/streak updated | PASS — E2E P1 delta 19.780446 = payout 9.780446 + bonus 10; P2 loss delta 0; stats updated |
| CH-19 | Double / Protect / Calm bonuses | S | Positions with each card | Double = min(profit,10); Protect = min(loss,10); Calm = 10 only if max_bpm<120 with samples | PASS — Calm +10 (bpm 80/84); Double: profit 1.104787 → bonus 1.104787 (tx 3ubUoksD…); Protect: profit −1.862707 → bonus 1.862707 (tx 5tZKJEm6…); balance deltas exact |
| CH-20 | Cheers via VRF | S | `e2e-cheers-vrf.ts` | `cheers_pending=1` after settle; `request_cheers` succeeds; callback pays each candidate exactly 1.000000; `CheersPaid` includes the randomness | PASS — cheers_pending=1; request_cheers 3z18MVog…; callback 3acK2K49… paid +1.000000; CheersPaid decoded with 32-byte randomness (after the SDK parser fix) |
| CH-21 | settle idempotent | S | `settle_player` twice | Second call succeeds with no balance change and no event | PASS — two settle_player calls, balance unchanged at 248 |
| CH-22 | commit_player / commit_arena | S | Commit, then read base | Base data equals ER state (trades, balance / round, commits) while still delegated | PASS — commit_player: base shows trades 1, balance 264.780446; commit_arena: base went round 0 → 2, trades 0 → 6, still delegated |
| CH-23 | Authority-only instructions | S | `fund_treasury` / `commit_arena` signed by a random key | `Unauthorized` | PASS — fund_treasury and commit_arena by a stranger both rejected |
| CH-24 | Rust unit tests | S | `cargo test -p rogs-arena --lib` | 22 passed, 0 failed | PASS — 22 passed, 0 failed (fresh rerun 05:43) |
| CH-25 | SDK tests | S | `bun test` in packages/arena-sdk | All pass, including the live oracle read | PASS — 13/13 bun tests including the live oracle read and real CPI event logs |

## 2. Arena service HTTP API (Railway)

| ID | Endpoint / case | Method | Correct means | Status |
|---|---|---|---|---|
| API-01 | `GET /health` | H | 200 `{ok:true, mongo:true, er:true, programId:"J83q…", arena:{roundId>0, status:"open", endTs equal to the ER arena}}` (status is a string: idle/open/resolved, per docs/ARENA-API.md) | PASS: Chrome showed ok, mongo and er all true, program J83q…, arena round 8 open with endTs 1789257000, equal to the ER Arena |
| API-02 | `GET /api/arena` | H | 200 ArenaSnapshot; `round.roundId` equals the ER arena `current.id`; all arrays present | PASS: Chrome showed round 8 (ER current.id 8); round, recentRounds (8…1), trades, points, closes, traders, chat and cheers all present |
| API-03 | `GET /api/rounds?limit=5` | H | ≤5 rounds newest first; each resolved one has outcome YES/NO matching the on-chain history | PASS: rounds 8…4 newest first; outcomes 7 YES, 6 NO, 5 NO, 4 YES with strike and close equal to the ER Arena history |
| API-04 | `GET /api/trades?roundId=<n>` | H | Every `TradeExecuted` of that round; `sig` resolvable on the ER; amounts in USD | PASS: round 4 returns 6 trades, matching the on-chain trade count of 6; every sig is finalized on the ER with a Buy/Sell instruction; amounts in USD |
| API-05 | `GET /api/points`, `/api/closes`, `/api/settlements`, `/api/cheers` | H | Shapes per docs/ARENA-API.md; data matches on-chain events | PASS: points ascending every 5s; round-4 closes show tp +1.104787 and sl -1.862707; settlements carry bonus 1.104787 and 1.862707 with sigs 3ubUoks…/5tZKJEm… (same as TEST-RUN-CHAIN); cheers 3acK2K49… randomness 4a55…2cb5 |
| API-06 | `GET /api/chat?limit=50` | H | Ascending, ≤50, persisted across a service restart | PASS: ascending and ≤50. A message written before the Railway deploy was served after boot, so it persisted across the restart; it was a service-agent test record and has been removed |
| API-07 | `POST /api/auth/nonce` bad wallet | H | 400 `{error}` | PASS: `verify-live-api.ts` got 400 wallet: Invalid wallet address |
| API-08 | auth verify: good signature / bad signature / reused nonce | H | token / 401 / 401 | PASS: `verify-live-api.ts` got a token for a good signature, 401 Invalid signature for a bad one, 401 for a reused nonce |
| API-09 | `POST /api/profile` without token; invalid name; valid | H | 401; 400; 200 ProfileDto, then `GET /api/profile/:wallet` returns it | PASS: 401 without token, 400 invalid name, 200 ProfileDto, and GET /api/profile/:wallet returns the same name |
| API-10 | `POST /api/faucet` without token; funded wallet; unfunded wallet; repeat | H | 401; `{skipped:true}`; `{signature}` whose transfer of 0.02 SOL lands on devnet; 429 | PASS: 401 without token; unfunded wallet got 20000000 lamports (tx XwZceLQD…, balance 0.02 SOL on devnet); funded repeat skipped:true; after draining below 0.01, repeat got 429 wallet limit |
| API-11 | CORS | H | Vercel origin gets `access-control-allow-origin`; a foreign origin doesn't | PASS: https://rogs-arena.vercel.app gets access-control-allow-origin on GET /api/arena (200) and on the POST /api/profile preflight (204, Content-Type and Authorization allowed); https://evil.example.com gets no allow-origin |
| API-12 | Errors | H | Unknown route → 404 JSON `{error}`; no stack traces anywhere | PASS: 404 Not found, 405 Method not allowed, 400 Invalid JSON body; no stack traces in any error body |

## 3. Realtime WebSocket, indexer, keeper

| ID | Item | Method | Correct means | Status |
|---|---|---|---|---|
| WS-01 | hello → snapshot | B/H | First frame is `snapshot` with the same round as `/api/arena` | PASS (H): `verify-live-ws.ts` got snapshot as the first frame after hello, with round 9 equal to /api/arena round 9. The browser half is re-checked in UI-01 |
| WS-02 | presence online count | B | A second tab raises `online` by 1 within 2s and drops it within 50s after closing | NOT RUN |
| WS-03 | chat authenticated | B | Sent message is broadcast to both tabs and present in `/api/chat` after reload | H half PASS: broadcast reached the sender and a second socket, then persisted to /api/chat · B NOT RUN |
| WS-04 | chat unauthenticated / too long / flood | H | `error` frame each; nothing persisted | PASS: `verify-live-ws.ts` got error frames for unauthenticated chat, unauthenticated heart, invalid JSON, a message before hello, 281 chars, bpm 400, and a second message within 1s. The flooded message was not broadcast, and only the one valid message was persisted (removed after the run) |
| WS-05 | trade broadcast | B | An ER trade appears as a `trade` frame within 5s, and on the market chart and leaderboard | NOT RUN |
| WS-06 | round broadcast | B | At rollover a `round` frame arrives; the UI countdown resets to the new round | NOT RUN |
| WS-07 | reconnect | B | Server restart or going offline → client reconnects and receives a fresh snapshot; no unhandled error | NOT RUN |
| IDX-01 | Indexer persistence | H | Trades from an E2E run exist in Mongo with matching sigs | PASS: round-4 trades and settlements in Mongo carry the exact sigs of the on-chain ability run (3ubUoks…, 5tZKJEm…); backfill on Railway read 986 txs, 45 events, 0 failures |
| IDX-02 | Backfill after restart | H | After redeploy, trades made while down appear in `/api/trades` | PASS: `verify-keeper-settle.ts` bought while the Railway indexer was disabled (tx 48jQpd4p…, /health indexer.enabled=false); after INDEXER_ENABLED=true the backfill returned it in /api/trades 64s later |
| KPR-01 | Keeper settle fan-out | H | After resolution every trader of the round is settled within 30s without a manual `settle_player` | PASS: `verify-keeper-settle.ts` round 10 rolled at 1789257601; the position settled 1s later in tx 3fvVSGxE…, signed by keeper 59o1…; the player never sent settle_player |
| KPR-02 | Keeper cheers | H | A Cheers win gets `request_cheers` from the keeper and `CheersPaid` follows | NOT RUN |
| KPR-03 | Keeper watchdog | H | Logs show the crank rolled the round and no duplicate roll tx | PASS: Railway log at 23:50:06 shows Crank rolled: round 8 -> round 9, last_roll_ts 1789257001 (1s after end); keeper.lastRollSig is null, so no duplicate roll tx |

## 4. Web app (Vercel) — every screen and component

| ID | Component / flow | Method | Correct means | Status |
|---|---|---|---|---|
| UI-01 | First load | B | Preload screen, then the full grid; title "Rogs Arena \| BTC …"; 0 console errors; 0 failed requests | Load half PASS: title "Rogs Arena / BTC - $77,259.75"; full grid rendered; 62 requests all 200/304 (Vercel assets, Railway API, devnet-as ER); 0 console errors or warnings. Preload animation still to be seen in a visible window |
| UI-02 | Header countdown | B | Counts down to the on-chain `end_ts` (±1s); rolls to the next round at 0 | PASS: at 00:13:24 UTC the header showed 01:36, which is on-chain end_ts 1789258500 (00:15:00) minus now |
| UI-03 | History timeline | B | 5-minute slots show Y/N matching on-chain round outcomes | PASS: all 12 resolved slots match /api/rounds and the ER history (IST slot = round start): 05:35 N=r12 NO, 05:30 Y=r11 YES, 05:25 N=r10 NO, 05:20 Y=r9, 05:15 Y=r8, 05:10 Y=r7, 05:05 N=r6, 05:00 N=r5, 04:55 Y=r4, 04:50 N=r3, 04:45 N=r2, 04:40 Y=r1; the current 05:40 slot has no letter |
| UI-04 | BTC chart + tab title | B | Live BTC price from the MagicBlock oracle (±0.5% of the feed read), updating ≥1/s; opening-price line equals the round strike | PASS: the headless-Chrome render shows a live BTC line, and the dashed opening line label $77,259.37 equals the round-14 strike 7725937… (77,259.37). The title price $77,259.50-.62 was within 0.001% of oracle 77,259.576 (publish 1789258744) and updates every read. Charts render in real Chrome: 61 rAF/s, both canvases painted |
| UI-05 | Market chart | B | UP/DOWN odds line from real points; trade markers appear for real trades | NOT RUN |
| UI-06 | Empty states | B | A round with no trades shows empty chart/leaderboard copy, not blank or fake data | NOT RUN |
| UI-07 | Status panel | B | Latency is the real MagicBlock ER RTT (non-constant, ms); FPS is real; online count equals WS `online` | PASS: headless Chrome showed "ER RTT 160 MS / 60 FPS", then 146 ms / 59 FPS across 8s (median of real getSlot calls, requestAnimationFrame FPS). Chrome showed "3 traders" while /api/arena online = 3. The hidden Claude-in-Chrome window shows "—" by design because sampling pauses |
| UI-08 | Guest setup | B | "Play as guest" → faucet SOL → init+delegate → session → chips. The island ends at ready with 250.00 chips; every tx is real | PASS: clicking PLAY AS GUEST in Chrome created guest FTBkigFu…VmbEH. On devnet: faucet transfer 2nFFzjT4 (00:15:19), InitPlayer+DelegatePlayer 4RyJL3z7 (00:15:20), CreateSessionV2 5kdUvZNc (00:15:22). ER Player balance 250, joined; island showed 0.0136 SOL · 250 chips; 0 console errors |
| UI-09 | Wallet connect (Phantom/Solflare) | B | Wallet Standard modal lists installed wallets; connecting uses that pubkey | NOT RUN |
| UI-10 | Buy UP / DOWN | B | Island shows the fill, chips decrease by the amount, position shows shares, latency ms shown, ER explorer link opens | NOT RUN |
| UI-11 | Amount stepper and limits | B | Min 2 enforced; above balance or above 100 shows the program error text, no crash | PASS: in Chrome, Decrease stops at 2 (button disabled). Increase to 102, then Buy UP shows "The largest trade is | UI-11 | Amount stepper and limits | B | Min 2 enforced; above balance or above 100 shows the program error text, no crash | 00.00." (the program MAX_TRADE), with no transaction, no crash and 0 console errors. The above-balance case cannot be reached with 244.9 chips and a | UI-11 | Amount stepper and limits | B | Min 2 enforced; above balance or above 100 shows the program error text, no crash | 00 cap; the program rejection "Not enough chips" is covered by CH-11 |
| UI-12 | Take profit / stop loss (sell) | B | Sells all shares, chips increase by proceeds, close shows on the leaderboard as tp/sl | PASS for the sell: TP on UP sold all 9.780446 YES; ER balance 245 -> 249.9005 (proceeds 4.9005); position 0 shares; close indexed as sl -0.0995; leaderboard row shows SL; exactly 1 BUY + 1 SELL, so the overlap fix holds in production. Defect found: the button said TP and the island PnL showed +$0.01, but the executed exit realized -0.0995 (run log) |
| UI-13 | Ability card flip + drag to island | B | Card flips; dropped with a position → on-chain `attach_ability` succeeds; the card is consumed; a second card is rejected with the program message | NOT RUN |
| UI-14 | Ability parked, then trade | B | Card dropped with no position → next buy carries the ability (`TradeExecuted.ability` = card id) | NOT RUN |
| UI-15 | Round end settlement in the UI | B | After rollover the position settles (keeper or claim); chips credited; ability result message is exact | NOT RUN |
| UI-16 | Leaderboard | B | Rows for real traders this round with shares/avg price/PnL. At rollover the previous board stays up, marked frozen (original rizz-club hold, `advanceLeaderboardHold`), until the new round’s first trade replaces it with a new epoch | NOT RUN |
| UI-17 | Chat | B | Needs a wallet; sending persists and broadcasts; placeholder correct when signed out; 280-char limit | PASS: signed out, the placeholder reads "Connect wallet to chat"; signed in, "What’s that". Sent "gm arena, verifying chat on devnet" in Chrome; it rendered as rogsjudge and /api/chat holds it (t 1789259578775). Input maxLength 280 (server rejects 281, WS-04). 0 console errors |
| UI-18 | Display name | B | Edit name → saved via `/api/profile`, shown in chat/leaderboard after reload | PASS: Edit name -> "rogsjudge" -> POST /api/profile 200; GET /api/profile/FTBkigFu… returns displayName rogsjudge; after a full reload the island and leaderboard still show rogsjudge; 0 console errors |
| UI-19 | Progress badges | B | Values equal on-chain Player stats (trades, streak, calm wins, day trades) | PASS: Trade Masters 2/100, Streak Climber 0/5, Steal Heart 0/70, Day Trader 2/20 equal the ER Player FTBkigFu… tradesTotal 2, winStreak 0, calmWins 0, dayTrades 2 |
| UI-20 | Heart rate (Web Bluetooth) | B | Real wearable bpm shown and reported on-chain | NOT RUN |
| UI-21 | Refresh mid-flow | B | Reload during setup or after a buy restores state from chain (no duplicate init, same session) | PASS after a buy: reloading at 00:21 restored the guest, session and name from storage and chain (249.9005 chips = ER balance). Base history for FTBkigFu… has exactly one InitPlayer+DelegatePlayer and one CreateSessionV2, so the reload did no duplicate init |
| UI-22 | Double-click buy | B | Exactly one trade tx per click-burst (button disabled while pending) | PASS (headless Chrome): a double-click on Buy DOWN produced one trade; the Trade Masters counter went 1 -> 2 and guest EEaRS5fz… has tradesTotal 2 on the ER (1 YES buy + exactly 1 NO buy) |
| UI-23 | Backend down | B | With the Railway API unreachable, chat/leaderboard show a readable error; trading on the ER still works | NOT RUN |
| UI-24 | Proof page `/proof` | B | Live delegation status (router), crank last roll, oracle price and age, last VRF cheers, last commit, program and explorer links — all real | NOT RUN |
| UI-25 | Responsive | B | 390px and 1440px widths: no horizontal overflow, controls reachable | NOT RUN |
| UI-26 | No mocks anywhere | S | `grep -ri "mock\|stub\|fake\|dummy\|placeholder\|lorem"` in apps/, packages/, programs/ → only legitimate uses (test doubles, input placeholder attrs), each justified | NOT RUN |

## 5. Deploy and integration

| ID | Item | Correct means | Status |
|---|---|---|---|
| DEP-01 | Railway deploy | Build succeeds, `/health` ok, logs show indexer subscribed and keeper running | PASS: the Dockerfile build succeeded (Railpack had detected Rust; fixed). Boot log shows mongo connected, indexer watching the program, keeper started; /health ok |
| DEP-02 | Atlas from Railway | `/health.mongo=true` and writes visible in Atlas | PASS: /health mongo:true from Railway; probe user, session and faucet writes were read back through the API and then removed |
| DEP-03 | Vercel deploy | Production build succeeds from apps/web with workspace packages | PASS: https://rogs-arena.vercel.app READY (dpl_2NrjTfYJv5NT323ysH2EP5rr9REX), built from apps/web with workspace packages; all 10 NEXT_PUBLIC vars match env.ts |
| DEP-04 | GitHub | `main` contains all code; no secrets committed (`git grep` for key material and the Mongo URI returns nothing) | NOT RUN |

---

## Run log

Findings and fixes are appended here per run: item ID, observed result, root cause, fix commit, re-run result.

### Run 1 — findings so far (2026-09-13, before the app deploy)

| Item | Observed | Root cause | Fix | Re-run |
|---|---|---|---|---|
| CH-20 | The VRF callback paid the candidate +1.000000 USD, but `parseArenaEvents` returned no `CheersPaid` for the callback tx `3acK2K49…` or `CheersRequested` for `3z18MVog…` | Anchor `EventParser` loses the invoke stack around CPIs. The callback runs this program at depth 2 under the VRF program, and `request_cheers` logs after an inner VRF invoke | `packages/arena-sdk/src/events.ts` now tracks the invoke stack and decodes `Program data:` only when this program is on top. A regression test uses both real devnet log arrays | PASS: the live tx `3acK2K49…` decodes `CheersPaid{recipients:[BymPz…], amountEach:1000000, randomness:32 bytes}`; SDK tests 13/13 |
| E2E report | `docs/E2E-RUN.md` step 19 showed **PASS** with the detail "not exercised this run", so a skipped VRF step was counted as passed (21/21) | `e2e-devnet.ts` recorded the skipped branch as `ok: true` and had no skipped state | `Step.skipped` gives the verdict `NOT EXERCISED`, and the summary counts only exercised steps. The row is corrected, and VRF evidence comes from the deterministic run: request `3z18MVog…`, callback `3acK2K49b37rgwVbSXFBdYmk7p937iNzHmrvMBpktJLsfTSZrTazMsQqTivjbkH5kE9VcCJztK4cGJupKTxvVbtV` | tsc 0 errors, SDK 13/13 |
| Evidence docs | Re-running `e2e-devnet.ts` or `test-guards.ts` would delete the sections that `commit-arena.ts`, `e2e-cheers-vrf.ts` and `test-abilities.ts` append (commit_arena, Cheers VRF, ability bonuses) | Both writers called `writeFileSync` on the whole file | Both now replace only their own table and keep every `## ` section after it | tsc 0 errors |
| MAGICBLOCK-AUDIT | The audit reported VRF Cheers and the router call as unverified, with zero router call sites | The audit read `E2E-RUN.md` step 19 before the deterministic VRF run, and it missed `scripts/check-delegation.ts` | Rows 8 and 12, §1.1 and §1.3 #6 now carry the signatures and call site | — |
| CH (undelegate) | `undelegate_player` had no live proof | No script called it | `scripts/verify-undelegate.ts` runs undelegate (ER `3sCuC1UPpgtuqoxGcBRBMeHQvYjYusYCvyXCHViTMcEYhjh2Sfahidqs1c1jWfetxBWUC4FKr5S8DcKx5ewTgaCm`), then checks the base owner is the program and the balance is 250.000000 on base. Router status goes true → false, then re-delegation (`2HBvpN1PwDy6wi9qKbh81XGCQgDhMQi1ikYvVr28podWyTQmnUJBmL1EDXcXh4M5szKJmx96hiSxeXJCzCxqUshR`) | PASS 8/8 |
| KPR commit cap | The keeper counted commits only in Mongo (starting at 0), while the Arena already had 1 on-chain commit, so it could hit MagicBlock's 10 plain commits per delegation early | Commit count was not read from chain | `maybeCommit` uses `max(mongo, arena.commits)` against `MAX_COMMITS = 9` | tsc 0 errors, keeper-rules 4/4 |
| API tests | `schemas.test.ts` "wallet addresses … keep their case" failed 1 run in 6 | The test lowercased a random key, which sometimes decodes to another valid 32-byte key | Uses a fixed key containing `L` (its lowercase `l` is not base58) plus an invalid-character case | see next run |
| DEP-01 | The first `railway up` failed. Railpack detected Rust from the root `rust-toolchain.toml`, ran `cargo build --release`, and never installed Bun | Auto-detection keys on the repo root, which holds the Anchor workspace | Added `apps/arena/Dockerfile` (oven/bun 1.3.11, repo-root context, exec-form CMD for SIGTERM), set `RAILWAY_DOCKERFILE_PATH`, added `.dockerignore`. Start command is `bun run apps/arena/src/index.ts` | Deploy SUCCESS; boot log shows mongo, indexer, keeper |
| IDX-02 (attempt 1) | The buy landed while the service was already back up, so the attempt was recorded as a FAIL instead of a backfill check | A Railway restart only takes ~2s (SIGTERM 23:55:15.97, boot 23:55:17.90); the flag went down at 23:55:24 | The script now counts the indexer as down when `/health.indexer.enabled` is false. The re-test runs with `INDEXER_ENABLED=false` during the trade | re-test pending |
| KPR crank lifetime | The crank task ran 200,000 × 2s and would expire around 2026-09-17 14:18 UTC; the keeper only logged the stall | Nothing re-scheduled an expired task | The keeper sends `schedule_round_crank` with a fresh task id after 2 consecutive stalled rounds, with a 10-minute backoff and task-id parity with the SDK | 46/46 service tests, tsc 0; live path UNTESTABLE until the current task expires |
| DEP-03 | The first `vercel --prod` upload aborted; the retry hit the free-tier limit of 5000 uploaded files per 24h | Without a `.vercelignore` the CLI uploaded the repo root, including target (1.9 GB) and node_modules | `.vercelignore` allow-list (apps/web, packages, lockfile), deployed with `--archive=tgz` (25 MB) | READY |
| UI-10 | Buy worked (status "Bought 9.8 YES for $5.00 in 229 ms on the MagicBlock ER.", chips -5, 9.8 UP shown) but there was no ER explorer link to open | `use-trading` sets `status.explorerUrl`, but `pane-trading-zone` renders only `status.message` | Render the status line as a link to the ER explorer when `explorerUrl` is set | re-verify after deploy |
| UI-12 | The TP/SL label and island PnL used the mark price (+$0.01), so the button said TP while the executed sell realized -$0.0995 (1% fee + price impact) | `floatingProfitsForTrader` values shares at the mark instead of the executable exit | Value the player’s own exit with the SDK `quoteSell` on the live pools (fee included) | re-verify after deploy |
| UI-15 | The keeper settled the round-15 position 3s after the end (payout 0, P/L -5, tx 5W4YVfMg…), but the island showed no settlement result | The island only built a settlement message on a manual Claim | `use-trading` watches for positions leaving the Player account and reports the indexed PositionSettled rows (with ER explorer link); Claim marks its rounds so they are not reported twice | re-verify after deploy |
| UI-16 | After round 15 resolved NO, the frozen board still showed rogsjudge +$0.01 for 9.8 YES that were worth $0 | The hold froze the last mark-based values | While frozen, `use-leaderboard` fetches the held round’s outcome and `resolveHeldItems` values open shares at $1/$0 | re-verify after deploy |
| UI-01 (fresh guest) | Headless Chrome logged `Failed to load resource: 404` for GET /api/profile/<new guest> | The service answered 404 for a wallet that never saved a name, and the browser logs every 404 | GET /api/profile/:wallet returns 200 with displayName null for unknown wallets (ARENA-API.md updated) | re-verify after Railway deploy |
| UI-13/14 procedure | Dragging a card onto the island in its information view did nothing, in both Chrome and headless Chrome | By design, cards apply only while the island is in its trading zone (`canApplyAbilityOnIsland`); the drag shows a trading-zone hint | Not a defect: the flow opens Trade before dragging | re-run in headless Chrome |
| UI-13 | Headless Chrome: attach PASS ("Double price attached to your round position in 159 ms on the MagicBlock ER."). A second card (Protect) dropped on that position stayed parked ("Protect loss ×") with no message; the next Buy DOWN then carried it and failed, so the UI-22 re-run counted 0 trades | `useReleaseAppliedOnMarketEnd` returned early when the position already held a different card | The island now sends `attach_ability` anyway; the program rejects it with its message and `clearApplied` returns the card to the rack | re-verify after deploy |
