# On-chain guard verification (devnet + MagicBlock ER)

Run at 2026-09-13T11:24:57.322Z in round 147. Players 3aS8LZQF89MteHbifwhNJXSEkuW2j6w4B4Y6tsRoTVBo, 8DWdhD5s55FgxQPqZMkMPPKewArWXc9rkzTx6EmDh1jF; stranger 4okUrCBDeLqeHESpZzhFpUaomGiojGs6SXAQW8wNF3x1.

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
| CH-16 | attach_ability on an open position succeeds | PASS | ability 1 tx 5reVYkgs7uLHS7GWg3DrcCSaQKEFZZHYj7EobLG2B8t2KtFuWUKwZdbz16nxBzrtdWtfs31zeyB9z3fNXRGJS9eg |
| CH-16 | second ability card is rejected | PASS | rejected: "An ability card is already attached to this position" |
| CH-17 | report_heart 80 updates player and live position | PASS | heart 80 maxBpm 80 samples 1 tx 3hr3FU2RiuNJbZhBfSfikELyi9MRtxDQJj2WzbZHop6jQuwJW5aDVLvHH2qWrScBuqZvR6JmTXEEuENMzb9ZUneX |
| CH-17 | report_heart 20 is out of range | PASS | rejected: "Heart rate is out of range" |
| CH-21 | settle_player with nothing resolved is an idempotent no-op | PASS | balance unchanged at 248 |
| CH-23 | fund_treasury by a non-authority is rejected | PASS | rejected: "Signer is not allowed to act for this account" |
| CH-23 | commit_arena by a non-authority is rejected | PASS | rejected: "Signer is not allowed to act for this account" |
| CH-16 | ability cannot be attached in the last 30 seconds | PASS | rejected: "Trading is locked in the final seconds of the round" |
| CH-13 | buy in the last 5 seconds is locked | PASS | rejected: "Trading is locked in the final seconds of the round" |

## Fair Cheers v2 (upgrade #2)

Run at 2026-09-13T11:25:02.731Z, DOGE round 5497558138959.

| Plan ID | Check | Result | Observed |
|---|---|---|---|
| MG-01 | a curated candidate list is rejected | PASS | P1 only, of 12 recent traders; rejected: "Every recent trader except the winner must be a Cheers candidate" |
| MG-01 | the complete candidate list is accepted and the VRF callback pays | PASS | request 3A3rJoz3zAa2ADuYe1kb8qospPCE4f77MBW5Wcod1N8QDXhNkbFZjcWM8SYVdPa9T4hgz4LGAmTiaLJZwt3Wpwdf; 12 candidates, 10 paid 1 USD each (expected 10) |

## Ability bonuses (deterministic)

Run at 2026-09-13T11:30:03.599Z, round 148.

| Plan ID | Check | Result | Observed |
|---|---|---|---|
| CH-19 | Double Profit bonus | PASS | profit 0.445101 USD, bonus 0.445101 (expected 0.445101), balance delta 0.445101, settled by script, tx 3aLb9T5CK5JC8PVkgmnu6uiJKzF5X27YMjXzsV7Bfk25tJRKALxfJPeBbpyfSHm2ZdZH3gKgbULs4K3WdG7EUvJo |
| CH-19 | Protect Loss bonus | PASS | profit -1.818918 USD, bonus 1.818918 (expected 1.818918), balance delta 1.818918, settled by script, tx 2GtdBNuamHo2exppMqecJ2v7wwKaWtyxaLjXf5CiCVPJhufDEFXNd92WQmSMBZfBMcFH2wsFfkHkpr5kb5WEh4Zf |
