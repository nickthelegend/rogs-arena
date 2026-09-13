# Rogs Arena: demo video flow (about 3 minutes)

Everything in this video is live on Solana devnet and the MagicBlock Ephemeral Rollup (ER). Nothing is mocked or pre-recorded.
- **Messages:** each status message on screen is produced by a confirmed transaction.
- **Links:** each explorer link opens that transaction.
- **Rehearsal:** the flow below was rehearsed end to end on 2026-09-13 in the Claude Browser pane with a real devnet wallet, and every step was checked on-chain. See `TEST-PLAN.md` Run 4 and Run 5.

## Before you hit record

1. **Service:** the local service runs on :8787, with the indexer and price sampler. Check that `curl localhost:8787/health` shows `ok: true` and 9 markets.
2. **Web:** the production build runs on :3000 (`bun run start` in `apps/web`).
3. **Demo traders:** `bun scripts/demo-activity.ts 60 http://localhost:8787` (from `apps/arena`) keeps five "Rogbot" wallets trading, using ability cards and chatting.
   - They are real devnet wallets sending real ER transactions.
   - Say so in the video: they exist so the arena is busy on camera.
4. **Wallet:** use Phantom (or Solflare/Backpack) set to **devnet**, holding about 0.05 devnet SOL, in the browser you record. The app lists it through Wallet Standard.
   - For an automated run without an extension, the Rogs Demo Wallet (`apps/arena/scripts/demo-wallet.ts`) registers a real devnet keypair through the same Wallet Standard path. Its key stays in `~/.config/solana/rogs-demo-wallet.json` and the local signer answers only localhost:3000.
5. **Browser:** a fresh profile (or clear site data), a 1440×900 window, and the page zoom at 100%.
6. **Explorer tabs:** keep a Solana Explorer tab on devnet ready for the program `J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q`.

## Shot list

### 1. Hook (0:00–0:12)

- **Do:** load `localhost:3000`. The loading screen shows the Rog frog over ROGS, then the arena.
- **Proof on screen:** the price in the tab title is live.
- **Say:** "Rogs Arena is a 5-minute up-or-down prediction arena on nine coins. Every trade runs on a MagicBlock Ephemeral Rollup."

### 2. Live arena tour (0:12–0:30)

- **Do:** point at each part of the arena:
  - the coin logo and oracle price;
  - the UP/DOWN odds chart;
  - the leaderboard of open positions;
  - chat;
  - the "N traders" presence count;
  - the "ER RTT … ms" readout.
- **Proof on screen:** prices tick every second from MagicBlock oracle feeds, the Rogbot positions move, and chat arrives live.
- **Say:** "Prices come from the MagicBlock oracle inside the rollup. These traders and chat are live."

### 3. Connect a wallet (0:30–0:55)

- **Do:** click **Connect wallet**, choose the wallet, and approve the one sign-in message. The island steps through SIGNING IN → JOINING ROLLUP → CREATING SESSION → CLAIMING CHIPS → "… SOL (devnet) · 250 chips".
- **Proof on screen:**
  - One off-chain signature.
  - One Solana transaction creates the Player and delegates it to the ER.
  - One Solana transaction creates a 24-hour Gum session key.
  - The chips claim runs on the ER.
  - Rehearsal: all four steps in 13 s.
- **Say:** "One signature to sign in, one transaction to delegate my player to the rollup, and a session key, so I never see another wallet popup."

### 4. Trade on the rollup (0:55–1:15)

- **Do:** **Trade** → **Buy UP** ($5). The status line reads "Bought 9.1 YES for $5.00 in 252 ms on the MagicBlock ER." Click the status link.
- **Proof on screen:** the ER explorer shows the transaction signed by the session key, not the wallet. The leaderboard shows the new position.
- **Say:** "About 250 milliseconds, gasless, no popup. That is the ephemeral rollup."

### 5. Ability card (1:15–1:30)

