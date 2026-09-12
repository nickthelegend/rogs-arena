use anchor_lang::prelude::*;

pub const ARENA_SEED: &[u8] = b"arena";
pub const PLAYER_SEED: &[u8] = b"player";

/// Chips use 6 decimals: 1 USD = 1_000_000.
pub const USD: u64 = 1_000_000;
pub const BPS: u64 = 10_000;

pub const MIN_ROUND_SECONDS: i64 = 60;
pub const MAX_ROUND_SECONDS: i64 = 3_600;
/// A freshly opened round always has at least this long to run.
pub const MIN_ROUND_LEAD_SECONDS: i64 = 60;
/// No buys, sells or ability attachments in the last seconds of a round.
pub const TRADE_LOCK_SECONDS: i64 = 5;
pub const MAX_PRICE_AGE_SECONDS: i64 = 30;
/// Tolerated clock skew between the oracle publish time and the ER clock.
pub const MAX_PRICE_FUTURE_SECONDS: i64 = 5;

pub const MIN_LIQUIDITY: u64 = 10 * USD;
pub const MAX_FEE_BPS: u64 = 500;

pub const MIN_TRADE: u64 = USD;
pub const MAX_TRADE: u64 = 100 * USD;

pub const START_CHIPS: u64 = 250 * USD;
pub const FAUCET_AMOUNT: u64 = 100 * USD;
pub const FAUCET_COOLDOWN_SECONDS: i64 = 3_600;
pub const FAUCET_MAX_BALANCE: u64 = 50 * USD;

pub const ABILITY_CAP: u64 = 10 * USD;
/// Cards cannot be attached in the final seconds of a round.
pub const ABILITY_LOCK_SECONDS: i64 = 30;
pub const ABILITY_NONE: u8 = 0;
pub const ABILITY_DOUBLE: u8 = 1;
pub const ABILITY_PROTECT: u8 = 2;
pub const ABILITY_CALM: u8 = 3;
pub const ABILITY_CHEERS: u8 = 4;

pub const CALM_BPM_LIMIT: u16 = 120;
pub const HEART_BPM_MIN: u16 = 30;
pub const HEART_BPM_MAX: u16 = 230;
/// A reported heart rate counts toward a position opened within this window.
pub const HEART_FRESH_SECONDS: i64 = 30;

pub const CHEERS_RECIPIENTS: usize = 10;
pub const CHEERS_AMOUNT: u64 = USD;
pub const MAX_CHEERS_CANDIDATES: usize = 12;
pub const CHEERS_TIMEOUT_SECONDS: i64 = 120;

pub const RECENT_TRADERS: usize = 16;
pub const HISTORY_LEN: usize = 64;
pub const POSITION_SLOTS: usize = 4;

pub const OUTCOME_NONE: u8 = 0;
pub const OUTCOME_YES: u8 = 1;
pub const OUTCOME_NO: u8 = 2;

pub const SIDE_BUY: u8 = 0;
pub const SIDE_SELL: u8 = 1;

pub const ROUND_IDLE: u8 = 0;
pub const ROUND_OPEN: u8 = 1;
pub const ROUND_RESOLVED: u8 = 2;

pub const BADGE_TRADE_MASTER: u32 = 1 << 0;
pub const BADGE_STREAK_CLIMBER: u32 = 1 << 1;
pub const BADGE_STEAL_HEART: u32 = 1 << 2;
pub const BADGE_DAY_TRADER: u32 = 1 << 3;
/// Targets mirror apps/web/lib/progress.ts PROGRESS_TRACKS.
pub const TRADE_MASTER_TARGET: u32 = 100;
pub const STREAK_CLIMBER_TARGET: u16 = 5;
pub const STEAL_HEART_TARGET: u32 = 70;
pub const DAY_TRADER_TARGET: u16 = 20;

pub const SECONDS_PER_DAY: i64 = 86_400;

/// MagicBlock real-time pricing oracle (republishes Pyth Lazer / Stork feeds).
pub const ORACLE_PROGRAM_ID: Pubkey = pubkey!("PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd");
/// Discriminator of the oracle's PriceUpdateV2-layout accounts.
pub const PRICE_UPDATE_DISCRIMINATOR: [u8; 8] = [234, 161, 14, 36, 172, 239, 15, 232];
/// VRF queue that is delegated to the ephemeral rollups (devnet and mainnet).
pub const VRF_EPHEMERAL_QUEUE: Pubkey = pubkey!("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");
pub const MAGIC_PROGRAM_ID: Pubkey = pubkey!("Magic11111111111111111111111111111111111111");
