# Rogs Arena: MagicBlock Solana Blitz v8 submission guide

**Deadline:** 2026-09-13, 18:00 IST (12:30 UTC).
**Form:** https://build.magicblock.app/?stage=blitz#submit (login required).

## Before you open the form (about 20 minutes)

1. **Record the video.** Follow the 5-minute script below, upload it to YouTube (unlisted is fine) or Loom, and copy the link.
2. **Make the repo visible to judges.** `nickthelegend/rogs-arena` is private. Either make it public (GitHub → Settings → Danger zone → Change visibility) or the judges cannot open it.
3. **Check the website.** Open https://rogs-arena-app.vercel.app once and confirm the arena loads with live prices.
4. **Have ready:** your Telegram handle(s) and your Solana wallet address.

## Form answers (copy and paste)

### Project name
Rogs Arena

### One-line description
A social 5-minute UP/DOWN prediction arena on nine coins. Every trade, ability card, settlement and badge runs on a MagicBlock Ephemeral Rollup, with no wallet popups after sign-in.

### Description
Rogs Arena turns short-term price calls into a live multiplayer game.
- **The game:** every coin (BTC, ETH, SOL, BNB, XRP, DOGE, SUI, AVAX, LINK) runs back-to-back 5-minute rounds. You buy UP or DOWN shares from an on-chain AMM, play ability cards (Double price, Protect loss, Calm pulse, Cheers), exit with take profit or stop loss, and get settled when the round resolves.
- **The social side:** a live leaderboard of open positions, chat, trader presence, badges and a round history make it feel like a trading floor rather than a form.

Everything happens on Solana devnet through MagicBlock:
- **Ephemeral Rollups:** all nine Arena accounts and every Player account are delegated to the MagicBlock ER. Trades confirm in about 250 ms and cost nothing.
- **Session keys:** after one sign-in and one delegation transaction, a 24-hour session key signs every trade, so there are no wallet popups.
- **Oracle:** strike and close prices come from MagicBlock price feeds read inside the rollup.
- **Scheduled tasks:** a MagicBlock crank calls `roll_round` inside the ER for every market, so no server rolls the rounds.
- **VRF:** Fair Cheers winners are picked by MagicBlock VRF from the complete candidate set.
- **Magic Actions:** "Save to Solana" commits the player back to Solana, and a post-commit action writes the player's badges into a BadgeRecord account on the base layer.
- **Commits:** arenas and players are committed to Solana, with commit receipts in the UI.
- **Real heart rate:** the Wearable pane reads a real fingertip pulse sensor (CELL-4B on a Raspberry Pi, over Wi-Fi) or any Bluetooth heart-rate monitor. The session key writes the bpm on-chain every few seconds, and the program pays the Calm pulse card only for a fresh on-chain reading under 120 bpm.

Stack: an Anchor program, a Bun service (indexer, keeper, price sampler, REST and WebSocket, MongoDB) on Railway, and a Next.js frontend on Vercel.

### Categories (pick the closest ones offered, up to 3)
Gaming · Consumer · DeFi

### Website
https://rogs-arena-app.vercel.app

### GitHub repo
https://github.com/nickthelegend/rogs-arena

### Pitch and demo
Your video link.

### Explorer link
https://explorer.solana.com/address/J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q?cluster=devnet

### Program addresses
Program (Solana devnet): `J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q`

Market arenas, all delegated to the MagicBlock ER:

| Coin | Arena account |
|---|---|
| BTC | `ApzYL11HC9puv4dbFk1QTCrE4wpLup8ta9QE2UKde2CJ` |
| ETH | `GfJreHenZExBN2WgmN8kxBr5WK71Ua9v9jMnVQ8d6cHE` |
| SOL | `J4SQ3hom8asmomsJDPNdZCnXnRzQCGwPAW2CM8MENaNa` |
| BNB | `HSX18kkatkiMvphF8QAUjkMJGSpW9p3FP3VAgja8WVLt` |
| XRP | `BuQZihto9U9E8ujfWsVMtgZgt4TFnvYqZ4nzC85LRgwr` |
| DOGE | `djrjxYeX71CMzPhJD3eRQZar3YdvKEjukLScLaGRqDf` |
| SUI | `6W7KxzZr3aJmP6qviLM7EzwDAeQMYxu12Yirt9GgD4qC` |
| AVAX | `D132hR1x8v2E9uMf6AajrgMKxyTsvXDkcockypZeatfR` |
| LINK | `6BYKgZ5yzcWJaJRfiWXsdMB11BJA1MKjQ1eFP8xBDQMc` |

### Team Telegram handles and submitter wallet
Your own details.

## The 5-minute video

### Set up (10 minutes before recording)
- **Browser:** Chrome, a 1440×900 window, page zoom 100%, and the Phantom extension set to **devnet** holding about 0.05 devnet SOL. Use a fresh profile or clear site data for the site first.
- **Site:** the live site, or `localhost:3000` with the local stack running. The five demo traders ("Rogbots") keep the arena busy: `bun scripts/demo-activity.ts 60 <service url>` from `apps/arena`.
- **Explorer tab:** open the Solana Explorer program link above in a second tab.
- **Round timing:** start recording when the BTC round has about 3:30 left, so the round ends during the settlement part of the script. The countdown is in the top island.
- **Pulse clip (record separately on `localhost:3000`):**
  - The live https site cannot reach a device on your home network, so the heart segment is its own local clip, spliced in at 2:10.
  - Before recording, check that `http://192.168.1.22:8765/pulse` shows `"present": true` with a bpm.
  - For a clean reading, put your hand and forearm flat on the table, touch the sensor with almost no pressure, shade it with your other hand, and stay still for about 20 seconds. Rub your hands first if your fingers are cold.