- **Do:** reveal **Double price** and drag it onto the island.
  - With a position open, it attaches: "Double price attached to your BTC round position in … ms on the MagicBlock ER."
  - With no position open, it parks, and the next buy reads "Bought 9.3 YES for $5.00 in 323 ms on the MagicBlock ER. Double price rides on this position."
- **Proof on screen:** drag a second card and the program rejects it with "An ability card is already attached to this position".
- **Timing:** attach cards before the last 30 s of the round.
- **Say:** "Cards are on-chain modifiers. The program enforces one per position, and none in the last 30 seconds."

### 6. Social and multi-coin (1:30–1:45)

- **Do:** send a chat message. Open the coin board, which shows 9 coins with live prices and rounds, then switch to SOL.
- **Proof on screen:** the message appears for everyone. The URL, title, logo, chart and odds all switch to SOL.
- **Timing:** stay about 5 s on the new coin. The chart history arrives at once from the service's memory, while the leaderboard snapshot takes 2–4 s over the remote database.
- **Say:** "Nine markets, each its own delegated arena account with its own oracle feed and crank."

### 7. Take profit or stop loss (1:45–2:00)

- **Do:** open a position, then press the TP/SL button. The status line reads "Sold 9.3 YES for $4.90 in 298 ms on the MagicBlock ER."
- **Proof on screen:** the exit label and P/L colour match what the sale realizes.
- **Say:** "Exits sell back into the on-chain AMM, instantly."

### 8. Round end and settlement (2:00–2:25)

- **Do:** hold a position to the end of the round. Rehearsal: "Settled 1 position: paid $0.00, P/L -$5.00.", with a SettlePlayer ER transaction paid by the keeper.
  - The board freezes on the result.
  - The MagicBlock scheduled crank rolls the round inside the rollup.
  - The keeper settles, and the status line reads "Settled 1 position: paid $…, P/L …".
- **Proof on screen:** the round history adds the resolved round, and the new round's strike comes from the oracle.
- **Say:** "No server rolls the rounds. A MagicBlock scheduled task calls roll_round inside the rollup."

### 9. Save to Solana with a Magic Action (2:25–2:40)

- **Do:** click **Save to Solana**. The status line reads "Waiting for the Magic Action on Solana…", then "Saved by a MagicBlock Magic Action · rollup tx · Solana tx". Open the Solana tx.
- **Proof on screen:** the base-layer transaction wrote the BadgeRecord (saves counter +1).
- **Say:** "The rollup commits my player back to Solana, and a Magic Action writes my badges on the base layer in the same flow."

### 10. Proof page (2:40–2:55)

- **Do:** open **MagicBlock proof**.
- **Proof on screen:**
  - 9 coin arenas, each shown as delegated, with crank task ids, oracle prices seconds old, and current rounds.
  - ER delegation details.
  - Fair Cheers winners picked by MagicBlock VRF.
- **Say:** "Every value here is read live from devnet, the rollup and the router."

### 11. Close (2:55–3:05)

- **Do:** show the repo and the program id.
- **Say:** "Rogs Arena: Solana program plus MagicBlock ER, oracle, VRF, scheduled crank, session keys and Magic Actions."

## What is real, and what to say about it

| On screen | Real? | Notes |
|---|---|---|
| Prices, strikes, round results | Yes | MagicBlock oracle feeds read by the program inside the ER |
| Your trades, cards, exits, settlement | Yes | ER transactions with explorer links; settlement by the keeper or the player |
| Wallet connect, delegation, session key | Yes | Solana devnet transactions paid by the wallet |
| Save to Solana | Yes | ER commit plus a Magic Action transaction on Solana |
| Rogbot traders and their chat | Real transactions, automated players | Five labelled devnet wallets run by `demo-activity.ts`. They sign in, trade and chat through the same product paths. Call them demo traders |
| Heart-rate "Calm pulse" | Program rule is real | A wearable was not tested; don't claim a live wearable unless you record one |
