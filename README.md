# Rogs Arena

A social 5-minute UP/DOWN prediction arena on nine coins, built on **Solana devnet** and **MagicBlock Ephemeral Rollups**. Every trade, ability card, settlement, heart-rate reading and badge is a real transaction. After one sign-in there are no wallet popups, and trades confirm in about 250 ms.

Built for MagicBlock Solana Blitz v8 as a port of rizz-club, a BTC 5-minute social trading game. Every original UI system is kept: chart, dynamic island, leaderboard, chat, ability cards, progression, round history and wearable. Their data now comes from the chain.

![Overview](docs/overview.png)

| | |
|---|---|
| **Live app** | https://rogs-arena-app.vercel.app |
| **Proof page** (live MagicBlock evidence) | https://rogs-arena-app.vercel.app/proof |
| **Program** (Solana devnet) | [`J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q`](https://explorer.solana.com/address/J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q?cluster=devnet) |
| **Arena service** | https://arena-production-0bdd.up.railway.app/health |

## How it plays

1. **Enter.**
   - Click **Play as guest** (a devnet keypair funded by the arena faucet), or **Connect wallet** (Phantom, Solflare or Backpack on devnet through Wallet Standard).
   - Setup:
     - sign one message;
     - your Player account is created and delegated to the MagicBlock ER;
     - a 24-hour Gum session key is created;
     - 250 play-money chips are claimed on the rollup.
2. **Pick a coin.** BTC, ETH, SOL, BNB, XRP, DOGE, SUI, AVAX or LINK. Each runs back-to-back 5-minute rounds. The strike and close come from MagicBlock oracle feeds read inside the rollup.
3. **Trade.** Buy UP or DOWN shares from the round's on-chain AMM, then exit with take profit or stop loss. The session key signs every trade.
4. **Play a card.** The program enforces one card per position, and none in the last 30 seconds.
   - **Double price:** doubles a winning profit (capped).
   - **Protect loss:** refunds a loss (capped).
   - **Calm pulse:** pays a bonus on a win only if your on-chain heart rate is under 120 bpm and fresh.
   - **Cheers:** on a win, pays $1 each to random recent traders picked by MagicBlock VRF.
5. **Get settled.** A MagicBlock scheduled task rolls each round inside the rollup. Positions are settled on the ER by the keeper (settlement is permissionless, so a player can settle too).
6. **Save to Solana.** The player is committed back to Solana, and a Magic Action writes the player's badges into a BadgeRecord account on the base layer.
7. **Be social.** Live leaderboard of open positions, chat, trader presence, round history, progression (Trade Masters, Streak Climber, Steal Heart, Day Trader) and live bpm next to each trader.

## MagicBlock map

| Capability | What it does here | Where |
|---|---|---|
| Ephemeral Rollup delegation | 9 Arena accounts and every Player account live on the ER, so trades are fast and free | `delegate_market`, `delegate_player` in `programs/rogs-arena/src/lib.rs`; `ensurePlayerDelegated` in `packages/arena-sdk` |
| Session keys (Gum) | One-time approval; the session key signs buy, sell, attach and report_heart | `createSessionKey` in `packages/arena-sdk`; session checks on each instruction |
| Pricing oracle | Strike at open and close at resolution read inside the ER, with stale and placeholder feeds rejected | `programs/rogs-arena/src/oracle.rs`, `roll_round` |
| Scheduled tasks (crank) | `roll_round` runs on the ER for every market; no server rolls rounds | `schedule_round_crank`; `packages/arena-sdk/scripts/bootstrap-markets.ts` |
| VRF | Fair Cheers draws recipients from the complete set of recent traders | `request_cheers`, `cheers_callback` |
| Commits | Arenas and players committed back to Solana, with commit receipts (`GetCommitmentSignature`) in the UI | `commit_arena`, `commit_player`, `undelegate_player` |
| Magic Actions | "Save to Solana" commits the player, then a post-commit action runs `record_badges` on the base layer | `commit_player_badges`, `record_badges`, `init_badge_record` |
| Router | The proof page and SDK check delegation status through the MagicBlock router | `packages/arena-sdk`, `apps/web` proof page |

## Architecture

```mermaid
flowchart LR
  subgraph Browser["apps/web (Next.js on Vercel)"]
    UI[rizz-club UI] --> SDK[@rogs/arena-sdk]
    UI --> Pulse[Wearable: Web Bluetooth or CELL-4B Wi-Fi bridge]
  end
  SDK -- session-key txs --> ER[MagicBlock Ephemeral Rollup]
  SDK -- sign-in, delegation, session, badge record --> SOL[Solana devnet]
  ER <-- delegation / commits / Magic Actions --> SOL
  ER --- Oracle[MagicBlock oracle feeds]
  ER --- VRF[MagicBlock VRF]
  ER --- Crank[Scheduled roll_round]
  subgraph Railway["apps/arena (Bun on Railway)"]
    Indexer[Indexer: ER logs + arena accounts]
    Keeper[Keeper: settle, commit, Cheers]
    Sampler[Price sampler]
    API[REST + WebSocket]
  end
  ER --> Indexer --> DB[(MongoDB Atlas)]
  Sampler --> DB
  Keeper --> ER
  API --> DB
  UI <-- snapshots, chat, presence --> API
```

- **`programs/rogs-arena`:** Anchor 0.32.1 program with ephemeral-rollups-sdk. AMM rounds, abilities, heart rate, Fair Cheers, badges and guards, with 32 Rust unit tests.
- **`packages/arena-sdk`:** instructions, PDAs, account decoding, quotes and the settlement math mirror, plus the devnet verification scripts.
- **`apps/arena`:**
  - **Indexer:** reads ER program logs and arena accounts into MongoDB.
  - **Keeper:** settles players, commits arenas and requests Cheers.
  - **Oracle price sampler:** feeds chart history.
  - **Auth, faucet and chat:** wallet-signature sign-in, the devnet faucet, rate-limited chat.
  - **Presence:** live trader list over the WebSocket.
- **`apps/web`:** the rizz-club frontend wired to the SDK and service, with a nine-coin selector, a proof page and a mobile layout.
- **`tools/cell4b-heart-bridge`:** serves a real fingertip pulse (MAX3010x on a Raspberry Pi) to the wearable pane over Wi-Fi.

## Run it locally

Requirements: Bun, Node 20+, and a MongoDB URI. The Solana CLI and Anchor are only needed to rebuild the program.

```bash
bun install

# Arena service (copy apps/arena/.env.example to apps/arena/.env and fill it in)
cd apps/arena && INDEXER_ENABLED=true KEEPER_ENABLED=false bun src/index.ts

# Web (copy apps/web/.env.example to apps/web/.env.local; point NEXT_PUBLIC_ARENA_API_URL at the service)
cd apps/web && bun run build && bun run start
```

**Service env:**
- `MONGODB_URI`, `MONGODB_DB`
- `PROGRAM_ID`, `BASE_RPC_URL`, `ER_RPC_URL`, `ER_WS_URL`, `ROUTER_URL`, `ER_VALIDATOR`, `ORACLE_BTC_FEED`
- `KEEPER_SECRET_KEY`, `FAUCET_SECRET_KEY`
- `CORS_ORIGIN`, `PORT`, `KEEPER_ENABLED`, `INDEXER_ENABLED`, `PRICE_SAMPLER_ENABLED`, `IDL_PATH`

**Web env:**
- `NEXT_PUBLIC_SOLANA_CLUSTER`, `NEXT_PUBLIC_BASE_RPC_URL`, `NEXT_PUBLIC_ROUTER_URL`
- `NEXT_PUBLIC_ER_RPC_URL`, `NEXT_PUBLIC_ER_WS_URL`, `NEXT_PUBLIC_ER_VALIDATOR`
- `NEXT_PUBLIC_PROGRAM_ID`, `NEXT_PUBLIC_ORACLE_BTC_FEED`
- `NEXT_PUBLIC_ARENA_API_URL`, `NEXT_PUBLIC_ARENA_WS_URL`
- optional `NEXT_PUBLIC_PULSE_BRIDGE_URL`

**Extras (from `apps/arena`):**
- `bun scripts/demo-activity.ts 60 <service url>`: five labelled "Rogbot" wallets that trade, play cards and chat through the same paths as players.
- `bun scripts/demo-wallet.ts`: a devnet keypair exposed as a Wallet Standard wallet, for automated browser runs without an extension.

## Verification

| Check | Command | Latest result (2026-09-13) |
|---|---|---|
| Program unit tests | `cargo test -p rogs-arena --lib` | 32 passed |
| Program guards on devnet | `bun packages/arena-sdk/scripts/test-guards.ts`, `test-market-guards.ts` | 17 and 6 passed |
| Ability bonuses on devnet | `bun packages/arena-sdk/scripts/test-abilities.ts` | Double and Protect paid exactly |
| Full lifecycle on devnet | `bun packages/arena-sdk/scripts/e2e-devnet.ts` | see `docs/E2E-RUN.md` |
| Nine markets live | `bun packages/arena-sdk/scripts/check-markets.ts` | all delegated, oracle fresh, crank rolling |
| Service tests (real MongoDB) | `cd apps/arena && bun test` | 88 passed |
| Live API and WebSocket | `bun apps/arena/scripts/verify-live-api.ts`, `verify-live-ws.ts` | passed |
| Web | `cd apps/web && bunx tsc --noEmit && bunx eslint . && bun test` | clean, 272 passed |
| Browser test plan | `docs/TEST-PLAN.md` | executed against the live app; 0 console errors |

More: [`docs/MAGICBLOCK-AUDIT.md`](docs/MAGICBLOCK-AUDIT.md), [`docs/COMPLETION.md`](docs/COMPLETION.md), [`docs/JUDGE-REPORT.md`](docs/JUDGE-REPORT.md), [`docs/SUBMISSION.md`](docs/SUBMISSION.md), [`docs/ARENA-API.md`](docs/ARENA-API.md).

## Deployed addresses (devnet)

| Account | Address |
|---|---|
| Program | `J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q` |
| BTC arena | `ApzYL11HC9puv4dbFk1QTCrE4wpLup8ta9QE2UKde2CJ` |
| ETH arena | `GfJreHenZExBN2WgmN8kxBr5WK71Ua9v9jMnVQ8d6cHE` |
| SOL arena | `J4SQ3hom8asmomsJDPNdZCnXnRzQCGwPAW2CM8MENaNa` |
| BNB arena | `HSX18kkatkiMvphF8QAUjkMJGSpW9p3FP3VAgja8WVLt` |
| XRP arena | `BuQZihto9U9E8ujfWsVMtgZgt4TFnvYqZ4nzC85LRgwr` |
| DOGE arena | `djrjxYeX71CMzPhJD3eRQZar3YdvKEjukLScLaGRqDf` |
| SUI arena | `6W7KxzZr3aJmP6qviLM7EzwDAeQMYxu12Yirt9GgD4qC` |
| AVAX arena | `D132hR1x8v2E9uMf6AajrgMKxyTsvXDkcockypZeatfR` |
| LINK arena | `6BYKgZ5yzcWJaJRfiWXsdMB11BJA1MKjQ1eFP8xBDQMc` |

## What this does not prove

- **Devnet only.** Chips are play money held by the program; nothing here touches mainnet funds.
- **Heart rate is self-reported.** The bpm comes from the player's own device: Web Bluetooth, or the CELL-4B bridge on the local network. The program checks range and freshness but cannot attest that the reading is genuine. The CELL-4B bridge only works from a local build, because browsers block an https page from calling a device on a home network.
- **The keeper is a helper, not a trust anchor.** Rounds roll through MagicBlock's scheduled task. Settlement, commits and Cheers requests are permissionless instructions the keeper calls for convenience.
- **The Rogbots are automated.** They are labelled demo wallets making real devnet transactions so the arena is busy; they are not independent users.
- **Off-chain data.** The social layer (chat, presence, indexed history) lives in MongoDB. The chain holds balances, positions, rounds, heart readings and badges.
