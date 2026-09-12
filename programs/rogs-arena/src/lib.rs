//! Rogs Arena: BTC 5-minute UP/DOWN rounds that run inside a MagicBlock
//! Ephemeral Rollup.
//!
//! - Arena and Player accounts are delegated to the ER; every trade is a
//!   gasless ER transaction, usually signed by a Gum session key.
//! - Strike and close prices come from the MagicBlock pricing oracle, read
//!   inside the ER.
//! - Rounds roll through a MagicBlock crank; `roll_round` is permissionless and
//!   idempotent, so a keeper can back the crank up.
//! - Cheers recipients are picked by MagicBlock VRF.
//! - Arena state is committed back to Solana with `MagicIntentBundleBuilder`.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;
use ephemeral_rollups_sdk::vrf::anchor::{vrf, vrf_callback};
use ephemeral_rollups_sdk::vrf::instructions::{
    create_request_randomness_ix, RequestRandomnessParams,
};
use ephemeral_rollups_sdk::vrf::types::SerializableAccountMeta;
use magicblock_magic_program_api::args::ScheduleTaskArgs;
use magicblock_magic_program_api::instruction::MagicBlockInstruction;
use session_keys::{session_auth_or, Session, SessionError, SessionTokenV2};

pub mod constants;
pub mod error;
pub mod events;
pub mod math;
pub mod oracle;
pub mod state;

use constants::*;
use error::ArenaError;
use events::*;
use state::*;

declare_id!("J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q");

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct InitializeArenaArgs {
    pub oracle_feed: Pubkey,
    pub keeper: Pubkey,
    pub round_seconds: i64,
    pub liquidity: u64,
    pub fee_bps: u64,
    pub treasury_seed: u64,
}

#[ephemeral]
#[program]
pub mod rogs_arena {
    use super::*;

    // ---------------------------------------------------------------------
    // Base layer: setup and delegation
    // ---------------------------------------------------------------------

    pub fn initialize_arena(ctx: Context<InitializeArena>, args: InitializeArenaArgs) -> Result<()> {
        require!(
            (MIN_ROUND_SECONDS..=MAX_ROUND_SECONDS).contains(&args.round_seconds),
            ArenaError::InvalidConfig
        );
        require!(args.liquidity >= MIN_LIQUIDITY, ArenaError::InvalidConfig);
        require!(args.fee_bps <= MAX_FEE_BPS, ArenaError::InvalidConfig);
        let mut arena = ctx.accounts.arena.load_init()?;
        arena.authority = ctx.accounts.authority.key();
        arena.keeper = args.keeper;
        arena.oracle_feed = args.oracle_feed;
        arena.round_seconds = args.round_seconds;
        arena.liquidity = args.liquidity;
        arena.fee_bps = args.fee_bps;
        arena.treasury = args.treasury_seed;
        arena.bump = ctx.bumps.arena;
        Ok(())
    }

