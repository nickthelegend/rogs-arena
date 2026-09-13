# On-chain guard verification (devnet + MagicBlock ER)

Run at 2026-09-13T04:19:57.300Z in round 62. Players 2L9g6ucZTGk3aW72rPq7EZBkJnjjW68hnPaHszU5JN51, 61wHHewZ2adoagxquaxaEjMGy3m7nMpp4VNAorT34GwS; stranger HsavAR6wCzMAdTtykhvJcZMH8rthuiNTdxR3y1fP57vw.

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
| CH-16 | attach_ability on an open position succeeds | PASS | ability 1 tx 5XfMA5KhfAshmcy18fFrzwSDmYvXZY1GqEtn46ewXB43NaxpPrFbJJUxVaudTR5m6faXt5BATnBeMzuGcymmZTMW |
| CH-16 | second ability card is rejected | PASS | rejected: "An ability card is already attached to this position" |
| CH-17 | report_heart 80 updates player and live position | PASS | heart 80 maxBpm 80 samples 1 tx 4smXdda2HvrbKLQQbetHSFVgCVMHBr5cSnZLy2qJzWj32wQFs8UVnqAkx93VQZ2uSw6ssuwqsLoWcLtQp1gERUbM |
| CH-17 | report_heart 20 is out of range | PASS | rejected: "Heart rate is out of range" |
| CH-21 | settle_player with nothing resolved is an idempotent no-op | PASS | balance unchanged at 248 |
| CH-23 | fund_treasury by a non-authority is rejected | PASS | rejected: "Signer is not allowed to act for this account" |
| CH-23 | commit_arena by a non-authority is rejected | PASS | rejected: "Signer is not allowed to act for this account" |
| CH-16 | ability cannot be attached in the last 30 seconds | PASS | rejected: "Trading is locked in the final seconds of the round" |
| CH-13 | buy in the last 5 seconds is locked | PASS | rejected: "Trading is locked in the final seconds of the round" |

## Ability bonuses (deterministic)

Run at 2026-09-13T04:25:03.156Z, round 63.

| Plan ID | Check | Result | Observed |
|---|---|---|---|
| CH-19 | Double Profit bonus | FAIL | profit 1.104787 USD, bonus ? (expected 1.104787), balance delta 0, tx 4cGKQz5Y8o4WzVBCU5e1piexz1ffu2vPHfnqvbdMmHNyezJfv9Fwjt7U4DdEKw9rG53pnZhYKGakUksjStQETYPj |
| CH-19 | Protect Loss bonus | FAIL | profit -1.861869 USD, bonus ? (expected 1.861869), balance delta 0, tx 61BF1NeMJxiiJbdqtq8HP4excY55gqfNnGDoEAGYKRyzhskJRN1ZfJ7aKr4EnT1t1h5kNM4RXk43EbDnFcBTQpPr |

## Badges via Magic Action

Run at 2026-09-13T05:09:42.504Z, owner 8eDMMBRUjR9vLoAsSJ7Sz3UVH1vY81khDP4uSipLHuUA.

| Plan ID | Check | Result | Observed |
|---|---|---|---|
| MG-04 | record_badges called directly by the owner wallet | PASS | rejected: "Signature verification failed.
Missing signature for public key [`EF6ujrSgkwUcFj1rQ2rt1iStXFMph82KfqqgdmR5Ppja`]."; updates still 0 |
| MG-03 | post-commit Magic Action wrote the badge record on Solana | FAIL | BadgeRecord did not change within 120 s after ER tx 5QdYnkifsKfQKMDzkUw4Xarw3qt9WhGK4QH5J4heFzF3Me9kD66r2Mpc2Ui5hrqAi3ZnN19rjrLFKm8Pf8DTen1K |
| MG-05 | GetCommitmentSignature resolves the base commit that ran record_badges | FAIL | base sig 4p3zACtvvzGYm12kZ6RPPXxve3jvYDhhcdTxrhrbT1bFYVxtE6NzKZvn8xWfyuw5wL17VZxmU5VWjW6zjpBXY3qk (https://explorer.solana.com/tx/4p3zACtvvzGYm12kZ6RPPXxve3jvYDhhcdTxrhrbT1bFYVxtE6NzKZvn8xWfyuw5wL17VZxmU5VWjW6zjpBXY3qk?cluster=devnet); err null; RecordBadges in logs: false |

## Fair Cheers v2 (upgrade #2)

Run at 2026-09-13T05:15:01.536Z, ETH round 1099511627781.

| Plan ID | Check | Result | Observed |
|---|---|---|---|
| MG-01 | a curated candidate list is rejected | PASS | P1 only, of 2 recent traders; rejected: "Every recent trader except the winner must be a Cheers candidate" |
| MG-01 | the complete candidate list is accepted and the VRF callback pays | PASS | request 372cfSaVuQAJJAjR68C88HVkkBCtfd1g8BjpzXhbgH5SC117R5k7dyMiCFmehUFELYGfWqfQSqcSi53JffrkAFpv; 2 candidates, 2 paid 1 USD each (expected 2) |

## Badges via Magic Action

Run at 2026-09-13T05:21:41.189Z, owner Gf84dtWa8KcXPJ4VeDYe4eSjeWQoN6spcbQWA4BmzuAj.

| Plan ID | Check | Result | Observed |
|---|---|---|---|
| MG-04 | record_badges called directly by the owner wallet | PASS | rejected on-chain: "A signer constraint was violated"; updates still 0 |
| MG-03 | post-commit Magic Action wrote the badge record on Solana | PASS | updates 0 -> 1; trades 1 (ER 1), badges 0 (ER 0), best streak 0; ER tx 5GHEvQNXG6sbux2aAovdv9bt7nhQich9A1sapPvmPtzTm6P5sgCuHmgwH4SKGFM4gkePSXpCnR7KF9efHQ4erUxt |
| MG-05 | GetCommitmentSignature resolves the base commit that ran record_badges | PASS | base sig 3g9psLHtbcd5so1bMXwYcMS5J6uVqKx391aJuvtreEhvdauR8suKkrE55y77Jd7SK9gSnxTbYvKpgAtfqG6f5vWd (https://explorer.solana.com/tx/3g9psLHtbcd5so1bMXwYcMS5J6uVqKx391aJuvtreEhvdauR8suKkrE55y77Jd7SK9gSnxTbYvKpgAtfqG6f5vWd?cluster=devnet); err null; RecordBadges in logs: true |

## Fair Cheers v2 (upgrade #2)

Run at 2026-09-13T05:25:03.208Z, BNB round 3298534883335.

| Plan ID | Check | Result | Observed |
|---|---|---|---|
| MG-01 | a curated candidate list is rejected | PASS | P1 only, of 2 recent traders; rejected: "Every recent trader except the winner must be a Cheers candidate" |
| MG-01 | the complete candidate list is accepted and the VRF callback pays | PASS | request 2F3djEJAqES1Q6jyDbtF1cr9tZx12zuNVuRxdgFam9hvRvUbcxim9bynhhSuXPmSdrxLAaF4nvTTnQHhZhmSUizF; 2 candidates, 2 paid 1 USD each (expected 2) |
