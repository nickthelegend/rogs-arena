# On-chain guard verification (devnet + MagicBlock ER)

Run at 2026-09-13T05:34:57.279Z in round 77. Players 6ymRDbhZjC3s1dPixLPNqGug3GsLAosr5c22T5pWUdxF, 6pFYFf9YUdnQqNuxhvnsZgHbuafvqrfCpjnaobQPqhyK; stranger EJSsThaUyC4UzoqgTS89BKkPPDA472pa3peCbfH5WBGH.

| Plan ID | Check | Result | Observed |
|---|---|---|---|
| CH-09 | second claim_chips is rejected | PASS | rejected: "Faucet is cooling down"; state unchanged: true |
| CH-07 | session key of A cannot trade for B | PASS | rejected: "Invalid session token"; state unchanged: true |
| CH-07 | stranger without a session token cannot trade for A | PASS | rejected: "Signer is not allowed to act for this account"; state unchanged: true |
| CH-11 | buy 0.5 USD is below the minimum | PASS | rejected: "Trade amount is below the minimum" |
| CH-11 | buy 101 USD is above the maximum | PASS | rejected: "Trade amount is above the maximum" |
| CH-11 | buy with more than the balance is rejected | PASS | rejected: "Not enough chips"; state unchanged: true |
| CH-12 | min_shares one above the quote fails slippage | PASS | rejected: "Price moved beyond the allowed slippage"; state unchanged: true |
| CH-15 | selling more shares than held fails | PASS | rejected: "Not enough shares to sell" |
| CH-16 | attach_ability on an open position succeeds | PASS | ability 1 tx 2geKkvrbFytQKKzqK99UseChoBKkZVAUd5yLwptYDQ9G8FvF4dC66sqamDZSW8HCte8U7jUzC2iecPfRNa1hGvXp |
| CH-16 | second ability card is rejected | PASS | rejected: "An ability card is already attached to this position" |
| CH-17 | report_heart 80 updates player and live position | PASS | heart 80 maxBpm 80 samples 1 tx 3pGwbkJbety7DSEcscPiGGMSNcCf9ePq72wM5eEbdhEfEqKaRxtMkRYzzMUYqwr4vwcVBLi8PykT7UqrPMLc6Pzm |
| CH-17 | report_heart 20 is out of range | PASS | rejected: "Heart rate is out of range" |
| CH-21 | settle_player with nothing resolved is an idempotent no-op | PASS | balance unchanged at 248 |
| CH-23 | fund_treasury by a non-authority is rejected | PASS | rejected: "Signer is not allowed to act for this account" |
| CH-23 | commit_arena by a non-authority is rejected | PASS | rejected: "Signer is not allowed to act for this account" |
| CH-16 | ability cannot be attached in the last 30 seconds | PASS | rejected: "Trading is locked in the final seconds of the round" |
| CH-13 | buy in the last 5 seconds is locked | PASS | rejected: "Trading is locked in the final seconds of the round" |
