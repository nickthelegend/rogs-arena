# Rogs Arena: skeptical judge pass

A five-minute pass on 2026-09-13 (10:50–11:15 UTC), done the way a Blitz v8 judge would, against the live app (https://rogs-arena-app.vercel.app), the Railway service and devnet. Every claim below was observed or re-run in that window; nothing is taken from older notes.

## What a judge sees in five minutes

| Minute | Action | Observed |
|---|---|---|
| 0–1 | Open the site | Loading screen (Rog frog, ROGS), then the arena. Live BTC price with coin logo in the tab title, chart with price history, 5 labelled Rogbots on the leaderboard, chat arriving, "6 traders". 0 console errors |
| 1–2 | Play as guest | SIGNING IN → FUNDING SOL (real faucet transfer) → JOINING ROLLUP → CREATING SESSION → "0.0136 SOL (devnet) · 250 chips" in 6 s |
| 2–3 | Buy UP $5, chat | "Bought 10.3 YES for $5.00 in 270 ms on the MagicBlock ER." No popup. The chat message appears |
| 3–4 | Wait for the round end, switch to SOL | The keeper settles: "Settled 1 position: paid $10.31, P/L +$5.31." The SOL switch updates URL, title, logo, chart history and odds |
| 4–5 | Save to Solana, proof page | "Creating your badge record… Committing your player… Waiting for the Magic Action… Saved" in 7 s. `/proof` shows 9 delegated arenas, oracle prices 2–7 s old, crank task ids, VRF Cheers payouts, commits and live indexer status |

## Scores

| Criterion | Score | Why |
|---|---|---|
| Creativity | 8/10 | Heart-rate-gated abilities, VRF social gifting and a trading-floor social layer are unusual for a Blitz trading app. The core game (binary up/down rounds) is familiar |
| Technical depth | 9/10 | Seven MagicBlock capabilities do load-bearing work: delegation, session keys, oracle inside the ER, scheduled crank, VRF, commits and Magic Actions. Guards 17/17 and market guards 6/6 on devnet, 32 Rust unit tests, ability bonuses paid to the micro-dollar on-chain |
| Showcases Solana and MagicBlock | 9/10 | The ~250 ms, popup-free trade is visible and obviously impossible on the base layer. The proof page makes every claim checkable |
| Demo and UX | 8/10 | A polished inherited rizz-club UI, nine coins, a mobile layout, and no extension required. Arena snapshots take up to ~0.6 s over the free Atlas tier |
| Honesty | 9/10 | Bots are labelled and do real transactions. The README states the limitations: devnet only, self-reported heart rate, helper keeper, off-chain social data |

## Dealbreakers found

1. **The repository was private.** A judge cannot read the code or the verification scripts. **Status:** the owner has to change visibility; it cannot be done without their go-ahead.
2. **The README described the old Somnia/dreamDEX product.** A judge landing on GitHub would think the port was never done. **Status:** fixed; the README was rewritten with pitch, MagicBlock map, architecture, run steps, addresses, verification and limitations.
3. **The devnet end-to-end script failed at Cheers** (`CheersCandidatesIncomplete`). Once other traders were active, it sent an incomplete candidate list. The live keeper was paying Cheers correctly. **Status:** fixed in `packages/arena-sdk/scripts/e2e-devnet.ts`; the re-run is recorded in `docs/COMPLETION.md`.

## Deductions

- **Heart rate is self-reported.** The CELL-4B pulse bridge is real, but only reachable from a local build, and a steady reading was not captured during this pass.
- **Settlement relies on a keeper for convenience.** It is permissionless, but a judge may ask what happens if Railway is down. Answer: players can settle themselves, and rounds still roll through the scheduled task.
- **The MongoDB free tier is the slowest link.** Earlier today a round-sync write storm throttled it (sign-in took 35 s); it was fixed and redeployed, and sign-in now takes 0.4 s.

## Polish that lands

- Coin logos next to every price.
- A proof page with live ages and explorer links.
- Commit receipts in the UI.
- Exact status lines with measured milliseconds.
- A consistent frog mascot and ROGS branding.

## Single biggest blocker

Repository visibility. Everything else a judge checks is live and verifiable.

## Verdict

**Place, as a top-three contender**, provided the repo is public and the video shows the rollup trade, a settlement, Save to Solana and the proof page.