    pub fn delegate_arena(ctx: Context<DelegateArena>) -> Result<()> {
        {
            let data = ctx.accounts.arena.try_borrow_data()?;
            require!(
                data.len() >= 40 && data[8..40] == ctx.accounts.authority.key().to_bytes()[..],
                ArenaError::Unauthorized
            );
        }
        ctx.accounts.delegate_arena(
            &ctx.accounts.authority,
            &[ARENA_SEED],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|account| account.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    pub fn init_player(ctx: Context<InitPlayer>) -> Result<()> {
        let player = &mut ctx.accounts.player;
        player.owner = ctx.accounts.owner.key();
        player.bump = ctx.bumps.player;
        Ok(())
    }

    pub fn delegate_player(ctx: Context<DelegatePlayer>) -> Result<()> {
        let owner = ctx.accounts.owner.key();
        ctx.accounts.delegate_player(
            &ctx.accounts.owner,
            &[PLAYER_SEED, owner.as_ref()],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|account| account.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    // ---------------------------------------------------------------------
    // Ephemeral rollup: player actions (owner or session key)
    // ---------------------------------------------------------------------

    #[session_auth_or(
        ctx.accounts.player.owner == ctx.accounts.signer.key(),
        ArenaError::Unauthorized
    )]
    pub fn claim_chips(ctx: Context<PlayerAction>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let mut arena_ref = ctx.accounts.arena.load_mut()?;
        let arena = &mut *arena_ref;
        let player = &mut ctx.accounts.player;
        let first = !player.joined;
        let amount = if first {
            START_CHIPS
        } else {
            require!(
                now.saturating_sub(player.last_faucet_ts) >= FAUCET_COOLDOWN_SECONDS,
                ArenaError::FaucetCooldown
            );
            require!(player.balance < FAUCET_MAX_BALANCE, ArenaError::FaucetBalanceTooHigh);
            FAUCET_AMOUNT
        };
        require!(arena.treasury >= amount, ArenaError::TreasuryInsufficient);
        arena.treasury -= amount;
        player.balance = player
            .balance
            .checked_add(amount)
            .ok_or(ArenaError::MathOverflow)?;
        player.last_faucet_ts = now;
        if first {
            player.joined = true;
            arena.total_players = arena.total_players.saturating_add(1);
            arena.push_recent(player.owner);
        }
        emit!(ChipsClaimed {
            owner: player.owner,
            amount,
            first,
            balance: player.balance,
            ts: now,
        });
        Ok(())
    }

    #[session_auth_or(
        ctx.accounts.player.owner == ctx.accounts.signer.key(),
        ArenaError::Unauthorized
    )]
    pub fn buy(
        ctx: Context<PlayerAction>,
        outcome: u8,
        amount: u64,
        min_shares: u64,
        ability: u8,
    ) -> Result<()> {
        require!(
            outcome == OUTCOME_YES || outcome == OUTCOME_NO,
            ArenaError::InvalidOutcome
        );
        require!(ability <= ABILITY_CHEERS, ArenaError::InvalidAbility);
        require!(amount >= MIN_TRADE, ArenaError::AmountTooSmall);
        require!(amount <= MAX_TRADE, ArenaError::AmountTooLarge);
        let now = Clock::get()?.unix_timestamp;
        let mut arena_ref = ctx.accounts.arena.load_mut()?;
        let arena = &mut *arena_ref;
        let player = &mut ctx.accounts.player;
        require!(player.joined, ArenaError::NotJoined);
        require!(arena.current.status == ROUND_OPEN, ArenaError::RoundNotOpen);
        require!(
            now < arena.current.end_ts - TRADE_LOCK_SECONDS,
            ArenaError::TradingLocked
        );
        settle_resolved_slots(arena, player, now)?;
        require!(player.balance >= amount, ArenaError::InsufficientBalance);

        let round_id = arena.current.id;
        let slot = player
            .alloc_slot(round_id)
            .ok_or(ArenaError::NoPositionSlot)?;
        if ability != ABILITY_NONE {
            let position = &player.positions[slot];
            require!(
                now < arena.current.end_ts - ABILITY_LOCK_SECONDS,
                ArenaError::TradingLocked
            );
            require!(
                (position.ability == ABILITY_NONE || position.ability == ability)
                    && position.proceeds == 0,
                ArenaError::AbilityAlreadySet
            );
        }

        let (bought, other) = if outcome == OUTCOME_YES {
            (arena.current.yes_pool, arena.current.no_pool)
        } else {
            (arena.current.no_pool, arena.current.yes_pool)
        };
        let quote = math::quote_buy(bought, other, amount, arena.fee_bps)
            .ok_or(ArenaError::MathOverflow)?;
        require!(quote.shares >= min_shares, ArenaError::SlippageExceeded);

        if outcome == OUTCOME_YES {
            arena.current.yes_pool = quote.pool_bought;
            arena.current.no_pool = quote.pool_other;
        } else {
            arena.current.no_pool = quote.pool_bought;
            arena.current.yes_pool = quote.pool_other;
        }
        arena.current.collateral = arena
            .current
            .collateral
            .checked_add(quote.net)
            .ok_or(ArenaError::MathOverflow)?;
        arena.current.volume = arena.current.volume.saturating_add(amount);
        arena.current.trades = arena.current.trades.saturating_add(1);
        arena.treasury = arena
            .treasury
            .checked_add(quote.fee)
            .ok_or(ArenaError::MathOverflow)?;
        arena.total_volume = arena.total_volume.saturating_add(amount);
        arena.total_trades = arena.total_trades.saturating_add(1);

        player.balance -= amount;
        let heart_fresh =
            player.heart_ts > 0 && now.saturating_sub(player.heart_ts) <= HEART_FRESH_SECONDS;
        let heart_bpm = player.heart_bpm;
        {
            let position = &mut player.positions[slot];
            position.cost = position
                .cost
                .checked_add(amount)
                .ok_or(ArenaError::MathOverflow)?;
            if outcome == OUTCOME_YES {
                position.yes_shares = position.yes_shares.saturating_add(quote.shares);
                position.basis_yes = position.basis_yes.saturating_add(amount);
            } else {
                position.no_shares = position.no_shares.saturating_add(quote.shares);
                position.basis_no = position.basis_no.saturating_add(amount);
            }
            if ability != ABILITY_NONE {
                position.ability = ability;
            }
            if heart_fresh {
                position.max_bpm = position.max_bpm.max(heart_bpm);
                position.heart_samples = position.heart_samples.saturating_add(1);
            }
        }
        math::apply_trade_stats(player, outcome, amount, now);
        arena.push_recent(player.owner);

        emit!(TradeExecuted {
            round_id,
            owner: player.owner,
            outcome,
            side: SIDE_BUY,
            amount,
            shares: quote.shares,
            fee: quote.fee,
            yes_price_bps: math::yes_price_bps(arena.current.yes_pool, arena.current.no_pool),
            realized_pnl: 0,
            ability: player.positions[slot].ability,
            balance: player.balance,
            ts: now,
        });
        Ok(())
    }

