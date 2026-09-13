use anchor_lang::prelude::*;

// Codes are positional: only ever append new variants.
#[error_code]
pub enum ArenaError {
    #[msg("Signer is not allowed to act for this account")]
    Unauthorized,
    #[msg("Invalid arena configuration")]
    InvalidConfig,
    #[msg("Player has not joined the arena yet")]
    NotJoined,
    #[msg("The round is not open for trading")]
    RoundNotOpen,
    #[msg("Trading is locked in the final seconds of the round")]
    TradingLocked,
    #[msg("Invalid outcome")]
    InvalidOutcome,
    #[msg("Trade amount is below the minimum")]
    AmountTooSmall,
    #[msg("Trade amount is above the maximum")]
    AmountTooLarge,
    #[msg("Not enough chips")]
    InsufficientBalance,
    #[msg("Price moved beyond the allowed slippage")]
    SlippageExceeded,
    #[msg("All position slots are in use; settle finished rounds first")]
    NoPositionSlot,
    #[msg("No position in the current round")]
    NoPosition,
    #[msg("Not enough shares to sell")]
    NothingToSell,
    #[msg("Invalid ability card")]
    InvalidAbility,
    #[msg("An ability card is already attached to this position")]
    AbilityAlreadySet,
    #[msg("Price feed does not match the arena oracle")]
    OracleMismatch,
    #[msg("Price feed is not owned by the MagicBlock oracle program")]
    OracleOwner,
    #[msg("Price feed account is malformed")]
    OracleInvalid,
    #[msg("Price feed is stale")]
    OracleStale,
    #[msg("House treasury is too low")]
    TreasuryInsufficient,
    #[msg("Faucet is cooling down")]
    FaucetCooldown,
    #[msg("Balance is too high to use the faucet")]
    FaucetBalanceTooHigh,
    #[msg("Heart rate is out of range")]
    InvalidHeartRate,
    #[msg("No cheers payout is pending")]
    NoCheersPending,
    #[msg("A cheers randomness request is already in flight")]
    CheersInflight,
    #[msg("No cheers randomness request is in flight")]
    NoCheersInflight,
    #[msg("The cheers request has not timed out yet")]
    CheersNotTimedOut,
    #[msg("Invalid cheers candidate")]
    CheersCandidateInvalid,
    #[msg("Too many cheers candidates")]
    TooManyCandidates,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid VRF queue")]
    InvalidQueue,
    #[msg("Every recent trader except the winner must be a Cheers candidate")]
    CheersCandidatesIncomplete,
}
