use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ArenaError;

/// Typed mirror of the PriceUpdateV2 layout that MagicBlock's pricing oracle
/// writes (same field order as pyth_solana_receiver_sdk).
#[derive(AnchorDeserialize, Clone, Copy, Debug)]
pub struct PriceFeedMessage {
    pub feed_id: [u8; 32],
    pub price: i64,
    pub conf: u64,
    pub exponent: i32,
    pub publish_time: i64,
    pub prev_publish_time: i64,
    pub ema_price: i64,
    pub ema_conf: u64,
}

#[derive(AnchorDeserialize, Clone, Copy, Debug)]
pub enum VerificationLevel {
    Partial { num_signatures: u8 },
    Full,
}

#[derive(AnchorDeserialize, Clone, Copy, Debug)]
pub struct PriceUpdateV2 {
    pub write_authority: Pubkey,
    pub verification_level: VerificationLevel,
    pub price_message: PriceFeedMessage,
    pub posted_slot: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OraclePrice {
    pub price: i64,
    pub exponent: i32,
    pub publish_time: i64,
}

/// Validates identity, owner, layout, republisher evidence, value and freshness.
pub fn decode_price(
    key: &Pubkey,
    owner: &Pubkey,
    expected: &Pubkey,
    data: &[u8],
    now: i64,
    max_age: i64,
) -> Result<OraclePrice> {
    require_keys_eq!(*key, *expected, ArenaError::OracleMismatch);
    require_keys_eq!(*owner, ORACLE_PROGRAM_ID, ArenaError::OracleOwner);
    require!(
        data.len() > 8 && data[..8] == PRICE_UPDATE_DISCRIMINATOR[..],
        ArenaError::OracleInvalid
    );
    let mut body = &data[8..];
    let update =
        PriceUpdateV2::deserialize(&mut body).map_err(|_| error!(ArenaError::OracleInvalid))?;
    let message = update.price_message;
    // The oracle stores each feed under an account whose key equals its feed id.
    require!(message.feed_id == key.to_bytes(), ArenaError::OracleInvalid);
    // Initialisation writes a zero placeholder with posted_slot 0; a republisher update never does.
    require!(update.posted_slot > 0, ArenaError::OracleInvalid);
    require!(message.price > 0, ArenaError::OracleInvalid);
    require!(
        message.publish_time <= now.saturating_add(MAX_PRICE_FUTURE_SECONDS)
            && now.saturating_sub(message.publish_time) <= max_age,
        ArenaError::OracleStale
    );
    Ok(OraclePrice {
        price: message.price,
        exponent: message.exponent,
        publish_time: message.publish_time,
    })
}

pub fn read_price(account: &AccountInfo, expected: &Pubkey, now: i64) -> Result<OraclePrice> {
    let data = account.try_borrow_data()?;
    decode_price(
        account.key,
        account.owner,
        expected,
        &data,
        now,
        MAX_PRICE_AGE_SECONDS,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed_bytes(key: &Pubkey, price: i64, publish_time: i64, posted_slot: u64) -> Vec<u8> {
        let mut data = PRICE_UPDATE_DISCRIMINATOR.to_vec();
        data.extend_from_slice(&[7u8; 32]); // write_authority
        data.push(1); // VerificationLevel::Full
        data.extend_from_slice(&key.to_bytes());
        data.extend_from_slice(&price.to_le_bytes());
        data.extend_from_slice(&42u64.to_le_bytes()); // conf
        data.extend_from_slice(&8i32.to_le_bytes()); // exponent as stored by the republisher
        data.extend_from_slice(&publish_time.to_le_bytes());
        data.extend_from_slice(&(publish_time - 1).to_le_bytes());
        data.extend_from_slice(&price.to_le_bytes()); // ema_price
        data.extend_from_slice(&42u64.to_le_bytes()); // ema_conf
        data.extend_from_slice(&posted_slot.to_le_bytes());
        data
    }

    #[test]
    fn layout_is_133_bytes() {
        let key = Pubkey::new_unique();
        assert_eq!(feed_bytes(&key, 1, 1, 1).len(), 133);
    }

    #[test]
    fn decodes_a_fresh_feed() {
        let key = Pubkey::new_unique();
        let data = feed_bytes(&key, 7_725_514_539_148, 1_000, 99);
        let price = decode_price(&key, &ORACLE_PROGRAM_ID, &key, &data, 1_010, 30).unwrap();
        assert_eq!(
            price,
            OraclePrice {
                price: 7_725_514_539_148,
                exponent: 8,
                publish_time: 1_000
            }
        );
    }

    #[test]
    fn rejects_wrong_key_owner_discriminator_slot_price_and_age() {
        let key = Pubkey::new_unique();
        let other = Pubkey::new_unique();
        let good = feed_bytes(&key, 100, 1_000, 99);

        assert!(decode_price(&key, &ORACLE_PROGRAM_ID, &other, &good, 1_000, 30).is_err());
        assert!(decode_price(&key, &other, &key, &good, 1_000, 30).is_err());

        let mut bad_disc = good.clone();
        bad_disc[0] ^= 0xff;
        assert!(decode_price(&key, &ORACLE_PROGRAM_ID, &key, &bad_disc, 1_000, 30).is_err());

        let mismatched_feed = feed_bytes(&other, 100, 1_000, 99);
        assert!(
            decode_price(&key, &ORACLE_PROGRAM_ID, &key, &mismatched_feed, 1_000, 30).is_err()
        );

        let placeholder = feed_bytes(&key, 100, 1_000, 0);
        assert!(decode_price(&key, &ORACLE_PROGRAM_ID, &key, &placeholder, 1_000, 30).is_err());

        let negative = feed_bytes(&key, -5, 1_000, 99);
        assert!(decode_price(&key, &ORACLE_PROGRAM_ID, &key, &negative, 1_000, 30).is_err());

        // 31 seconds old with a 30 second limit.
        assert!(decode_price(&key, &ORACLE_PROGRAM_ID, &key, &good, 1_031, 30).is_err());
        // Exactly 30 seconds old is accepted.
        assert!(decode_price(&key, &ORACLE_PROGRAM_ID, &key, &good, 1_030, 30).is_ok());
        // Published 6 seconds in the future is rejected.
        assert!(decode_price(&key, &ORACLE_PROGRAM_ID, &key, &good, 994, 30).is_err());

        assert!(decode_price(&key, &ORACLE_PROGRAM_ID, &key, &good[..20], 1_000, 30).is_err());
    }
}
