# MagicBlock Integration Audit: Rogs Arena

Program `J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q` (devnet), Arena PDA `ApzYL11HC9puv4dbFk1QTCrE4wpLup8ta9QE2UKde2CJ`, ER `devnet-as` (validator `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57`).
Audited 2026-09-12 23:10–23:30 UTC (2026-09-13 ~04:50 IST). The audit read code, `docs/E2E-RUN.md`, and ran read-only chain queries. Nothing was sent to the chain.

---

## 1. Honest status

### 1.1 Verdict

**Yes, MagicBlock is genuinely used, and it is load-bearing in the program and SDK.** A buy, sell, heart report or settle cannot run anywhere except the ER, because both Arena and Player are delegated. Rounds resolve from the MagicBlock oracle inside the ER, and a MagicBlock crank rolls them.

**Depth is uneven, and nearly all of it lives in scripts.**
- **Proven live** by signatures in `docs/E2E-RUN.md` (21/21 PASS, run 23:15 UTC):
  - delegation
  - gasless ER execution
  - session keys
  - oracle read inside the ER
  - crank roll
  - `commit_player`
  - `commit_arena`
- **Also proven live (corrected after the audit):** VRF Cheers (request `3z18MVog…`, callback `3acK2K49…`) and the router `getDelegationStatus` call (`packages/arena-sdk/scripts/check-delegation.ts`).
- **Not proven live:** `undelegate_player`.
- **Not integrated at all:** Private ER, eSPL, private payments, Magic Actions and ephemeral accounts.
- **Not reachable by a judge through the product.** `apps/web` source never imports `@rogs/arena-sdk`; the only mention is `apps/web/package.json:16`.
  - `hooks/use-trading.ts:30,43` still uses Privy.
  - `hooks/use-current-market.ts:4` and `features/chart-btc/index.tsx:17-18` still use the Somnia SDK.
  - There is no `/proof` route; `apps/web/app` holds only `layout.tsx` and `page.tsx`.
  - `apps/arena` has no keeper and no indexer. `src/chain.ts:132-150` only has send helpers, and `src/types.ts:104-105` holds status fields that nothing fills.

**Live state at 23:20–23:23 UTC, read-only:**
- **Crank:** it opened round 3 at 23:20:01 for an `end_ts` of 23:20:00. No keeper code exists anywhere, so the crank is the only thing that could have rolled it.
- **Router:** `getDelegationStatus(arena)` returned `isDelegated: true`, `fqdn: https://devnet-as.magicblock.app/`, authority `MAS1Dt9q…`.
- **Base layer:** the Arena is owned by `DELeGG…`, holds round 2 and `commits = 1`.
- **Oracle age:** 0 s.
- **Activity:** 6 trades and 4 players in total, all of them from scripts.

### 1.2 Touchpoint table

The last column covers the web UI only. Nothing there is verified, and every web surface is currently unwired.

