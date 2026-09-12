use anchor_lang::prelude::*;

use crate::constants::*;

/// The live round. Layout has no implicit padding (zero-copy).
#[zero_copy]
#[derive(Default, Debug, PartialEq, Eq)]
pub struct RoundState {
    pub id: u64,
    pub start_ts: i64,
    pub end_ts: i64,
    pub strike_price: i64,
    pub close_price: i64,
    pub yes_pool: u64,
    pub no_pool: u64,
    /// Chips backing the round; always equals the number of minted YES+NO sets.
    pub collateral: u64,
    pub volume: u64,
    pub trades: u64,
    pub price_expo: i32,
    pub status: u8,
    pub outcome: u8,
    pub _pad: [u8; 2],
}

/// A resolved round kept for settlement and history.
#[zero_copy]
#[derive(Default, Debug, PartialEq, Eq)]
pub struct RoundSummary {
    pub id: u64,
    pub start_ts: i64,
    pub end_ts: i64,
    pub strike_price: i64,
    pub close_price: i64,
    pub yes_pool: u64,
    pub no_pool: u64,
    pub volume: u64,
    pub trades: u64,
    pub price_expo: i32,
    pub outcome: u8,
    pub _pad: [u8; 3],
}

/// Global arena state. Delegated to the ephemeral rollup.
#[account(zero_copy)]
pub struct Arena {
    pub authority: Pubkey,
    pub keeper: Pubkey,
    pub oracle_feed: Pubkey,
    pub round_seconds: i64,
    pub liquidity: u64,
    pub fee_bps: u64,
    /// House chips: seeds round liquidity, collects fees, pays bonuses.
    pub treasury: u64,
    /// Winning shares still owed to players across resolved rounds.
    pub claims_outstanding: u64,
    pub total_volume: u64,
    pub total_trades: u64,
    pub total_players: u64,
    pub crank_task_id: i64,
    pub last_roll_ts: i64,
    pub history_head: u64,
    pub history_len: u64,
    pub recent_head: u64,
    pub commits: u64,
    pub bump: u8,
    pub _pad: [u8; 7],
    pub current: RoundState,
    pub history: [RoundSummary; HISTORY_LEN],
    pub recent: [Pubkey; RECENT_TRADERS],
}

impl Arena {
    pub const SIZE: usize = 5_936;

    pub fn push_history(&mut self, summary: RoundSummary) {
        let index = (self.history_head as usize) % HISTORY_LEN;
        self.history[index] = summary;
        self.history_head = ((index + 1) % HISTORY_LEN) as u64;
        if (self.history_len as usize) < HISTORY_LEN {
            self.history_len += 1;
        }
    }

    pub fn find_resolved(&self, round_id: u64) -> Option<RoundSummary> {
        if round_id == 0 {
            return None;
        }
        self.history
            .iter()
            .find(|summary| summary.id == round_id && summary.outcome != OUTCOME_NONE)
            .copied()
    }

    pub fn push_recent(&mut self, owner: Pubkey) {
        if self.recent.iter().any(|key| *key == owner) {
            return;
        }
        let index = (self.recent_head as usize) % RECENT_TRADERS;
        self.recent[index] = owner;
        self.recent_head = ((index + 1) % RECENT_TRADERS) as u64;
    }

    pub fn is_recent(&self, owner: &Pubkey) -> bool {
        *owner != Pubkey::default() && self.recent.iter().any(|key| key == owner)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, PartialEq, Eq, Debug)]
pub struct Position {
    pub round_id: u64,
    pub yes_shares: u64,
    pub no_shares: u64,
    /// Gross chips spent on buys (never reduced).
    pub cost: u64,
    /// Net chips received from sells.
    pub proceeds: u64,
    /// Remaining cost basis per side, reduced pro rata on sells.
    pub basis_yes: u64,
    pub basis_no: u64,
    /// Highest heart rate reported while this position was live.
    pub max_bpm: u16,
    pub heart_samples: u16,
    pub ability: u8,
    pub active: bool,
}

#[account]
#[derive(InitSpace, Default, Debug)]
pub struct Player {
    pub owner: Pubkey,
    pub bump: u8,
    pub joined: bool,
    pub balance: u64,
    pub positions: [Position; POSITION_SLOTS],
    pub trades_total: u32,
    pub wins_total: u32,
    pub losses_total: u32,
    pub win_streak: u16,
    pub best_streak: u16,
    pub same_side_streak: u16,
    pub last_side: u8,
    pub calm_wins: u32,
    pub day_index: i64,
    pub day_trades: u16,
    pub badges: u32,
    pub pnl_total: i64,
    pub bonus_total: u64,
    pub volume_total: u64,
    pub heart_bpm: u16,
    pub heart_ts: i64,
    pub cheers_pending: u8,
    pub cheers_inflight: u8,
    pub cheers_requested_ts: i64,
    pub cheers_received: u64,
    pub last_faucet_ts: i64,
}

impl Player {
    pub fn slot_for(&self, round_id: u64) -> Option<usize> {
        self.positions
            .iter()
            .position(|position| position.active && position.round_id == round_id)
    }

    pub fn alloc_slot(&mut self, round_id: u64) -> Option<usize> {
        if let Some(index) = self.slot_for(round_id) {
            return Some(index);
        }
        let index = self.positions.iter().position(|position| !position.active)?;
        self.positions[index] = Position {
            round_id,
            active: true,
            ..Position::default()
        };
        Some(index)
    }
}
