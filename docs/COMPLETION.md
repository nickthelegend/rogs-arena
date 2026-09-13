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
| 21 | Web | Coin selector for nine markets, verified in the browser | NOT VERIFIED | MK-09 |
| 22 | Web | Trade a non-BTC market from the UI | NOT VERIFIED | MK-10 |
| 23 | Web | Proof page for nine markets | NOT VERIFIED | MK-11 |
| 24 | Web | ROGS branding, frog mascot, icon | NOT VERIFIED | BR-01, BR-02 (headless screenshots exist; browser pass pending) |
| 25 | Web | Core flows regression on the multi-market build (guest, buy/sell, TP/SL, abilities, chat, leaderboard, history) | NOT VERIFIED | UI rows passed on the pre-multi-market build |
| 26 | Web | Lint clean | NOT DONE | 10 errors, 6 warnings — being fixed |
| 27 | Web | Zero console and network errors on the new build | NOT VERIFIED | — |
| 28 | Web | Price chart labels readable | NOT DONE | Change label hidden under the price badge — being fixed |
| 29 | Web | Usable mobile layout | NOT DONE | 390 px is a 27% zoom of desktop — being fixed |
| 30 | Web | Badge Magic Action and commit receipts reachable in the UI | NOT DONE | Script-only today |
| 31 | Deploy | Current frontend live on Vercel | BLOCKED | Every Vercel deploy since 00:24 UTC sits in UNKNOWN with no build; production serves an old build |
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