    #[session_auth_or(
        ctx.accounts.player.owner == ctx.accounts.signer.key(),
        ArenaError::Unauthorized
    )]
    pub fn sell(ctx: Context<PlayerAction>, outcome: u8, shares: u64, min_out: u64) -> Result<()> {
        require!(
            outcome == OUTCOME_YES || outcome == OUTCOME_NO,
            ArenaError::InvalidOutcome
        );
        require!(shares > 0, ArenaError::NothingToSell);
        let now = Clock::get()?.unix_timestamp;
        let mut arena_ref = ctx.accounts.arena.load_mut()?;
        let arena = &mut *arena_ref;
        let player = &mut ctx.accounts.player;
        require!(player.joined, ArenaError::NotJoined);
        require!(arena.current.status == ROUND_OPEN, ArenaError::RoundNotOpen);
        require!(
            now < arena.current.end_ts - TRADE_LOCK_SECONDS,
            ArenaError::TradingLocked
        );

        let round_id = arena.current.id;
        let slot = player.slot_for(round_id).ok_or(ArenaError::NoPosition)?;
        let held = if outcome == OUTCOME_YES {
            player.positions[slot].yes_shares
        } else {
            player.positions[slot].no_shares
        };
        require!(shares <= held, ArenaError::NothingToSell);

        let (sold_pool, other_pool) = if outcome == OUTCOME_YES {
            (arena.current.yes_pool, arena.current.no_pool)
        } else {
            (arena.current.no_pool, arena.current.yes_pool)
        };
        let quote = math::quote_sell(sold_pool, other_pool, shares, arena.fee_bps)
            .ok_or(ArenaError::NothingToSell)?;
        require!(quote.out >= min_out, ArenaError::SlippageExceeded);
        require!(
            quote.gross <= arena.current.collateral,
            ArenaError::MathOverflow
        );

        if outcome == OUTCOME_YES {
            arena.current.yes_pool = quote.pool_sold;
            arena.current.no_pool = quote.pool_other;
        } else {
            arena.current.no_pool = quote.pool_sold;
            arena.current.yes_pool = quote.pool_other;
        }
        arena.current.collateral -= quote.gross;
        arena.current.volume = arena.current.volume.saturating_add(quote.out);
        arena.current.trades = arena.current.trades.saturating_add(1);
        arena.treasury = arena
            .treasury
            .checked_add(quote.fee)
            .ok_or(ArenaError::MathOverflow)?;
        arena.total_volume = arena.total_volume.saturating_add(quote.out);
        arena.total_trades = arena.total_trades.saturating_add(1);

        player.balance = player
            .balance
            .checked_add(quote.out)
            .ok_or(ArenaError::MathOverflow)?;
        let realized_pnl = {
            let position = &mut player.positions[slot];
            let basis = if outcome == OUTCOME_YES {
                position.basis_yes
            } else {
                position.basis_no
            };
            let portion = math::basis_portion(basis, shares, held);
            if outcome == OUTCOME_YES {
                position.basis_yes -= portion;
                position.yes_shares -= shares;
            } else {
                position.basis_no -= portion;
                position.no_shares -= shares;
            }
            position.proceeds = position.proceeds.saturating_add(quote.out);
            quote.out as i64 - portion as i64
        };

        emit!(TradeExecuted {
            round_id,
            owner: player.owner,
            outcome,
            side: SIDE_SELL,
            amount: quote.out,
            shares,
            fee: quote.fee,
            yes_price_bps: math::yes_price_bps(arena.current.yes_pool, arena.current.no_pool),
            realized_pnl,
            ability: player.positions[slot].ability,
            balance: player.balance,
            ts: now,
        });
        Ok(())
    }

    #[session_auth_or(
        ctx.accounts.player.owner == ctx.accounts.signer.key(),
        ArenaError::Unauthorized
    )]
    pub fn attach_ability(ctx: Context<PlayerView>, ability: u8) -> Result<()> {
        require!(
            (ABILITY_DOUBLE..=ABILITY_CHEERS).contains(&ability),
            ArenaError::InvalidAbility
        );
        let now = Clock::get()?.unix_timestamp;
        let (round_id, status, end_ts) = {
            let arena = ctx.accounts.arena.load()?;
            (arena.current.id, arena.current.status, arena.current.end_ts)
        };
        require!(status == ROUND_OPEN, ArenaError::RoundNotOpen);
        require!(now < end_ts - ABILITY_LOCK_SECONDS, ArenaError::TradingLocked);
        let player = &mut ctx.accounts.player;
        let slot = player.slot_for(round_id).ok_or(ArenaError::NoPosition)?;
        let position = &mut player.positions[slot];
        require!(
            position.ability == ABILITY_NONE && position.proceeds == 0,
            ArenaError::AbilityAlreadySet
        );
        require!(
            position.yes_shares > 0 || position.no_shares > 0,
            ArenaError::NoPosition
        );
        position.ability = ability;
        emit!(AbilityAttached {
            round_id,
            owner: player.owner,
            ability,
            ts: now,
        });
        Ok(())
    }

    #[session_auth_or(
        ctx.accounts.player.owner == ctx.accounts.signer.key(),
        ArenaError::Unauthorized
    )]
    pub fn report_heart(ctx: Context<PlayerView>, bpm: u16) -> Result<()> {
        require!(
            (HEART_BPM_MIN..=HEART_BPM_MAX).contains(&bpm),
            ArenaError::InvalidHeartRate
        );
        let now = Clock::get()?.unix_timestamp;
        let (round_id, status, end_ts) = {
            let arena = ctx.accounts.arena.load()?;
            (arena.current.id, arena.current.status, arena.current.end_ts)
        };
        let player = &mut ctx.accounts.player;
        player.heart_bpm = bpm;
        player.heart_ts = now;
        if status == ROUND_OPEN && now < end_ts {
            if let Some(slot) = player.slot_for(round_id) {
                let position = &mut player.positions[slot];
                position.max_bpm = position.max_bpm.max(bpm);
                position.heart_samples = position.heart_samples.saturating_add(1);
            }
        }
        emit!(HeartReported {
            owner: player.owner,
            bpm,
            ts: now,
        });
        Ok(())
    }

    // ---------------------------------------------------------------------
    // Ephemeral rollup: permissionless maintenance
    // ---------------------------------------------------------------------

    /// Settles every position whose round has resolved. Idempotent.
    pub fn settle_player(ctx: Context<SettlePlayer>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let mut arena_ref = ctx.accounts.arena.load_mut()?;
        settle_resolved_slots(&mut arena_ref, &mut ctx.accounts.player, now)?;
        Ok(())
    }

    /// Resolves the finished round with the oracle price and opens the next one.
    /// A no-op while the current round is still running, so the crank can tick often.
    pub fn roll_round(ctx: Context<RollRound>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let mut arena_ref = ctx.accounts.arena.load_mut()?;
        let arena = &mut *arena_ref;
        if arena.current.status == ROUND_OPEN && now < arena.current.end_ts {
            return Ok(());
        }
        let just_resolved = arena.current.status == ROUND_OPEN;
        if !just_resolved && arena.current.status == ROUND_RESOLVED && arena.treasury < arena.liquidity {
            // Already paused; wait quietly for the treasury to be refilled.
            return Ok(());
        }
        let price = oracle::read_price(&ctx.accounts.price_feed, &arena.oracle_feed, now)?;

        if just_resolved {
            let current = arena.current;
            let resolution = math::resolve_round(
                current.strike_price,
                price.price,
                current.yes_pool,
                current.no_pool,
                current.collateral,
            );
            arena.treasury = arena
                .treasury
                .checked_add(resolution.house_back)
                .ok_or(ArenaError::MathOverflow)?;
            arena.claims_outstanding = arena
                .claims_outstanding
                .checked_add(resolution.claims)
                .ok_or(ArenaError::MathOverflow)?;
            arena.current.close_price = price.price;
            arena.current.status = ROUND_RESOLVED;
            arena.current.outcome = resolution.outcome;
            arena.push_history(RoundSummary {
                id: current.id,
                start_ts: current.start_ts,
                end_ts: current.end_ts,
                strike_price: current.strike_price,
                close_price: price.price,
                yes_pool: current.yes_pool,
                no_pool: current.no_pool,
                volume: current.volume,
                trades: current.trades,
                price_expo: current.price_expo,
                outcome: resolution.outcome,
                _pad: [0; 3],
            });
            emit!(RoundResolved {
                round_id: current.id,
                strike_price: current.strike_price,
                close_price: price.price,
                price_expo: current.price_expo,
                outcome: resolution.outcome,
                yes_pool: current.yes_pool,
                no_pool: current.no_pool,
                volume: current.volume,
                trades: current.trades,
                house_back: resolution.house_back,
                ts: now,
            });
        }

        arena.last_roll_ts = now;
        if arena.treasury < arena.liquidity {
            emit!(ArenaPaused {
                treasury: arena.treasury,
                needed: arena.liquidity,
                ts: now,
            });
            return Ok(());
        }

        let id = arena
            .current
            .id
            .checked_add(1)
            .ok_or(ArenaError::MathOverflow)?;
        let liquidity = arena.liquidity;
        let end_ts = math::next_round_end(now, arena.round_seconds);
        arena.treasury -= liquidity;
        arena.current = RoundState {
            id,
            start_ts: now,
            end_ts,
            strike_price: price.price,
            close_price: 0,
            yes_pool: liquidity,
            no_pool: liquidity,
            collateral: liquidity,
            volume: 0,
            trades: 0,
            price_expo: price.exponent,
            status: ROUND_OPEN,
            outcome: OUTCOME_NONE,
            _pad: [0; 2],
        };
        emit!(RoundOpened {
            round_id: id,
            start_ts: now,
            end_ts,
            strike_price: price.price,
            price_expo: price.exponent,
            liquidity,
        });
        Ok(())
    }

    /// Frees a cheers request whose VRF callback never arrived so it can be retried.
    pub fn reset_cheers(ctx: Context<PlayerOnly>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let player = &mut ctx.accounts.player;
        require!(player.cheers_inflight == 1, ArenaError::NoCheersInflight);
        require!(
            now.saturating_sub(player.cheers_requested_ts) >= CHEERS_TIMEOUT_SECONDS,
            ArenaError::CheersNotTimedOut
        );
        player.cheers_inflight = 0;
        player.cheers_pending = player.cheers_pending.saturating_add(1);
        emit!(CheersReset {
            owner: player.owner,
            ts: now,
        });
        Ok(())
    }

    /// Asks MagicBlock VRF to pick up to ten recent traders for a won Cheers card.
    pub fn request_cheers<'info>(
        ctx: Context<'_, '_, 'info, 'info, RequestCheers<'info>>,
        caller_seed: [u8; 32],
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.oracle_queue.key(),
            VRF_EPHEMERAL_QUEUE,
            ArenaError::InvalidQueue
        );
        require!(
            ctx.remaining_accounts.len() <= MAX_CHEERS_CANDIDATES,
            ArenaError::TooManyCandidates
        );
        let now = Clock::get()?.unix_timestamp;
        let winner_owner = ctx.accounts.winner.owner;
        require!(ctx.accounts.winner.cheers_pending > 0, ArenaError::NoCheersPending);
        require!(ctx.accounts.winner.cheers_inflight == 0, ArenaError::CheersInflight);

        let mut metas = vec![
            SerializableAccountMeta {
                pubkey: ctx.accounts.arena.key(),
                is_signer: false,
                is_writable: true,
            },
            SerializableAccountMeta {
                pubkey: ctx.accounts.winner.key(),
                is_signer: false,
                is_writable: true,
            },
        ];
        {
            let arena = ctx.accounts.arena.load()?;
            let mut seen: Vec<Pubkey> = Vec::with_capacity(ctx.remaining_accounts.len());
            for account in ctx.remaining_accounts.iter() {
                require!(account.owner == &crate::ID, ArenaError::CheersCandidateInvalid);
                let candidate: Account<'info, Player> = Account::try_from(account)
                    .map_err(|_| error!(ArenaError::CheersCandidateInvalid))?;
                let (expected, _) = Pubkey::find_program_address(
                    &[PLAYER_SEED, candidate.owner.as_ref()],
                    &crate::ID,
                );
                require_keys_eq!(expected, account.key(), ArenaError::CheersCandidateInvalid);
                require!(
                    candidate.owner != winner_owner
                        && arena.is_recent(&candidate.owner)
                        && !seen.contains(&candidate.owner),
                    ArenaError::CheersCandidateInvalid
                );
                seen.push(candidate.owner);
                metas.push(SerializableAccountMeta {
                    pubkey: account.key(),
                    is_signer: false,
                    is_writable: true,
                });
            }
        }

        let winner = &mut ctx.accounts.winner;
        winner.cheers_pending -= 1;
        winner.cheers_inflight = 1;
        winner.cheers_requested_ts = now;

        let candidates = (metas.len() - 2) as u8;
        let ix = create_request_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: instruction::CheersCallback::DISCRIMINATOR.to_vec(),
            caller_seed,
            accounts_metas: Some(metas),
            callback_args: None,
        });
        ctx.accounts.winner.exit(&crate::ID)?;
        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
        emit!(CheersRequested {
            owner: winner_owner,
            candidates,
            ts: now,
        });
        Ok(())
    }

    /// VRF callback: pays CHEERS_AMOUNT to up to ten randomly chosen candidates.
    pub fn cheers_callback<'info>(
        ctx: Context<'_, '_, 'info, 'info, CheersCallback<'info>>,
        randomness: [u8; 32],
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let winner_owner = ctx.accounts.winner.owner;
        require!(ctx.accounts.winner.cheers_inflight == 1, ArenaError::NoCheersInflight);
        ctx.accounts.winner.cheers_inflight = 0;

        let mut arena_ref = ctx.accounts.arena.load_mut()?;
        let arena = &mut *arena_ref;
        let picks = math::pick_recipients(
            &randomness,
            ctx.remaining_accounts.len(),
            CHEERS_RECIPIENTS,
        );
        let mut recipients: Vec<Pubkey> = Vec::with_capacity(picks.len());
        for index in picks {
            if arena.treasury < CHEERS_AMOUNT {
                break;
            }
            let account = &ctx.remaining_accounts[index];
            if account.owner != &crate::ID || !account.is_writable {
                continue;
            }
            let mut candidate: Account<'info, Player> = match Account::try_from(account) {
                Ok(candidate) => candidate,
                Err(_) => continue,
            };
            if candidate.owner == winner_owner || recipients.contains(&candidate.owner) {
                continue;
            }
            candidate.balance = candidate.balance.saturating_add(CHEERS_AMOUNT);
            candidate.cheers_received = candidate.cheers_received.saturating_add(CHEERS_AMOUNT);
            candidate.exit(&crate::ID)?;
            arena.treasury -= CHEERS_AMOUNT;
            recipients.push(candidate.owner);
        }
        emit!(CheersPaid {
            owner: winner_owner,
            recipients,
            amount_each: CHEERS_AMOUNT,
            randomness,
            ts: now,
        });
        Ok(())
    }

    // ---------------------------------------------------------------------
    // Ephemeral rollup: authority / keeper
    // ---------------------------------------------------------------------

    /// Schedules `roll_round` on the ER through the MagicBlock crank scheduler.
    pub fn schedule_round_crank(
        ctx: Context<ScheduleRoundCrank>,
        task_id: i64,
        interval_ms: i64,
        iterations: i64,
    ) -> Result<()> {
        {
            let arena = ctx.accounts.arena.load()?;
            require_keys_eq!(arena.authority, ctx.accounts.authority.key(), ArenaError::Unauthorized);
            require_keys_eq!(
                arena.oracle_feed,
                ctx.accounts.price_feed.key(),
                ArenaError::OracleMismatch
            );
        }
        require!(interval_ms >= 500 && iterations > 0, ArenaError::InvalidConfig);

        let roll = Instruction {
            program_id: crate::ID,
            accounts: vec![
                AccountMeta::new(ctx.accounts.arena.key(), false),
                AccountMeta::new_readonly(ctx.accounts.price_feed.key(), false),
            ],
            data: anchor_lang::InstructionData::data(&instruction::RollRound {}),
        };
        let data = bincode::serialize(&MagicBlockInstruction::ScheduleTask(ScheduleTaskArgs {
            task_id,
            execution_interval_millis: interval_ms,
            iterations,
            instructions: vec![roll],
        }))
        .map_err(|_| error!(ArenaError::InvalidConfig))?;
        let schedule = Instruction {
            program_id: MAGIC_PROGRAM_ID,
            // Account 0 is the signing task authority; the rest are the accounts
            // the scheduled instruction touches.
            accounts: vec![
                AccountMeta::new(ctx.accounts.authority.key(), true),
                AccountMeta::new(ctx.accounts.arena.key(), false),
                AccountMeta::new_readonly(ctx.accounts.price_feed.key(), false),
            ],
            data,
        };
        invoke(
            &schedule,
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.arena.to_account_info(),
                ctx.accounts.price_feed.to_account_info(),
                ctx.accounts.magic_program.to_account_info(),
            ],
        )?;
        ctx.accounts.arena.load_mut()?.crank_task_id = task_id;
        Ok(())
    }

    /// Adds house chips (devnet play money) and records it on-chain.
    pub fn fund_treasury(ctx: Context<AuthorityArena>, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let mut arena = ctx.accounts.arena.load_mut()?;
        require_keys_eq!(arena.authority, ctx.accounts.authority.key(), ArenaError::Unauthorized);
        arena.treasury = arena
            .treasury
            .checked_add(amount)
            .ok_or(ArenaError::MathOverflow)?;
        emit!(TreasuryFunded {
            amount,
            treasury: arena.treasury,
            ts: now,
        });
        Ok(())
    }

    /// Commits the arena snapshot from the ER back to Solana (stays delegated).
    pub fn commit_arena(ctx: Context<CommitArena>) -> Result<()> {
        {
            let mut arena = ctx.accounts.arena.load_mut()?;
            let signer = ctx.accounts.payer.key();
            require!(
                signer == arena.authority || signer == arena.keeper,
                ArenaError::Unauthorized
            );
            arena.commits = arena.commits.saturating_add(1);
        }
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit(&[ctx.accounts.arena.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }

    /// Commits the player's account to Solana and keeps playing on the ER.
    pub fn commit_player(ctx: Context<OwnerCommitPlayer>) -> Result<()> {
        ctx.accounts.player.exit(&crate::ID)?;
        MagicIntentBundleBuilder::new(
            ctx.accounts.owner.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit(&[ctx.accounts.player.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }

    /// Commits the player's account and returns it to Solana.
    pub fn undelegate_player(ctx: Context<OwnerCommitPlayer>) -> Result<()> {
        ctx.accounts.player.exit(&crate::ID)?;
        MagicIntentBundleBuilder::new(
            ctx.accounts.owner.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.player.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }
}

fn settle_resolved_slots(arena: &mut Arena, player: &mut Player, now: i64) -> Result<u8> {
    let mut settled = 0u8;
    for index in 0..POSITION_SLOTS {
        let position = player.positions[index];
        if !position.active {
            continue;
        }
        let Some(summary) = arena.find_resolved(position.round_id) else {
            continue;
        };
        let result = math::settle_slot(&position, summary.outcome);
        arena.claims_outstanding = arena.claims_outstanding.saturating_sub(result.payout);
        let bonus = result.bonus.min(arena.treasury);
        arena.treasury -= bonus;
        let applied = math::SlotSettlement { bonus, ..result };
        player.balance = player
            .balance
            .checked_add(result.payout)
            .and_then(|balance| balance.checked_add(bonus))
            .ok_or(ArenaError::MathOverflow)?;
        math::apply_settle_stats(player, &applied);
        if applied.cheers {
            player.cheers_pending = player.cheers_pending.saturating_add(1);
        }
        player.positions[index] = Position::default();
        settled = settled.saturating_add(1);
        emit!(PositionSettled {
            round_id: position.round_id,
            owner: player.owner,
            outcome: summary.outcome,
            payout: result.payout,
            profit: result.profit,
            ability: position.ability,
            bonus,
            calm: applied.calm,
            cheers: applied.cheers,
            balance: player.balance,
            ts: now,
        });
    }
    Ok(settled)
}

// -------------------------------------------------------------------------
// Account contexts
// -------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeArena<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Arena::SIZE,
        seeds = [ARENA_SEED],
        bump
    )]
    pub arena: AccountLoader<'info, Arena>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateArena<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: arena PDA; its stored authority is checked before delegating.
    #[account(mut, del, seeds = [ARENA_SEED], bump)]
    pub arena: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct InitPlayer<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + Player::INIT_SPACE,
        seeds = [PLAYER_SEED, owner.key().as_ref()],
        bump
    )]
    pub player: Account<'info, Player>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePlayer<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: the owner's player PDA.
    #[account(mut, del, seeds = [PLAYER_SEED, owner.key().as_ref()], bump)]
    pub player: AccountInfo<'info>,
}

