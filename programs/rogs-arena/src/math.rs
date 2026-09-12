//! Pure market, settlement and progression logic. No accounts, no CPI, so all
//! of it runs under `cargo test`.

use crate::constants::*;
use crate::state::{Player, Position};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BuyQuote {
    pub shares: u64,
    pub fee: u64,
    pub net: u64,
    /// Pool of the bought outcome after the trade.
    pub pool_bought: u64,
    /// Pool of the other outcome after the trade.
    pub pool_other: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SellQuote {
    /// Complete sets burned, i.e. chips released from collateral.
    pub gross: u64,
    pub fee: u64,
    pub out: u64,
    pub pool_sold: u64,
    pub pool_other: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Resolution {
    pub outcome: u8,
    pub house_back: u64,
    pub claims: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct SlotSettlement {
    pub payout: u64,
    pub profit: i64,
    pub bonus: u64,
    pub calm: bool,
    pub cheers: bool,
}

pub fn fee_of(amount: u64, fee_bps: u64) -> u64 {
    ((amount as u128) * (fee_bps as u128) / (BPS as u128)) as u64
}

pub fn ceil_div(numerator: u128, denominator: u128) -> Option<u128> {
    if denominator == 0 {
        return None;
    }
    let quotient = numerator / denominator;
    Some(if numerator % denominator == 0 {
        quotient
    } else {
        quotient + 1
    })
}

pub fn isqrt(value: u128) -> u128 {
    if value < 2 {
        return value;
    }
    let bits = 128 - value.leading_zeros();
    let mut x = 1u128 << bits.div_ceil(2);
    loop {
        let y = (x + value / x) / 2;
        if y >= x {
            return x;
        }
        x = y;
    }
}

fn to_u64(value: u128) -> Option<u64> {
    u64::try_from(value).ok()
}

/// Fixed-product binary market maker buy: `gross` chips of the outcome whose pool
/// is `pool_bought`. Every net chip mints one YES and one NO share into the pools;
/// the pool keeps `ceil(k / pool_other')` of the bought side and pays out the rest.
pub fn quote_buy(pool_bought: u64, pool_other: u64, gross: u64, fee_bps: u64) -> Option<BuyQuote> {
    if pool_bought == 0 || pool_other == 0 || fee_bps > BPS {
        return None;
    }
    let fee = fee_of(gross, fee_bps);
    let net = gross.checked_sub(fee)?;
    if net == 0 {
        return None;
    }
    let k = (pool_bought as u128).checked_mul(pool_other as u128)?;
    let bought_after_mint = (pool_bought as u128).checked_add(net as u128)?;
    let other_after = (pool_other as u128).checked_add(net as u128)?;
    let bought_kept = ceil_div(k, other_after)?;
    let shares = bought_after_mint.checked_sub(bought_kept)?;
    if shares == 0 {
        return None;
    }
    Some(BuyQuote {
        shares: to_u64(shares)?,
        fee,
        net,
        pool_bought: to_u64(bought_kept)?,
        pool_other: to_u64(other_after)?,
    })
}

/// Sell `shares` of the outcome whose pool is `pool_sold` back to the market.
/// Burns `r` complete sets so that `(pool_sold + shares - r) * (pool_other - r) >= k`.
pub fn quote_sell(pool_sold: u64, pool_other: u64, shares: u64, fee_bps: u64) -> Option<SellQuote> {
    if pool_sold == 0 || pool_other == 0 || shares == 0 || fee_bps > BPS {
        return None;
    }
    let x = pool_sold as u128;
    let o = pool_other as u128;
    let s = shares as u128;
    let k = x.checked_mul(o)?;
    let xs = x.checked_add(s)?;
    let sum = xs.checked_add(o)?;
    let discriminant = sum.checked_mul(sum)?.checked_sub(s.checked_mul(o)?.checked_mul(4)?)?;
    let mut r = sum.checked_sub(isqrt(discriminant))? / 2;
    while r > 0 && (r >= xs || r >= o || (xs - r).checked_mul(o - r)? < k) {
        r -= 1;
    }
    if r == 0 {
        return None;
    }
    let gross = to_u64(r)?;
    let fee = fee_of(gross, fee_bps);
    let out = gross.checked_sub(fee)?;
    if out == 0 {
        return None;
    }
    Some(SellQuote {
        gross,
        fee,
        out,
        pool_sold: to_u64(xs - r)?,
        pool_other: to_u64(o - r)?,
    })
}

/// YES probability in basis points: `no_pool / (yes_pool + no_pool)`.
pub fn yes_price_bps(yes_pool: u64, no_pool: u64) -> u64 {
    let total = yes_pool as u128 + no_pool as u128;
    if total == 0 {
        return BPS / 2;
    }
    ((no_pool as u128) * (BPS as u128) / total) as u64
}

/// YES wins when BTC closes at or above the strike (rizz-club's original rule).
pub fn resolve_round(strike: i64, close: i64, yes_pool: u64, no_pool: u64, collateral: u64) -> Resolution {
    let outcome = if close >= strike { OUTCOME_YES } else { OUTCOME_NO };
    let pool_winning = if outcome == OUTCOME_YES { yes_pool } else { no_pool };
    let house_back = pool_winning.min(collateral);
    Resolution {
        outcome,
        house_back,
        claims: collateral - house_back,
    }
}

pub fn is_calm(position: &Position) -> bool {
    position.heart_samples > 0
        && position.max_bpm >= HEART_BPM_MIN
        && position.max_bpm < CALM_BPM_LIMIT
}

pub fn settle_slot(position: &Position, outcome: u8) -> SlotSettlement {
    let payout = if outcome == OUTCOME_YES {
        position.yes_shares
    } else {
        position.no_shares
    };
    let raw = payout as i128 + position.proceeds as i128 - position.cost as i128;
    let profit = raw.clamp(i64::MIN as i128, i64::MAX as i128) as i64;
    let won = profit > 0;
    let lost = profit < 0;
    let calm = won && is_calm(position);
    let bonus = match position.ability {
        ABILITY_DOUBLE if won => (profit as u64).min(ABILITY_CAP),
        ABILITY_PROTECT if lost => profit.unsigned_abs().min(ABILITY_CAP),
        ABILITY_CALM if calm => ABILITY_CAP,
        _ => 0,
    };
    SlotSettlement {
        payout,
        profit,
        bonus,
        calm,
        cheers: position.ability == ABILITY_CHEERS && won,
    }
}

/// Cost basis of `sold` shares out of `held`, rounded down.
pub fn basis_portion(basis: u64, sold: u64, held: u64) -> u64 {
    if held == 0 {
        return 0;
    }
    ((basis as u128) * (sold.min(held) as u128) / (held as u128)) as u64
}

pub fn day_index(now: i64) -> i64 {
    now.div_euclid(SECONDS_PER_DAY)
}

pub fn badges_for(player: &Player) -> u32 {
    let mut badges = player.badges;
    if player.trades_total >= TRADE_MASTER_TARGET {
        badges |= BADGE_TRADE_MASTER;
    }
    if player.best_streak >= STREAK_CLIMBER_TARGET {
        badges |= BADGE_STREAK_CLIMBER;
    }
    if player.calm_wins >= STEAL_HEART_TARGET {
        badges |= BADGE_STEAL_HEART;
    }
    if player.day_trades >= DAY_TRADER_TARGET {
        badges |= BADGE_DAY_TRADER;
    }
    badges
}

/// Progress counters for a filled buy (mirrors rizz-club's `placed` event).
pub fn apply_trade_stats(player: &mut Player, outcome: u8, amount: u64, now: i64) {
    let today = day_index(now);
    if player.day_index != today {
        player.day_index = today;
        player.day_trades = 0;
    }
    player.day_trades = player.day_trades.saturating_add(1);
    player.trades_total = player.trades_total.saturating_add(1);
    if player.last_side == outcome {
        player.same_side_streak = player.same_side_streak.saturating_add(1);
    } else {
        player.same_side_streak = 1;
        player.last_side = outcome;
    }
    player.volume_total = player.volume_total.saturating_add(amount);
    player.badges = badges_for(player);
}

pub fn apply_settle_stats(player: &mut Player, settlement: &SlotSettlement) {
    if settlement.profit > 0 {
        player.wins_total = player.wins_total.saturating_add(1);
        player.win_streak = player.win_streak.saturating_add(1);
        player.best_streak = player.best_streak.max(player.win_streak);
    } else if settlement.profit < 0 {
        player.losses_total = player.losses_total.saturating_add(1);
        player.win_streak = 0;
    }
    if settlement.calm {
        player.calm_wins = player.calm_wins.saturating_add(1);
    }
    player.pnl_total = player
        .pnl_total
        .saturating_add(settlement.profit)
        .saturating_add(settlement.bonus as i64);
    player.bonus_total = player.bonus_total.saturating_add(settlement.bonus);
    player.badges = badges_for(player);
}

/// End of the next round, aligned to wall-clock boundaries, at least
/// `MIN_ROUND_LEAD_SECONDS` away.
pub fn next_round_end(now: i64, round_seconds: i64) -> i64 {
    let mut end = (now.div_euclid(round_seconds) + 1) * round_seconds;
    if end - now < MIN_ROUND_LEAD_SECONDS {
        end += round_seconds;
    }
    end
}

fn splitmix64(state: u64) -> u64 {
    let mut z = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// Fisher-Yates over candidate indices seeded by VRF randomness; returns up to
/// `count` distinct indices.
pub fn pick_recipients(randomness: &[u8; 32], candidates: usize, count: usize) -> Vec<usize> {
    let mut indices: Vec<usize> = (0..candidates).collect();
    let mut state = 0u64;
    for chunk in randomness.chunks(8) {
        let mut word = [0u8; 8];
        word.copy_from_slice(chunk);
        state = splitmix64(state ^ u64::from_le_bytes(word));
    }
    for i in (1..candidates).rev() {
        state = splitmix64(state);
        let j = (state % (i as u64 + 1)) as usize;
        indices.swap(i, j);
    }
    indices.truncate(count.min(candidates));
    indices
}

#[cfg(test)]
mod tests {
    use super::*;

    const L: u64 = 200 * USD;

    struct Lcg(u64);
    impl Lcg {
        fn next(&mut self) -> u64 {
            self.0 = self.0.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1_442_695_040_888_963_407);
            self.0 >> 11
        }
    }

    #[test]
    fn isqrt_is_floor_sqrt() {
        for value in [0u128, 1, 2, 3, 4, 15, 16, 17, 99, 100, 101, 1 << 64, (1 << 100) + 12_345] {
            let root = isqrt(value);
            assert!(root * root <= value, "{value}");
            assert!((root + 1) * (root + 1) > value, "{value}");
        }
        assert_eq!(isqrt(10_000_000_000_000_000_000_000), 100_000_000_000);
    }

    #[test]
    fn first_buy_matches_hand_computed_values() {
        // 5 USD at 100 bps: fee 0.05, net 4.95 USD into 200/200 pools.
        let quote = quote_buy(L, L, 5 * USD, 100).unwrap();
        assert_eq!(quote.fee, 50_000);
        assert_eq!(quote.net, 4_950_000);
        // k = 4e16, other' = 204_950_000 -> 4e16 / 204_950_000 = 195_169_553.55, so kept = ceil = 195_169_554
        assert_eq!(quote.pool_other, 204_950_000);
        assert_eq!(quote.pool_bought, 195_169_554);
        // shares = 204_950_000 - 195_169_554
        assert_eq!(quote.shares, 9_780_446);
        // YES price moves from 50.00% to 51.22%.
        assert_eq!(yes_price_bps(quote.pool_bought, quote.pool_other), 5_122);
    }

    #[test]
    fn buy_rejects_zero_and_is_monotonic() {
        assert!(quote_buy(L, L, 0, 100).is_none());
        assert!(quote_buy(0, L, USD, 100).is_none());
        let mut last = 0;
        for usd in 1..=100 {
            let quote = quote_buy(L, L, usd * USD, 100).unwrap();
            assert!(quote.shares > last);
            last = quote.shares;
        }
    }

    #[test]
    fn buy_then_sell_never_profits() {
        for fee_bps in [0u64, 100, 500] {
            for usd in [1u64, 5, 37, 100] {
                let buy = quote_buy(L, L, usd * USD, fee_bps).unwrap();
                let sell = quote_sell(buy.pool_bought, buy.pool_other, buy.shares, fee_bps).unwrap();
                assert!(sell.out <= usd * USD, "fee {fee_bps} usd {usd}: out {}", sell.out);
                if fee_bps > 0 {
                    assert!(sell.out < usd * USD);
                }
            }
        }
    }

    #[test]
    fn sell_keeps_invariant_and_rejects_empty() {
        assert!(quote_sell(L, L, 0, 100).is_none());
        let sell = quote_sell(L, L, 10 * USD, 100).unwrap();
        let before = (L as u128) * (L as u128);
        let after = (sell.pool_sold as u128) * (sell.pool_other as u128);
        assert!(after >= before);
        assert_eq!(sell.out + sell.fee, sell.gross);
    }

    #[test]
    fn random_sequences_stay_solvent_for_both_outcomes() {
        let mut rng = Lcg(0x5EED);
        for case in 0..1_000 {
            let fee_bps = rng.next() % 300;
            let (mut yes, mut no, mut collateral) = (L, L, L);
            let (mut user_yes, mut user_no) = (0u64, 0u64);
            let mut treasury_fees = 0u64;
            for _ in 0..(5 + rng.next() % 40) {
                let side_yes = rng.next() % 2 == 0;
                let before = (yes as u128) * (no as u128);
                if rng.next() % 3 == 0 {
                    let held = if side_yes { user_yes } else { user_no };
                    if held == 0 {
                        continue;
                    }
                    let amount = 1 + rng.next() % held;
                    let (sold, other) = if side_yes { (yes, no) } else { (no, yes) };
                    let Some(sell) = quote_sell(sold, other, amount, fee_bps) else { continue };
                    if side_yes {
                        yes = sell.pool_sold;
                        no = sell.pool_other;
                        user_yes -= amount;
                    } else {
                        no = sell.pool_sold;
                        yes = sell.pool_other;
                        user_no -= amount;
                    }
                    collateral -= sell.gross;
                    treasury_fees += sell.fee;
                } else {
                    let gross = USD + rng.next() % (99 * USD);
                    let (bought, other) = if side_yes { (yes, no) } else { (no, yes) };
                    let buy = quote_buy(bought, other, gross, fee_bps).unwrap();
                    if side_yes {
                        yes = buy.pool_bought;
                        no = buy.pool_other;
                        user_yes += buy.shares;
                    } else {
                        no = buy.pool_bought;
                        yes = buy.pool_other;
                        user_no += buy.shares;
                    }
                    collateral += buy.net;
                    treasury_fees += buy.fee;
                }
                let after = (yes as u128) * (no as u128);
                assert!(after >= before, "case {case}: product decreased");
                // Minted sets == collateral on both sides.
                assert_eq!(yes + user_yes, collateral, "case {case}");
                assert_eq!(no + user_no, collateral, "case {case}");
            }
            let yes_win = resolve_round(100, 100, yes, no, collateral);
            assert_eq!(yes_win.outcome, OUTCOME_YES);
            assert_eq!(yes_win.claims, user_yes);
            assert_eq!(yes_win.house_back + yes_win.claims, collateral);
            let no_win = resolve_round(100, 99, yes, no, collateral);
            assert_eq!(no_win.outcome, OUTCOME_NO);
            assert_eq!(no_win.claims, user_no);
            assert_eq!(no_win.house_back + no_win.claims, collateral);
            let _ = treasury_fees;
        }
    }

    #[test]
    fn resolve_ties_go_to_yes() {
        assert_eq!(resolve_round(77_000, 77_000, 1, 1, 2).outcome, OUTCOME_YES);
        assert_eq!(resolve_round(77_000, 76_999, 1, 1, 2).outcome, OUTCOME_NO);
    }

    fn position(ability: u8, yes: u64, no: u64, cost: u64, proceeds: u64) -> Position {
        Position {
            round_id: 1,
            yes_shares: yes,
            no_shares: no,
            cost,
            proceeds,
            ability,
            active: true,
            ..Position::default()
        }
    }

    #[test]
    fn double_profit_caps_at_ten() {
        let small = settle_slot(&position(ABILITY_DOUBLE, 9 * USD, 0, 5 * USD, 0), OUTCOME_YES);
        assert_eq!((small.payout, small.profit, small.bonus), (9 * USD, 4_000_000, 4 * USD));
        let big = settle_slot(&position(ABILITY_DOUBLE, 60 * USD, 0, 30 * USD, 0), OUTCOME_YES);
        assert_eq!(big.bonus, ABILITY_CAP);
        let lost = settle_slot(&position(ABILITY_DOUBLE, 9 * USD, 0, 5 * USD, 0), OUTCOME_NO);
        assert_eq!((lost.payout, lost.profit, lost.bonus), (0, -5_000_000, 0));
    }

    #[test]
    fn protect_loss_refunds_losses_up_to_ten() {
        let lost = settle_slot(&position(ABILITY_PROTECT, 9 * USD, 0, 5 * USD, 0), OUTCOME_NO);
        assert_eq!(lost.bonus, 5 * USD);
        let huge = settle_slot(&position(ABILITY_PROTECT, 0, 90 * USD, 50 * USD, 0), OUTCOME_YES);
        assert_eq!(huge.bonus, ABILITY_CAP);
        let won = settle_slot(&position(ABILITY_PROTECT, 9 * USD, 0, 5 * USD, 0), OUTCOME_YES);
        assert_eq!(won.bonus, 0);
    }

    #[test]
    fn calm_pulse_needs_a_live_heart_rate_below_120() {
        let mut calm = position(ABILITY_CALM, 9 * USD, 0, 5 * USD, 0);
        // No wearable: no samples, no bonus.
        assert_eq!(settle_slot(&calm, OUTCOME_YES).bonus, 0);
        calm.heart_samples = 3;
        calm.max_bpm = 119;
        let paid = settle_slot(&calm, OUTCOME_YES);
        assert_eq!((paid.bonus, paid.calm), (ABILITY_CAP, true));
        calm.max_bpm = 120;
        assert_eq!(settle_slot(&calm, OUTCOME_YES).bonus, 0);
        calm.max_bpm = 29;
        assert_eq!(settle_slot(&calm, OUTCOME_YES).bonus, 0);
        calm.max_bpm = 80;
        assert_eq!(settle_slot(&calm, OUTCOME_NO).bonus, 0);
        // Calm wins are tracked even without the card.
        let mut plain = position(ABILITY_NONE, 9 * USD, 0, 5 * USD, 0);
        plain.heart_samples = 1;
        plain.max_bpm = 90;
        let result = settle_slot(&plain, OUTCOME_YES);
        assert_eq!((result.calm, result.bonus), (true, 0));
    }

    #[test]
    fn cheers_only_on_a_win() {
        assert!(settle_slot(&position(ABILITY_CHEERS, 9 * USD, 0, 5 * USD, 0), OUTCOME_YES).cheers);
        assert!(!settle_slot(&position(ABILITY_CHEERS, 9 * USD, 0, 5 * USD, 0), OUTCOME_NO).cheers);
        assert!(!settle_slot(&position(ABILITY_DOUBLE, 9 * USD, 0, 5 * USD, 0), OUTCOME_YES).cheers);
    }

    #[test]
    fn sold_out_positions_settle_on_proceeds() {
        // Bought for 5, sold for 6.2 before expiry: +1.2 profit whatever the outcome.
        let result = settle_slot(&position(ABILITY_DOUBLE, 0, 0, 5 * USD, 6_200_000), OUTCOME_NO);
        assert_eq!((result.payout, result.profit, result.bonus), (0, 1_200_000, 1_200_000));
        let even = settle_slot(&position(ABILITY_PROTECT, 0, 0, 5 * USD, 5 * USD), OUTCOME_YES);
        assert_eq!((even.profit, even.bonus), (0, 0));
    }

    #[test]
    fn basis_portion_is_pro_rata() {
        assert_eq!(basis_portion(5 * USD, 5, 10), 2_500_000);
        assert_eq!(basis_portion(5 * USD, 20, 10), 5 * USD);
        assert_eq!(basis_portion(5 * USD, 1, 0), 0);
    }

    #[test]
    fn trade_stats_roll_days_and_track_sides() {
        let mut player = Player::default();
        let day0 = 20_000 * SECONDS_PER_DAY + 100;
        apply_trade_stats(&mut player, OUTCOME_YES, 5 * USD, day0);
        apply_trade_stats(&mut player, OUTCOME_YES, 5 * USD, day0 + 10);
        apply_trade_stats(&mut player, OUTCOME_NO, 7 * USD, day0 + 20);
        assert_eq!(player.trades_total, 3);
        assert_eq!(player.day_trades, 3);
        assert_eq!(player.same_side_streak, 1);
        assert_eq!(player.last_side, OUTCOME_NO);
        assert_eq!(player.volume_total, 17 * USD);
        apply_trade_stats(&mut player, OUTCOME_NO, USD, day0 + SECONDS_PER_DAY);
        assert_eq!(player.day_trades, 1);
        assert_eq!(player.trades_total, 4);
        assert_eq!(player.same_side_streak, 2);
    }

    #[test]
    fn settle_stats_streaks_and_badges() {
        let mut player = Player::default();
        let win = SlotSettlement { payout: 9, profit: 4, bonus: 1, calm: true, cheers: false };
        let loss = SlotSettlement { payout: 0, profit: -5, bonus: 0, calm: false, cheers: false };
        let flat = SlotSettlement { payout: 5, profit: 0, bonus: 0, calm: false, cheers: false };
        for _ in 0..4 {
            apply_settle_stats(&mut player, &win);
        }
        apply_settle_stats(&mut player, &flat);
        assert_eq!(player.win_streak, 4);
        assert_eq!(player.badges & BADGE_STREAK_CLIMBER, 0);
        apply_settle_stats(&mut player, &win);
        assert_eq!(player.win_streak, 5);
        assert_ne!(player.badges & BADGE_STREAK_CLIMBER, 0);
        apply_settle_stats(&mut player, &loss);
        assert_eq!(player.win_streak, 0);
        assert_eq!(player.best_streak, 5);
        assert_ne!(player.badges & BADGE_STREAK_CLIMBER, 0, "badges are sticky");
        assert_eq!((player.wins_total, player.losses_total, player.calm_wins), (5, 1, 5));
        assert_eq!(player.pnl_total, 5 * 4 + 5 - 5);

        player.trades_total = 99;
        player.day_trades = 19;
        player.calm_wins = 69;
        player.badges = badges_for(&player);
        assert_eq!(player.badges & (BADGE_TRADE_MASTER | BADGE_DAY_TRADER | BADGE_STEAL_HEART), 0);
        let same_day = player.day_index * SECONDS_PER_DAY + 5;
        apply_trade_stats(&mut player, OUTCOME_YES, USD, same_day);
        apply_settle_stats(&mut player, &win);
        assert_ne!(player.badges & BADGE_TRADE_MASTER, 0);
        assert_ne!(player.badges & BADGE_DAY_TRADER, 0);
        assert_ne!(player.badges & BADGE_STEAL_HEART, 0);
    }

    #[test]
    fn round_end_aligns_to_five_minutes_with_lead() {
        assert_eq!(next_round_end(1_000_000_000, 300), 1_000_000_200);
        // 1_000_000_170 -> boundary 1_000_000_200 is only 30s away, so skip to the next.
        assert_eq!(next_round_end(1_000_000_170, 300), 1_000_000_500);
        assert_eq!(next_round_end(1_000_000_140, 300), 1_000_000_200);
        assert_eq!(next_round_end(1_000_000_200, 300), 1_000_000_500);
    }

    #[test]
    fn recipients_are_distinct_bounded_and_deterministic() {
        let randomness = [9u8; 32];
        let picks = pick_recipients(&randomness, 12, 10);
        assert_eq!(picks.len(), 10);
        let mut sorted = picks.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), 10);
        assert!(picks.iter().all(|index| *index < 12));
        assert_eq!(picks, pick_recipients(&randomness, 12, 10));
        assert_ne!(picks, pick_recipients(&[10u8; 32], 12, 10));
        assert_eq!(pick_recipients(&randomness, 3, 10).len(), 3);
        assert!(pick_recipients(&randomness, 0, 10).is_empty());
    }

    #[test]
    fn arena_layout_size_is_stable() {
        assert_eq!(std::mem::size_of::<crate::state::RoundState>(), 88);
        assert_eq!(std::mem::size_of::<crate::state::RoundSummary>(), 80);
        assert_eq!(std::mem::size_of::<crate::state::Arena>(), crate::state::Arena::SIZE);
        assert!(8 + crate::state::Arena::SIZE <= 10_240);
    }
}
