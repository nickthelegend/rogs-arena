# Rogs Arena — honest completion measurement

What "100%" means here comes from the project itself: `PLAN.md`, the Blitz v8 rules (every submission must integrate MagicBlock Ephemeral Rollups), and the owner's requests. Those requests are to keep every rizz-club UI component, run nine coin markets including SOL, rebrand to ROGS with a new mascot, host the frontend on Vercel and the backend on Railway, and use no mocks.

An item counts only when it has been **verified against the real system** (devnet, the MagicBlock ER, the live Railway service, or a browser on the real app). Anything that merely exists, compiles, or passed on older bytecode or an older build is **not** counted.

## Baseline — 2026-09-13 05:55 UTC

| # | Area | Item | Status | Evidence / gap |
|---|---|---|---|---|
| 1 | Chain | Nine market arenas delegated to the MagicBlock ER | DONE | MK-01 |
| 2 | Chain | Strike and close from the MagicBlock oracle inside the ER, nine feeds | DONE | MK-02, MK-03, CH-04 |
| 3 | Chain | Crank rolls every market with no manual roll | DONE | MK-04 (after each of the three upgrades) |
| 4 | Chain | Player delegation, Gum session keys, gasless ER trades | DONE | E2E 20/20 (Run 3), CH-05/06/10 |
| 5 | Chain | Program guards (limits, slippage, locks, ability rules, authority) | DONE | test-guards 17/17 on upgrade #3 bytecode (CH-07, 09, 11, 12, 13, 15, 16, 17, 21, 23) |
| 6 | Chain | Ability bonuses (Double, Protect, Calm) | DONE | CH-19 (Run 3), E2E Calm bonus |
| 7 | Chain | Fair Cheers v2 through MagicBlock VRF | DONE | MG-01 (two live runs), MG-02 |
| 8 | Chain | Keeper-driven Cheers under Fair Cheers v2 | DONE | MG-07: keeper settled, requested with the full candidate set, VRF callback paid, indexer stored it |
| 9 | Chain | Commits to Solana (player and arena) | DONE | E2E commit_player; keeper commit 7/9 (MK-08) |
| 10 | Chain | Player undelegate and re-delegate | DONE | Re-run on upgrade #3 bytecode (05:58 UTC): undelegated to Solana with 250 USD intact, router isDelegated false, re-delegated with balance intact |
| 11 | Chain | Badges written on Solana by a Magic Action | DONE | MG-03, MG-04 |
| 12 | Chain | Commit receipts via GetCommitmentSignature | DONE | MG-05 |
| 13 | Chain | Multi-market authority and account guards | DONE | MK-05 |
| 14 | Chain | Upgrades verified byte for byte; reproducible build | DONE | MK-00, MG-06, MG-08 |
| 15 | Service | REST API including markets | DONE | MK-06 |
| 16 | Service | WebSocket realtime including market switch | DONE | MK-07 |
| 17 | Service | Indexer persistence per market | DONE | MK-06 (ETH round 5 trades and settlements indexed), IDX-01/02 |
| 18 | Service | Keeper settle, roll and commit per market, honest logs | DONE | MK-08, CH-19 settled by keeper |
| 19 | Service | Auth, profile, faucet, chat on the redeployed service | DONE | verify-live-api 17/17 and verify-live-ws 11/11 against production after the multi-market redeploy |
| 20 | Service | Railway deployment healthy | DONE | /health ok, 9 markets available |
| 21 | Web | Coin selector for nine markets, verified in the browser | DONE | MK-09 (Claude in Chrome: URL, board switch, persistence, scoped requests; headless 390 px) |
| 22 | Web | Trade a non-BTC market from the UI | DONE | MK-10: guest SOL buy from the island, ER tx writes the SOL arena, keeper settled it |
| 23 | Web | Proof page for nine markets | DONE | MK-11 |
| 24 | Web | ROGS branding, frog mascot, icon | DONE | BR-01, BR-02 |
| 25 | Web | Core flows regression on the multi-market build (guest, buy/sell, TP/SL, abilities, chat, leaderboard, history) | IN PROGRESS | Found and fixed a real bug: returning guests stalled in setup (stale player read). Passing so far: fresh-guest join, SOL buy + keeper settlement, chat (Claude in Chrome and headless), outage resilience, selector, proof, badges. Re-running verify-fixes, flow, ws-browser after the fix |
| 26 | Web | Lint clean | DONE | `bunx eslint .` 0 problems, tsc clean, 261 tests, build with no warnings |
| 27 | Web | Zero console and network errors on the new build | NOT VERIFIED | — |
| 28 | Web | Price chart labels readable | DONE | Plot starts below the label; final-1440-btc-top.png / final-1440-doge-top.png reviewed |
| 29 | Web | Usable mobile layout | DONE | Stacked single column below 768 px; headless 390 px: no overflow, bottom-sheet selector, SOL switch, 0 errors |
| 30 | Web | Badge Magic Action and commit receipts reachable in the UI | DONE | MG-09: two saves from the badges panel, Solana txs ran RecordBadges, record tracks the new trade |
| 31 | Deploy | Current frontend live on Vercel | DONE | https://rogs-arena-app.vercel.app serves the fix build 566d698 (deployment c43s0zrrh, READY). Railway CORS allows the origin, and the WebSocket accepts it. Live page: 0 console errors, all requests 200. A returning guest joined on production in 4 s. GitHub main pushed to 566d698 |
| 32 | Docs | Test plan, API contract, brand prompts | DONE | docs/TEST-PLAN.md, docs/ARENA-API.md, docs/brand/PROMPTS.md |
| 33 | Docs | MagicBlock audit with the ranked 50 | DONE | docs/MAGICBLOCK-AUDIT.md (refreshed) |

**Baseline: 18 of 33 verified = 55%.**

By area:
- **On-chain and MagicBlock:** 11/14.
- **Service:** 5/6.
- **Web:** 0/10.
- **Deploy and docs:** 2/3.

Web scores zero because it changed substantially (nine markets, selector, branding) and has not yet been re-verified in a browser.

## Progress log

- **05:59 UTC — 20 of 33 = 61%.** Items #10 and #19 were re-verified on the current bytecode and the redeployed service.
- **06:05 UTC — 21 of 33 = 64%.** Item #5: program guards 17/17 on the size-optimized upgrade #3 bytecode.
- **06:09 UTC — 22 of 33 = 67%.** Item #8: keeper-driven Fair Cheers v2 on XRP (MG-07).
- **06:24 UTC — 30 of 33 = 91%.** Items #21–#24 and #26–#30 were verified in the browser on the local production build and on-chain. Left: #25 (core-flow regression sweep), #27 (zero console and network errors across every flow), #31 (Vercel).
- **06:58 UTC — still 30 of 33.** Vercel is no longer blocked: a fresh project built READY. The regression sweep found a returning-guest setup bug, now fixed and being re-verified live.
- **07:03 UTC — 31 of 33 = 94%.** Item #31: the fresh Vercel project is live with the returning-guest fix and verified in the browser. Left: #25 and #27, which wait on the verify-fixes, flow and ws-browser re-runs against the fix build.