/// Player action that writes arena state. The signer is the owner or a session key.
#[derive(Accounts, Session)]
pub struct PlayerAction<'info> {
    pub signer: Signer<'info>,
    #[account(mut, seeds = [ARENA_SEED], bump)]
    pub arena: AccountLoader<'info, Arena>,
    #[account(mut, seeds = [PLAYER_SEED, player.owner.as_ref()], bump = player.bump)]
    pub player: Account<'info, Player>,
    #[session(signer = signer, authority = player.owner)]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
}

/// Player action that only reads arena state.
#[derive(Accounts, Session)]
pub struct PlayerView<'info> {
    pub signer: Signer<'info>,
    #[account(seeds = [ARENA_SEED], bump)]
    pub arena: AccountLoader<'info, Arena>,
    #[account(mut, seeds = [PLAYER_SEED, player.owner.as_ref()], bump = player.bump)]
    pub player: Account<'info, Player>,
    #[session(signer = signer, authority = player.owner)]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
}

#[derive(Accounts)]
pub struct SettlePlayer<'info> {
    #[account(mut, seeds = [ARENA_SEED], bump)]
    pub arena: AccountLoader<'info, Arena>,
    #[account(mut, seeds = [PLAYER_SEED, player.owner.as_ref()], bump = player.bump)]
    pub player: Account<'info, Player>,
}

