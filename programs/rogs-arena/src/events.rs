use anchor_lang::prelude::*;

#[event]
pub struct TradeExecuted {
    pub round_id: u64,
    pub owner: Pubkey,
    pub outcome: u8,
    pub side: u8,
    /// Gross chips in for buys, net chips out for sells.
    pub amount: u64,
    pub shares: u64,
    pub fee: u64,
    /// YES probability after the trade, in basis points.
    pub yes_price_bps: u64,
    /// Sell proceeds minus the cost basis of the shares sold; 0 for buys.
    pub realized_pnl: i64,
    pub ability: u8,
    pub balance: u64,
    pub ts: i64,
}

#[event]
pub struct RoundOpened {
    pub round_id: u64,
    pub start_ts: i64,
    pub end_ts: i64,
    pub strike_price: i64,
    pub price_expo: i32,
    pub liquidity: u64,
}

#[event]
pub struct RoundResolved {
    pub round_id: u64,
    pub strike_price: i64,
    pub close_price: i64,
    pub price_expo: i32,
    pub outcome: u8,
    pub yes_pool: u64,
    pub no_pool: u64,
    pub volume: u64,
    pub trades: u64,
    pub house_back: u64,
    pub ts: i64,
}

#[event]
pub struct PositionSettled {
    pub round_id: u64,
    pub owner: Pubkey,
    pub outcome: u8,
    pub payout: u64,
    pub profit: i64,
    pub ability: u8,
    pub bonus: u64,
    pub calm: bool,
    pub cheers: bool,
    pub balance: u64,
    pub ts: i64,
}

#[event]
pub struct ChipsClaimed {
    pub owner: Pubkey,
    pub amount: u64,
    pub first: bool,
    pub balance: u64,
    pub ts: i64,
}

#[event]
pub struct AbilityAttached {
    pub round_id: u64,
    pub owner: Pubkey,
    pub ability: u8,
    pub ts: i64,
}

#[event]
pub struct HeartReported {
    pub owner: Pubkey,
    pub bpm: u16,
    pub ts: i64,
}

#[event]
pub struct CheersRequested {
    pub owner: Pubkey,
    pub candidates: u8,
    pub ts: i64,
}

#[event]
pub struct CheersPaid {
    pub owner: Pubkey,
    pub recipients: Vec<Pubkey>,
    pub amount_each: u64,
    pub randomness: [u8; 32],
    pub ts: i64,
}

#[event]
pub struct CheersReset {
    pub owner: Pubkey,
    pub ts: i64,
}

#[event]
pub struct ArenaPaused {
    pub treasury: u64,
    pub needed: u64,
    pub ts: i64,
}

#[event]
pub struct TreasuryFunded {
    pub amount: u64,
    pub treasury: u64,
    pub ts: i64,
}

#[event]
pub struct BadgesRecorded {
    pub owner: Pubkey,
    pub badges: u32,
    pub best_streak: u16,
    pub calm_wins: u32,
    pub trades_total: u32,
    pub updates: u32,
    pub ts: i64,
}