| # | Touchpoint | Program / SDK status | Evidence (step in `docs/E2E-RUN.md` unless noted) | File:line | Web UI |
|---|---|---|---|---|---|
| 1 | ER delegation, Player | **GENUINELY USED** | Step 2 `2Hap4Rjf…`, step 4 `2dptWrsB…` (base); later ER txs write both PDAs | `lib.rs:106-117`, `lib.rs:943-951`; `tx.ts:329-349` | VERIFIED in the live UI (UI-08): PLAY AS GUEST sent InitPlayer+DelegatePlayer `4RyJL3z7…` for guest `FTBkigFu…`; the router reports the Player delegated |
| 2 | ER delegation, Arena | **GENUINELY USED** | Every ER trade writes the delegated Arena (steps 10, 12, 13). Delegate tx `3zd4N4ey…` is in PLAN P2.04 only. Router confirmed it live at audit time | `lib.rs:80-97`, `lib.rs:918-926`; `bootstrap-arena.ts:67-75` | n/a (ops) |
| 3 | Gasless ER execution | **GENUINELY USED** | Step 6 `41XV3Ute…`: fee payer is session signer `4BZVFzEe…`, which holds **0 lamports on base and on the ER**; `meta.fee = 0` (queried at audit) | `tx.ts:293-308` | VERIFIED in the live UI (UI-10/UI-12): Buy and Sell from the island paid by session key `E3mDMV…` with fee 0 on the ER |
| 4 | Session keys (Gum `SessionTokenV2`) | **GENUINELY USED** | Created: step 3 `4tEVFnMu…`, step 5 `4qiJiSZG…`. Used as signer: steps 6, 7, 9, 10, 12, 13 | `lib.rs:123-127` (`session_auth_or`), `lib.rs:954-975`; `tx.ts:119-130`, `tx.ts:313-324` | VERIFIED in the live UI (UI-08): CreateSessionV2 `5kdUvZNc…`; every later trade signed by the session key |
| 5 | Pricing oracle read inside the ER | **GENUINELY USED** | Step 16: strike `7725570971918`, close `7726266920786`, outcome YES. First roll `QNfXgdo6…` is in PLAN P2.04 | `lib.rs:483`; `oracle.rs:42-91`; `constants.rs:80-82` | VERIFIED in the live UI (UI-04): BTC chart price within 0.001% of the feed; the opening line equals the round strike |
| 6 | Crank (`roll_round` via `ScheduleTask`) | **GENUINELY USED** | Step 16 "rolled 1s after end" with no keeper running; audit read shows round 3 opened 1 s after end. Schedule tx `4sbYLjmc…` (PLAN P2.04). No crank-executed signature was captured | `lib.rs:735-789`, `lib.rs:471-577`; `bootstrap-arena.ts:86-94` | PENDING |
| 7 | Rust SDK `crank` feature (`ScheduleCrankCpi`) | **IMPORTED BUT UNUSED** | The feature is enabled, but scheduling hand-serializes `MagicBlockInstruction::ScheduleTask` with bincode | `Cargo.toml:24,28`; `lib.rs:760-765` | n/a |
| 8 | VRF (`request_cheers` / `cheers_callback`) | **GENUINELY USED** (corrected after the audit) | `e2e-cheers-vrf.ts` deterministic run, section "Cheers via MagicBlock VRF" in `docs/E2E-RUN.md`: `request_cheers` on the ephemeral queue `3z18MVog…`; the VRF program invoked `cheers_callback` in `3acK2K49…`, which paid the candidate +1.000000 USD and emitted `CheersPaid` with randomness `4a55442c…2cb5` (TEST-PLAN CH-20). Main E2E step 19 was not exercised, not a pass | `lib.rs:598-728`, `lib.rs:999-1020`; `math.rs:283`; `tx.ts:184-198` | PENDING (not wired) |
| 9 | `commit_player` (`MagicIntentBundleBuilder.commit`) | **GENUINELY USED** | Step 20 `Np1fntai…`; step 21 base shows trades 1 and balance 264.780446 | `lib.rs:830-840`, `lib.rs:1054-1066` | PENDING |
| 10 | `commit_arena` | **GENUINELY USED (once, manually)** | `2qc96JkV…`: base went from round 0 / 0 trades to round 2 / 6 trades and stayed delegated. The keeper that runs it "every 12 rounds" does not exist | `lib.rs:809-827`; `commit-arena.ts:36-44` | n/a |
| 11 | `undelegate_player` (`commit_and_undelegate`) | **GENUINELY USED** (verified after the audit) | `scripts/verify-undelegate.ts`: ER tx `3sCuC1UP…` undelegated Player `ENnMBsqQ…`, which came back owned by the program on Solana with its 250.000000 USD ER balance. The router switched from `isDelegated: true` to `false`, and re-delegation `2HBvpN1P…` kept the balance on the ER. Section "Player undelegate and re-delegate" in `docs/E2E-RUN.md` | `lib.rs:843-853`; `tx.ts:228-233` | PENDING (not wired) |
| 12 | Magic Router `getDelegationStatus` | **USED IN SCRIPTS ONLY** (corrected after the audit) | One call site: `scripts/check-delegation.ts`, which returned `isDelegated: true` and fqdn `devnet-as` for the Arena. The E2E uses `waitForDelegation`, which compares base/ER owners. Transactions go straight to `devnet-as`, not through the router. Web and service have no call site yet | `connections.ts:25-36`, `:58-69`; `check-delegation.ts:7`; `constants.ts:81-87` | PENDING |
| 13 | Commitment signature (`GetCommitmentSignature`) | **MISSING** | PLAN §2.3 promises it; only the ER scheduling sig is recorded | — | — |
| 14 | TS `@magicblock-labs/ephemeral-rollups-sdk`, `@magicblock-labs/gum-sdk` | **IMPORTED BUT UNUSED** | Declared but never imported. Session calls use a bundled `gpl_session` IDL | `packages/arena-sdk/package.json:17-18` | — |
| 15 | Private ER / TEE | **MISSING** | No `access-control` feature, no permission CPI | `Cargo.toml:24` | — |
| 16 | Ephemeral SPL token | **MISSING** | Chips are a `u64` in `Player` | `state.rs:134` | — |
| 17 | Private payments API | **MISSING** | — | — | — |
| 18 | Magic Actions | **MISSING** | No `#[action]`, no `add_post_commit_actions` | — | — |
| 19 | Ephemeral accounts | **MISSING** | Chat and presence live in Mongo / memory (`apps/arena/src/chat.ts`, `presence.ts`) | — | — |
| 20 | Fee vault / delegated fee payer | **MISSING** | 10-commit cap applies (see 1.3) | `lib.rs:819-825` | — |
| 21 | ER latency readout (web) | **FAKED at audit start, being fixed** | Hard-coded "Stable 57 MS \| 50 FPS". During the audit another agent replaced it with a `getSlot` RTT median | `apps/web/features/status/index.tsx:18` | PENDING LIVE BROWSER VERIFICATION |