- **Afterwards:** cut dead time when editing.

### Script

#### 0:00–0:20 Intro
- **Show:** the site loading (Rog frog over ROGS), or a title card.
- **Say:** "This is Rogs Arena: a social prediction arena where you call UP or DOWN on nine coins every five minutes. On a normal chain every click would be a wallet popup and a few seconds of waiting. Here everything runs on a MagicBlock Ephemeral Rollup, so it plays like a game."

#### 0:20–0:45 The live arena
- **Point at:**
  - the BTC logo and live oracle price, and the tab title;
  - the UP/DOWN odds chart;
  - the leaderboard of open positions;
  - chat;
  - the traders count;
  - the "ER RTT … ms" readout.
- **Say:** "Prices come from MagicBlock oracle feeds read inside the rollup. These are live traders and live chat. The Rogbots are our demo wallets, trading on devnet through exactly the same paths as you."

#### 0:45–1:20 Connect a wallet
- **Do:** click **Connect wallet** → Phantom → approve the sign-in message.
  - The island steps through SIGNING IN → JOINING ROLLUP → CREATING SESSION → CLAIMING CHIPS → "… SOL (devnet) · 250 chips".
  - Approve the two transactions Phantom asks for.
- **Say:** "One message to sign in. One transaction delegates my player account to the rollup, and one creates a session key. After this I never see a wallet popup again."
- **Optional:** in the explorer tab, show the delegation transaction.

#### 1:20–1:45 Trade on the rollup
- **Do:** **Trade** → **Buy UP** with $5. The status line reads "Bought … YES for $5.00 in ~250 ms on the MagicBlock ER." Click the status line's transaction link.
- **Show:** the ER explorer, where the signer is the session key, not the wallet. Back in the arena, your position is on the leaderboard.
- **Say:** "A quarter of a second, gasless, no popup."

#### 1:45–2:10 Ability cards
- **Do:** reveal **Double price** and drag it onto the island: "Double price attached …". Then drag a second card: rejected, "An ability card is already attached to this position".
- **Say:** "Cards are enforced by the program itself:
  - one card per position, and none in the last 30 seconds;
  - Double price doubles the payout;
  - Protect loss refunds part of a loss;
  - Calm pulse pays when a heart-rate wearable reports under 120 bpm;
  - Cheers pays a random winner chosen with MagicBlock VRF."

#### 2:10–2:45 Real pulse: Calm pulse (local clip)
- **Do:** on `localhost:3000`:
  1. Open a small position with the **Calm pulse** card attached, before the last 30 seconds of the round.
  2. Click **Wearable** in the island; it reads "CELL-4B pulse sensor over Wi-Fi".
  3. Rest your fingertip lightly on the sensor.
- **Show:**
  - Your bpm appears in the island and next to your name in the traders list, updating every couple of seconds.
  - Keep the finger steady through the round end. The settlement message then says whether Calm pulse paid ("Calm pulse paid $…: your on-chain heart rate stayed under 120 bpm") or why it did not.
- **Say:** "This is a real pulse sensor on a Raspberry Pi, streaming over Wi-Fi. My session key writes my heart rate on-chain every few seconds. Stay calm under 120 bpm and win, and the Calm pulse card pays a bonus. The program checks the on-chain value, not the website."

#### 2:45–3:05 Social and nine coins
- **Do:** send a chat message. Open the coin board (9 coins with live prices and round timers), switch to **SOL**, and stay about 5 seconds.
- **Say:** "Nine markets. Each one is its own delegated arena with its own oracle feed and crank."

#### 3:05–3:20 Take profit or stop loss
- **Do:** open a small position and press the TP/SL button. The status line reads "Sold … in ~300 ms on the MagicBlock ER."
- **Say:** "Exits sell straight back into the on-chain AMM."

#### 3:20–3:50 Round end and settlement
- **Do:** switch back to BTC, where you still hold the UP position, and let the countdown reach zero.
  - The board freezes on the result and the new round opens with a fresh strike.
  - The island shows "Settled 1 position: paid $…, P/L …".
- **Say:** "No server rolls the rounds. A MagicBlock scheduled task calls roll_round inside the rollup, then the position is settled on the ER."

#### 3:50–4:15 Save to Solana (Magic Action)
- **Do:** click **Save to Solana**. It shows "Waiting for the Magic Action on Solana…", then "Saved by a MagicBlock Magic Action · rollup tx · Solana tx". Open the Solana tx.
- **Say:** "The rollup commits my player back to Solana, and a Magic Action writes my badges into an account on the base layer in the same flow."

#### 4:15–4:40 Proof page
- **Do:** click **MagicBlock proof** in the footer.
- **Show:** all 9 arenas marked delegated, crank task ids, oracle prices a few seconds old, the VRF Cheers panel and commits.
- **Say:** "Everything on this page is read live from devnet, the rollup and the MagicBlock router."

#### 4:40–5:00 Close
- **Show:** the program id and repo link (or the architecture list from the description).
- **Say:** "Rogs Arena: Ephemeral Rollups, session keys, oracle, VRF, scheduled tasks and Magic Actions, all in one game. Built for MagicBlock Blitz v8."

### What not to claim
- **Heart rate:** show the bpm only from a clean, steady sensor reading in the local clip. Don't claim the live website reads the sensor; browsers block an https page from calling a device on your home network.
- **Rogbots:** they are automated demo wallets. Their transactions are real, but say what they are.