#[derive(Accounts)]
pub struct PlayerOnly<'info> {
    #[account(mut, seeds = [PLAYER_SEED, player.owner.as_ref()], bump = player.bump)]
    pub player: Account<'info, Player>,
}

#[derive(Accounts)]
pub struct RollRound<'info> {
    #[account(mut, seeds = [ARENA_SEED], bump)]
    pub arena: AccountLoader<'info, Arena>,
    /// CHECK: validated against arena.oracle_feed and the oracle layout in the handler.
    pub price_feed: UncheckedAccount<'info>,
}

#[vrf]
#[derive(Accounts)]
pub struct RequestCheers<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [ARENA_SEED], bump)]
    pub arena: AccountLoader<'info, Arena>,
    #[account(mut, seeds = [PLAYER_SEED, winner.owner.as_ref()], bump = winner.bump)]
    pub winner: Account<'info, Player>,
    /// CHECK: must be the ephemeral VRF queue; checked in the handler.
    #[account(mut)]
    pub oracle_queue: UncheckedAccount<'info>,
}

#[vrf_callback]
#[derive(Accounts)]
pub struct CheersCallback<'info> {
    #[account(mut, seeds = [ARENA_SEED], bump)]
    pub arena: AccountLoader<'info, Arena>,
    #[account(mut, seeds = [PLAYER_SEED, winner.owner.as_ref()], bump = winner.bump)]
    pub winner: Account<'info, Player>,
}

#[derive(Accounts)]
pub struct ScheduleRoundCrank<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [ARENA_SEED], bump)]
    pub arena: AccountLoader<'info, Arena>,
    /// CHECK: checked against arena.oracle_feed.
    pub price_feed: UncheckedAccount<'info>,
    /// CHECK: MagicBlock magic program.
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
    /// CHECK: this program, referenced by the scheduled instruction.
    #[account(address = crate::ID)]
    pub program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct AuthorityArena<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [ARENA_SEED], bump)]
    pub arena: AccountLoader<'info, Arena>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitArena<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [ARENA_SEED], bump)]
    pub arena: AccountLoader<'info, Arena>,
}

#[commit]
#[derive(Accounts)]
pub struct OwnerCommitPlayer<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAYER_SEED, owner.key().as_ref()],
        bump = player.bump,
        constraint = player.owner == owner.key() @ ArenaError::Unauthorized
    )]
    pub player: Account<'info, Player>,
}