Full signatures:
- Step 2: `2Hap4RjfnYRRXaC2MkDQvw4TkNaEHgyAzZtJ3GjAs8nJTePZWssXG7ipqSrC4ck1n5mGcpfswEDhJBJXtK8wyoPR`
- Step 3: `4tEVFnMuy4aC4QQtRSJ4wta4hqnvQuaBY4BUCbdRAHQnXVbPK8BrpUhjd8MdmTdhHVfBWyfFeBs3BRvzWgp8BsZV`
- Step 6: `41XV3UteUrU4jnRKF2CFVmoroazvAW5GFBG9cSjBW9AAu3G1tqQqVBTvoLaicU5mMpA41pcwvjrcTDX4GgvHm1u8`
- Step 20: `Np1fntai7EzWQDYBWvTTRu8oH578suvoy5dfHqAPhnBPug3bCpJfGurGYJDcCkMHXyauj9XmqYgRy9xLT5RK6j2`
- `commit_arena`: `2qc96JkVd681n6icMr1hnDqpi8BkJhnSiYqUfyPa76r63AuERz5Ew4K9Nr5ezrWaPNJPdD2tmbbWNxVqciB6sMAL`

### 1.3 Checkbox risks and weak spots

1. **As designed, VRF Cheers is close to a checkbox.** The caller of `request_cheers` chooses the candidate list (`lib.rs:607-653`), which may hold at most 12 entries (`constants.rs:49`), and 10 get paid (`constants.rs:47`).
   - With 10 or fewer candidates, the randomness decides nothing; with 12, it drops just 2.
   - The requester can curate who is eligible.
   - The only VRF test path passes exactly one candidate (`e2e-cheers-vrf.ts:113`).
