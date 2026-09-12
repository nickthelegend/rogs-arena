# On-chain guard verification (devnet + MagicBlock ER)

Run at 2026-09-12T23:24:57.478Z in round 3. Players 2QHhrwqQm9uNzYx8bgfs4AEwusLbNFuTp3uU8SYLc8ai, 9AXH6sKjMLJB8Qc3QqBu53kqMckZC5NibMHA7AMCy4Cp; stranger 2Ju7gQ2XrBF3HyKApQWyiM3XgjSGFnmC19azaPUjDSG4.

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
| CH-16 | attach_ability on an open position succeeds | PASS | ability 1 tx JXRbJ8Z2oto4EubxHYgQirYE8q1W8kg3z9vwUradFm8pvELMwWC1oNRiYQkHFDChyJXhF7eUw4R6HyQm7nwRs23 |
| CH-16 | second ability card is rejected | PASS | rejected: "An ability card is already attached to this position" |
| CH-17 | report_heart 80 updates player and live position | PASS | heart 80 maxBpm 80 samples 1 tx 5ubwz5cog8vunSbz5BFVotEhmF13riqXxpMUQudsCqKexEUyTBJgsH2zp57Me3iWpj5B7CfmwKcAU8JGtvjJNZEz |
| CH-17 | report_heart 20 is out of range | PASS | rejected: "Heart rate is out of range" |
| CH-21 | settle_player with nothing resolved is an idempotent no-op | PASS | balance unchanged at 248 |
| CH-23 | fund_treasury by a non-authority is rejected | PASS | rejected: "Signer is not allowed to act for this account" |
| CH-23 | commit_arena by a non-authority is rejected | PASS | rejected: "Signer is not allowed to act for this account" |
| CH-16 | ability cannot be attached in the last 30 seconds | PASS | rejected: "Trading is locked in the final seconds of the round" |
| CH-13 | buy in the last 5 seconds is locked | PASS | rejected: "Trading is locked in the final seconds of the round" |