2. **Heart rate is self-reported.** A session key can send `report_heart(80)` whatever the wearable says (`lib.rs:429-455`), and Calm pulse pays $10 on `max_bpm < 120` (`math.rs:164-168`). The ER makes these writes cheap. It does not make them true.
3. **Commit quota.** Without a delegated fee payer, the docs allow 10 commits per delegation, and commit 11 fails. At the planned "every 12 rounds", the Arena hits that wall after about 10 hours. Nothing tracks it except `arena.commits`.
4. **The crank is finite and nothing watches it.** 200,000 iterations × 2 s ≈ 4.6 days (`bootstrap-arena.ts:34-35`). No re-schedule path or watchdog exists.
5. **`request_cheers` takes a writable, non-delegated payer** (`lib.rs:1003-1004`), which contradicts the ER signer rule in PLAN §2.2. It is untested live.
6. **The router is still thin.** Only `scripts/check-delegation.ts` calls it (correction: the audit first reported zero callers). The validator is hard-coded (`constants.ts:86`), and neither web nor service routes through it.
7. **Commit proof stops at base bytes.** The base commitment transaction is never captured, which the MagicBlock skill (`references/magic-actions.md`) warns is incomplete observation.

---

## 2. What MagicBlock offers, and what the track rewards

| Product | What it gives | Source |
|---|---|---|
| Ephemeral Rollups | Delegate, execute at low latency with 0 ER fees, commit/undelegate | [ER concepts](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/ephemeral-rollup.md), [fees](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/fees-and-commit-economics.md) |
| Magic Router | `getDelegationStatus`, `getRoutes`, `getBlockhashForAccounts`; routes txs to the right ER | [router](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/magic-router.md) |
| Session keys | Gum `SessionTokenV2`, scoped signer with expiry | [session keys](https://docs.magicblock.gg/pages/tools/session-keys/introduction.md) |
| Pricing oracle | Pyth Lazer feeds updated every 50–200 ms, readable in the ER | [oracle](https://docs.magicblock.gg/pages/tools/oracle/introduction.md) |
| Cranks | `ScheduleTask` (task_id, interval, iterations) on the ER | [cranks](https://docs.magicblock.gg/pages/tools/crank/introduction.md) |
| VRF | Randomness request with callback, ephemeral queue | [VRF](https://docs.magicblock.gg/pages/verifiable-randomness-functions-vrfs/introduction/solana-vrf.md) |
| Magic Actions | Base-layer instructions run after a commit (`CallHandler`, `add_post_commit_actions`, `#[action]`) | [overview](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/magic-actions/overview.md) |
| Ephemeral accounts | ER-only accounts; sponsor pays `(len+60)×32` lamports; never commit | [ephemeral accounts](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/ephemeral-accounts.md) |
| Private ER (TEE) | Intel TDX validator (devnet `https://devnet-tee.magicblock.app`, `MTEWGuqx…`); permission program `ACLseoPo…` with member flags; `getAuthToken` | [PER quickstart](https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/how-to-guide/quickstart.md), [access control](https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/how-to-guide/access-control.md) |
| Ephemeral SPL token | eATA plus Global Vault per mint, program `SPLxh1LV…`; deposit, transfer in ER, withdraw | [eSPL overview](https://docs.magicblock.gg/pages/ephemeral-spl-token/overview.md) |
| Private payments | Stealth handles and queued private settlement over eSPL (REST/MCP API) | [private payments](https://docs.magicblock.gg/pages/ephemeral-spl-token/private-payments.md) |
| Reference architecture | Prediction markets: ER + oracle + session keys + eSPL + cranks, with Magic Actions for payouts and PER for restricted visibility | [prediction markets](https://docs.magicblock.gg/pages/solutions/prediction-markets.md) |

**What the track rewards:**
- **Rules:** "Every submission must integrate MagicBlock's Ephemeral Rollup." Judging is on creativity, technical depth, and how compellingly the project shows what's possible on Solana.
  - The Luma page ([luma.com/j13m2kqc](https://luma.com/j13m2kqc)) limits prizes to ER or Private ER projects.
  - Prizes are 500 / 250 / 150 USDC, plus 100 for Wizardio's Choice.
- **Past results:**
  - v7 recap ([blog/august2026-recap](https://www.magicblock.xyz/blog/august2026-recap)): **BlitzMine** (ER + VRF), **Tenor** (quotes hidden in a Private ER) and **Oobe Protocol** (Private Payments MCP).
  - v5 trading edition ([blog/june2026-recap](https://www.magicblock.xyz/blog/june2026-recap)): won by **Ghost Stops**, trailing stops and bracket orders on perps. The recap also highlighted private prediction markets and market-neutral pairs.
  - The v3 recap ([blog/april2026-recap](https://www.magicblock.xyz/blog/april2026-recap)) and the Colosseum Frontier privacy podium ([blog/may2026-recap](https://www.magicblock.xyz/blog/may2026-recap)) both lean heavily on privacy.
  - Inferred pattern: winners pair ER with one second primitive that is essential to the idea (VRF, PER, or private payments), and they have a working demo.
- **Submission window: check it yourself.** When fetched during this audit, `build.magicblock.app` showed "No open events" and Luma labeled v8 a past event. Confirm before 12:30 UTC.

---

## 3. Where deeper integration fits, and where it would be forced

| Capability | Fit | Reasoning |
|---|---|---|
| **Private ER** | **Strong fit** for heart rate and pre-lock positions | Heart rate is biometric data. Hiding open positions until the trade lock stops copy-trading on a thin 5-minute AMM. Cost: the Arena and every Player must move to the TEE validator, because accounts on different ERs can't share a tx, and every client needs an auth token. PLAN §0 recorded the TEE router as down, so re-check first. PER **does not** fix trust in the self-reported bpm. |
| **Magic Actions** | **Strong fit** | Badges and round history are durable entitlements that belong on base. A commit plus an action writes them without a relayer. |
| **Cranks, more** | **Strong fit** | Settlement, TP/SL triggers and price sampling are all time-based. The limit is that a scheduled instruction's accounts are fixed, so per-player work needs one task per player. |
| **VRF, fixed** | **Fit** | Cheers and card drops are social randomness. Deciding the round outcome with VRF would be **forced and wrong**, because BTC decides it. |
| **eSPL** | **Fit, expensive** | The documented prediction-market custody model. Turning chips into real token balances is a real depth gain, but it touches every balance path in `lib.rs`. |
| **Ephemeral accounts** | **Fit for chat, reactions and duels** | The documented pattern for temporary social state. Balances must stay in Player. |
| **Router** | **Fit, but surface** | Wiring the web client through the router is cheap and correct. A judge will not see it as depth. |
| **Private payments / stealth handles** | **Forced** | Chips are devnet play money, and no product flow sends payments between people. |
| **eSPL swap API** | **Forced** | There is nothing to swap. |
| **PER over the whole AMM** | **Forced** | Hidden pools break price discovery and the UI chart. |
| **More oracle feeds** | **Partial** | A BTC-vs-SOL pair round fits the v5 "market-neutral pairs" theme. Adding generic ETH rounds is just breadth. |

---

## 4. Fifty feature ideas, ranked by how load-bearing MagicBlock is

Depth values:
- **core:** can't be built without MagicBlock.
- **partial:** MagicBlock is materially involved.
- **surface:** MagicBlock is visible but swappable.

| # | Idea | What it does | MagicBlock capability | Depth | Why a MagicBlock judge notices |
|---|---|---|---|---|---|
| 1 | Sealed positions until lock | Player positions stay private until `end_ts−5`; a crank then flips permissions public | PER + crank | core | Private prediction market, a recurring winning theme |
| 2 | Private heartbeat vault | bpm is visible only to its owner; settle publishes just `calm: bool` | PER + session keys | core | Biometric privacy with on-chain enforcement |
| 3 | Per-player settle crank | Each player's own task runs `settle_player` every 30 s, so no keeper is needed | Crank | core | Payouts arrive with nobody clicking or relaying |
| 4 | Crank TP/SL on shares | Stop-loss and take-profit on YES/NO positions, checked on every crank tick | Crank + ER + session | core | Ghost Stops-style orders inside a 5-minute market |
| 5 | 30-second flash rounds | Second arena with 30 s rounds and a 500 ms crank | Oracle + crank + ER | core | Impossible on base-layer latency |
| 6 | On-chain price tape | Crank writes an oracle sample every 2 s to a ring buffer; chart and disputes read it | Crank + oracle | core | A verifiable chart, not an off-chain feed |
| 7 | Volatility-scaled Calm pulse | Calm bonus grows with oracle-measured BTC range while bpm stays < 120 | Oracle + crank | core | "Stay calm in chaos", measured inside the ER |
| 8 | Fair Cheers v2 | Candidate set forced to all of `arena.recent`; VRF picks 10 of 15 | VRF | core | Randomness that actually decides; fixes 1.3 #1 |
| 9 | VRF card drops | Each win rolls a card rarity; inventory in Player enforces scarcity | VRF + ER | core | Provably fair loot with real card scarcity |
| 10 | VRF round draft | At round open the crank requests VRF and deals 2 cards per active player | VRF + crank | core | Crank and VRF chained with no server |
| 11 | eSPL chips | CHIP mint; buy/sell move eATA balances inside the ER | eSPL | core | The docs' custody model for prediction markets |
| 12 | Cash out to Solana | `commit_and_undelegate` plus an action that withdraws the eATA to the wallet | eSPL + Magic Actions | core | A full round trip from ER to wallet |
| 13 | Badge record action | Commit Player; a post-commit action updates a base `BadgeRecord` PDA | Magic Actions | core | Durable achievements with no relayer |
| 14 | Round archive action | `commit_arena` plus an action appending rounds to a base `RoundArchive` beyond 64 slots | Magic Actions | core | Complete history anyone can query on base |
| 15 | 1 Hz heartbeat stream | `report_heart` every second at fee 0, with a live tx counter | ER (gasless) | core | Makes "why an ER" obvious |
| 16 | Heartbeat duels | 1v1 calm-off in an ephemeral account; result committed to both Players | Ephemeral accounts + ER | core | New primitive, product-native |
| 17 | Treasury refill action | On `ArenaPaused`, commit plus an action that tops up from a base house vault | Magic Actions | partial | Self-healing economy |
| 18 | Tilt lock | Reported bpm > 150 blocks buys for 60 s, enforced at ER speed | ER + session | partial | Health-aware trading, real-time |
| 19 | ER-only round chat | Messages are player-sponsored ephemeral accounts, closed after the round | Ephemeral accounts + session | partial | Documented social pattern, on-chain chat |
| 20 | Hype meter | Emoji taps go to an ephemeral per-round account and are discarded at roll | Ephemeral accounts | partial | Cheap real-time crowd signal |
| 21 | BTC-vs-SOL pair rounds | Resolves on relative move of two feeds (SOL/USD `ENYwebBT…`) | Oracle | partial | FIXED and VERIFIED (UI-07): median of real getSlot RTTs to devnet-as (139-160 ms observed, non-constant) and requestAnimationFrame FPS |
| 22 | Confidence-aware lock | Oracle `conf` widens the trade lock when spreads blow out | Oracle | partial | Uses oracle data beyond price |
| 23 | Fee-vault commits | Delegated fee payer plus `magic_fee_vault` removes the 10-commit cap | Commit economics | partial | Shows the team read the fee model |
| 24 | Commit receipts | Each ER commit is shown with its base commitment sig via `GetCommitmentSignature` | Commit | partial | Settlement a judge can verify |
| 25 | Idle auto-undelegate | Per-player crank undelegates after 24 h idle | Crank + undelegate | partial | Lifecycle hygiene, reclaims deposits |
| 26 | Multi-region arenas | Arenas on the asia, eu and us validators; router picks per player | ER + router | partial | Global latency story |
| 27 | Session spend caps | Per-round max spend enforced for session-signed buys | Session keys | partial | Safe one-tap trading |
| 28 | Squad pools | Squad members see each other's positions in a PER | PER | partial (borderline forced) | Group privacy |
| 29 | Private PnL opt-in | Leaderboard shows rank; PnL hidden in a PER | PER | partial (borderline forced) | Privacy on a social surface |
| 30 | eSPL Cheers | Cheers paid as CHIP tokens into recipients' eATAs | eSPL + VRF | partial | Real token gifts |
| 31 | Weekly prize crank | Crank snapshots the top 10, then an action pays out on base | Crank + Magic Actions | partial | Automated seasons |
| 32 | Wearable-signed bpm | Device key signs samples; program or TEE verifies the signature | PER (optional) | partial | Moves heart rate toward trustworthy (needs signing hardware) |
| 33 | VRF mystery duration | Round length drawn from 3–7 min at open | VRF + crank | partial | Game-feel twist |
| 34 | SOAR mirror | Badges pushed to SOAR by a Magic Action | Magic Actions + SOAR | partial | Uses MagicBlock's open-source identity program |
| 35 | Streak insurance card | Crank auto-protects at round end once streak ≥ 5 | Crank | partial | Card mechanics without a server |
| 36 | `/proof` live page | Router delegation, last crank roll, commits, oracle age, VRF randomness | Router + all | surface | One page of verifiable claims |
| 37 | Router-routed client | All web txs go through the router, which shows the fqdn | Router | surface | Correct production wiring |
| 38 | Revoke session | Gum revoke on base; program rejects the old key | Session keys | surface | Security UX |
| 39 | ER spectator view | Arena `onAccountChange` from the ER WebSocket at ER speed | ER | surface | Visible speed |
| 40 | "Fast hands" badge | First trade within N ER slots of `RoundOpened` | ER | surface | Latency as gameplay |
| 41 | Labeled ER bots | Bots trade through session keys, tagged as bots | Session + ER | surface | Honest liquidity |
| 42 | Session top-up onboarding | Guest wallet funds the session through a lamports top-up | Lamports top-up | surface | Smoother onboarding |
| 43 | Share card with ER sig | Win card links the ER tx and base commit | ER + commit | surface | Social proof |
| 44 | PWA one-tap trading | 24 h session plus Web Bluetooth on mobile | Session keys | surface | Mobile demo |
| 45 | Private tips (stealth handles) | Tip another trader's handle | Private payments | surface, **forced** | Only if privacy is the pitch |
| 46 | Buy chips with USDC swap | Swap API into CHIP | eSPL swap | surface, **forced** | Breadth only |
| 47 | AI coach | Agent reads on-chain stats and suggests cards | none essential | swappable | Product polish |
| 48 | Referral chips | `claim_chips` bonus for referrals | none essential | swappable | Growth |
| 49 | Badge frames | Cosmetic avatar frames per badge | none essential | swappable | Retention |
| 50 | Chat mute lists | Mongo-side moderation | none | swappable | Hygiene |

---

## 5. Top 5 to build next (~6 hours total)

**Prerequisite, not new MagicBlock work.** None of this reaches a judge until `apps/web` calls the flows that already work: `ensurePlayerDelegated`, `createSessionKey`, `buy`/`sell`, `reportHeart` and `settlePlayer`. The web agents own that work, and this audit does not re-scope it. All five items below leave the zero-copy Arena layout untouched, so no re-bootstrap is needed.

After every upgrade:
- Refresh the IDL copies in `packages/arena-sdk/src/idl` and `apps/arena/idl`.
- Re-verify behavior on the ER; PLAN §5 notes the ER may serve old bytecode.

### 5.1 Fair Cheers v2 plus a live VRF proof (~1 h)

**Program changes:**
- `constants.rs:49`: raise `MAX_CHEERS_CANDIDATES` from 12 to 15.
- `request_cheers` (`lib.rs:598`): require `remaining_accounts.len()` to equal the count of non-default `arena.recent` entries other than the winner. The existing checks already enforce membership and uniqueness; this adds completeness, so the caller can't curate.
- `cheers_callback` and `math::pick_recipients` stay unchanged. VRF now excludes up to 5 of 15.
- Test whether the ER accepts `payer` as `mut`. If it doesn't, drop `mut` (`lib.rs:1003`).

**Accounts:**
- Arena (read `recent`)
- winner Player (write)
- candidate Players (write via callback metas)
- VRF ephemeral queue `5hBR571x…` (write)
- payer signer

**Client and proof:**
- `tx.ts:184`: derive candidates from `fetchArena().recent`.
- Extend `e2e-cheers-vrf.ts` to 12+ players at 0.05 SOL each.
- Append the `CheersPaid` tx sig and randomness to `docs/E2E-RUN.md`.

### 5.2 Per-player settle crank (~1.5 h)

**New ER instruction:** `schedule_player_settle(task_id, interval_ms, iterations)` with `#[derive(Accounts, Session)]`.
- Accounts: `signer` (owner or session, acts as task authority), `arena`, `player` (write), `magic_program`.
- Mirror `lib.rs:752-786`, with the scheduled instruction set to `settle_player` [arena w, player w]. That instruction is already permissionless and idempotent.
- Parameters: interval 30,000 ms, 2,880 iterations (24 h).
- Task id: `crankTaskId("settle:"+playerPda)` (`tx.ts:352`). Don't store it in Player; a Borsh size change would break existing accounts.

**Client:** call it once right after `claim_chips`.

**Proof:** after a roll, the balance moves and a `PositionSettled` event appears in a tx the player never sent.

**Risks to verify:**
- Does a session key work as the task authority?
- How much does per-tick Arena write-lock contention cost?

### 5.3 Badge record via Magic Action (~2 h)

**New account:** `BadgeRecord` PDA `["badges", owner]` on base, holding `owner`, `badges u32`, `best_streak u16`, `calm_wins u32`, `trades_total u32`. It's created by `init_badge_record` (base, owner pays), which the client batches with `init_player`.

**New base instruction:** `record_badges` with an `#[action]` context.
- `badge_record` (write) and `player` (`UncheckedAccount`, a PDA check, parses the committed bytes).
- The merge is monotonic (OR the bits, max the counters), so a retry can't double-grant.

**New ER instruction:** `commit_player_badges` with a `#[commit]` context: `owner` signer, `player` (write), `badge_record` unchecked, `program_id` (`address = crate::ID`).
- `MagicIntentBundleBuilder::new(owner, magic_context, magic_program)`
- `.commit(&[player])`
- `.add_post_commit_actions([CallHandler{ destination_program: crate::ID, accounts: [badge_record w, player r], args: ActionArgs::new(RecordBadges data), escrow_authority: owner, compute_units: 200_000 }])`
- `.build_and_invoke()`

**Proof:** base `BadgeRecord` changes after the ER sig, and both are recorded.

**Before relying on it:** confirm how the owner escrow is funded (skill `references/fees-and-commit-economics.md` §4).

### 5.4 Live `/proof` with router and commitment signatures (~1 h, no program change)

**Reads:**
- `getDelegationStatus` (`connections.ts:25`) for Arena and the viewer's Player, which gives the router its first real call site.
- Arena from the ER and from base (`lastRollTs`, `crankTaskId`, `commits`, `current`).
- Oracle `71wtTRDY…` via `subscribeOraclePrice` (`oracle.ts:71`).
- Latest `CheersPaid` from the indexer or ER logs.
- Base commitment sigs via `GetCommitmentSignature` from `@magicblock-labs/ephemeral-rollups-sdk`, which turns that unused dependency into a used one.

**Where:** new route `apps/web/app/proof/page.tsx`. Coordinate with the web agents.

**Proof:** verify in a live browser with a clean console and network log.

### 5.5 Cash out to Solana plus uncapped commits (~1 h)

**Verify `undelegate_player` live (`lib.rs:843`):**
- Script steps: undelegate, then `waitForUndelegation` (`connections.ts:72`), then read Player on base, then `ensurePlayerDelegated` again.
- Record all signatures.

**`commit_arena`:** add `.magic_fee_vault(magic_fee_vault)` to the builder (`lib.rs:819`), plus a delegated keeper fee payer topped up with `lamportsDelegatedTransferIx`. That's Path B in the skill's fees reference.
- Accounts: keeper fee-payer (delegated), validator `magic_fee_vault`, `MagicContext`, Magic program, Arena.

**Proof:** a script sends 11 commits and shows that the 11th, which used to fail, lands. Surface an "on Solana" chip in the UI.
