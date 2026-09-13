# E2E devnet run

Run at 2026-09-13T05:25:08.773Z against program `J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q`, MagicBlock ER `devnet-as`.
Players: `7RvUJJp2HmnUT8iGCo7tCoaKnEpT2646vLxwJcMQmeJp`, `HLLUrunz89zKoVkV84AkNH3swXUihUzBw9QYQ6qUkbjo`. Arena round now 76, treasury 988061.30 USD.

| # | Step | Result | Detail | Transaction |
|---|---|---|---|---|
| 1 | fund players | PASS | 7RvUJJp2HmnUT8iGCo7tCoaKnEpT2646vLxwJcMQmeJp, HLLUrunz89zKoVkV84AkNH3swXUihUzBw9QYQ6qUkbjo | [UyjYGYVQ…](https://explorer.solana.com/tx/UyjYGYVQAaEWWz9DSMdCUzDSCKcEqUrxUWhFXxa9RSVyMSrrJyrSjAiv2tKjFta8CGMFoqsApgyCqtZb2T35C1z?cluster=devnet) |
| 2 | P1 init+delegate player | PASS | 7JdgsEM98Qu31KRx7AVEMbHrLD6udFUiiJ9twjCUthDs | [45aFb1qC…](https://explorer.solana.com/tx/45aFb1qCwhx3uNvtiBgeoguv89JwVyErgQ9vMFZQbyBMS739Y6DF1Ngw6LHRsPSjwgFdeGRf8K9jXj31NxSpw9H6?cluster=devnet) |
| 3 | P1 create session key | PASS | signer 2WyLV9Bt2CAcperkR6Dh5C962n5rkaPeHt7MfJvN5LMV token 9vwFbsazWb2pvHqyqt78hif8t2dwd19s1WVgyCrVRsyx | [3kuNfiMk…](https://explorer.solana.com/tx/3kuNfiMkbmvjR7DPgg2t2N7ZWAz8wLQpQcYFgo8mV15zweXyh7c4oo8XoLnvVqtepDNBgtMPyogbrpNbsoGqsZXE?cluster=devnet) |
| 4 | P2 init+delegate player | PASS | 3657tuxcyJsSHDJfc5VEQdv5KTPjhxypLbnTkyXyn7Wt | [3nEw1YDA…](https://explorer.solana.com/tx/3nEw1YDAr7x9AGeesk5WUFzswQqkbmoHrbKuMn4BtsR9HaZ74btPy6mEfvU7ytU9YxYRfdJZU2rirSN13v81qtyG?cluster=devnet) |
| 5 | P2 create session key | PASS | signer CvZddGEzptLZ4hSHVxAWwJ28hCuZA8EwQ9LWx68qLfdH token 8JFxCqK3365r8BeLix7ZnmXKBNP6qZbut5PjuN4A3Kbp | [5WzMz6DG…](https://explorer.solana.com/tx/5WzMz6DGEEfNFSdjUdsaA2Aqok7yRGLXubf1rGC9gmba28y2NQTCHvnhj5yp5kbxML9zZELj5PY7HLZgSJiQ9cgo?cluster=devnet) |
| 6 | P1 claim_chips via session key | PASS | balance 250.000000 USD | [4j3dKF4r…](https://solscan.io/tx/4j3dKF4rF1PyZHx8VCewQhPzKqY31HySogq1rNwCqGkE6JefG2y7vxL1EBPF7begn1aEustSeivMkqPT7mVKvGJc?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 7 | P2 claim_chips via session key | PASS | balance 250.000000 USD | [2BwM5emA…](https://solscan.io/tx/2BwM5emAFx3FqXYM5EvX75RxL4bwoN5xULmy6EqhQrPjWVb81twSWP6kg7Xd9MCAiCHtWc56PtRTWqfqTWVZDgkj?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 8 | round open | PASS | round 75 strike 7723653118316 ends 2026-09-13T05:25:00.000Z | — |
| 9 | P1 report_heart 80 bpm | PASS | on-chain heart rate | [3467UivX…](https://solscan.io/tx/3467UivXmiX3Vxo2TsjE1igGfqWe9BCVWoWhABnfXGyrf6P4TNxWr3yymjP46fszVSDYVurLxLvNZSbHLRgGMjYn?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 10 | P1 buy YES $5 + Calm pulse | PASS | shares 9552616 (quote 9552616), maxBpm 80 | [365dFjb8…](https://solscan.io/tx/365dFjb8gdrM2tKwVgoXU12n3DWmNfhusKnVTk5ECd4HV6q6T5RGHoyiSCNNsBwqMsgzw5b2yEAHT8YtKVCWGBCM?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 11 | P1 balance after buy | PASS | 245000000 | — |
| 12 | P2 buy NO $5 + Cheers | PASS | shares 10264143 (quote 10264143) | [43atw1c9…](https://solscan.io/tx/43atw1c9ZLwjLenz2smNYC5kqyq7ZnbAzGFoLPj3PWaP94AY1WNAfbaN5vXGKNzpYqXBsyuzLPfL67Ki1J7uDZQo?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 13 | P2 sell half NO (take profit/stop) | PASS | sold 5132071 shares for 2.466515 USD | [CRajLdH4…](https://solscan.io/tx/CRajLdH4kc7rDvZdqVEuMLyD3g8mb1V145wU6ZhmCMRt3NCMzFSspv3qUrFZ9p9rJyGa18L68AJfEBeCDUrGBXC?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 14 | P2 balance after buy+sell | PASS | 247466515 | — |
| 15 | attach_ability after sell is rejected | PASS | An ability card is already attached to this position | — |
| 16 | crank rolled the round inside the ER | PASS | outcome YES strike 7723653118316 close 7725107384877, rolled 1s after end | — |
| 17 | P1 settle_player | PASS | payout 9.552616 profit 4.552616 bonus 10.000000 calm true cheers false; balance delta 19.552616; settled by script; wins 1 losses 0 calmWins 1 | [4p2Z8PU3…](https://solscan.io/tx/4p2Z8PU32yqCBEszAHQS1n5FgqaE5YX2pcFpSbuQeR18H5A43b3K6jdRZ4h425sfNbVEt5ZryEQsnt3rJd6uejLb?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 18 | P2 settle_player | PASS | payout 0.000000 profit -2.533485 bonus 0.000000 calm false cheers false; balance delta 0.000000; settled by script; wins 0 losses 1 calmWins 0 | [2PUqpQF9…](https://solscan.io/tx/2PUqpQF9Wv85Nttk3VKDMnGuhTk8kqKChXYCWy39ThVC5mZhZeiB75to2HRWgdW9uj7YcAXNyGqrFNrpRvNf5dCQ?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 19 | cheers via VRF | NOT EXERCISED | the Cheers position did not finish in profit this run; e2e-cheers-vrf.ts exercises it deterministically | — |
| 20 | P1 commit_player to Solana | PASS | commit scheduled from the ER | [4eDLFrrN…](https://solscan.io/tx/4eDLFrrNspF7sZEv4bcmWJksQ2z45kjmv64xaouJYWrE5jLezJntyJYNXNxUe9H9V5rkwCSpiKvmjNMFpG8T7g2Z?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 21 | base layer shows committed player state | PASS | trades 1 balance 264.552616 USD | — |

## Arena commit to Solana (MagicIntentBundleBuilder)

Run at 2026-09-12T23:18:40.506Z. The `commit_arena` transaction on the ER is [2qc96JkV…](https://solscan.io/tx/2qc96JkVd681n6icMr1hnDqpi8BkJhnSiYqUfyPa76r63AuERz5Ew4K9Nr5ezrWaPNJPdD2tmbbWNxVqciB6sMAL?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app).
Before the commit, Solana held round 0, 0 trades and 0 commits.
After it landed, Solana held round 2, 6 trades and 1 commits. The account is still owned by the delegation program, so the arena kept running on the ER. Result: PASS.

## Cheers via MagicBlock VRF (deterministic run)

Run at 2026-09-12T23:20:03.109Z.

| Step | Result | Detail | Transaction |
|---|---|---|---|
| fund players | PASS | BymPzSSHHUbhcw9qB1TLQkzcV2HD17n3mB4Ax2FP9699, 42j1sjE7LUGWdgD25zVgypDx5jhkzbDCZzWMVzV8RqL4 | [4AFcCmTw…](https://explorer.solana.com/tx/4AFcCmTwLuvD5tQjd7be8Bo2XYwU4gviqWFj6chKoeafAnNRAa2oYc9gEt8UABfwDpDXi2ZyyS3PhPX1tU5DeV8v?cluster=devnet) |
| players delegated, sessions created, chips claimed | PASS | both players at 250 USD | — |
| P2 buy YES $5 with Cheers | PASS | 9780446 shares in round 2 | [5TndLzKc…](https://solscan.io/tx/5TndLzKccc1e1M1bhzrZiWZHDH4AsftW1F7i5iDrbDkz1Gr399nciGwi1mvyHmofH4xYsQU4usS7rAZ7K8SUeD3A?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| P1 buy YES $90 (moves the AMM price) | PASS | 148238266 shares | [3P7b1vt8…](https://solscan.io/tx/3P7b1vt8s4jLfqKiHCT8BtW9B4MGesDDuW1WTmgu77HUVjXyxnJa3mBWUsNb4KzQxKHcZ6CSCNvadkc8mbsp7a4W?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| sell quote is above cost | PASS | sell 9780446 YES for 6.572087 USD vs cost 5 USD | — |
| P2 sells into the move | PASS | realized 1.572087 USD | [VWZVMvTE…](https://solscan.io/tx/VWZVMvTECoxtBzkMGufaGBy1JbzQFgtXbAGAz6Vf87WmqXWs1ZXXu1phqQ7DKcb9eSfumXZxoYmBg4gRiWJ6f7Z?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| crank rolled the round | PASS | round 2 outcome NO, 1s after end | — |
| P2 settle marks Cheers pending | PASS | profit 1.572087 USD, cheers_pending 1 | [3du9hknx…](https://solscan.io/tx/3du9hknxvxSHgYfcKeFH6LYuXQP6FEua2WwQFHAxDmpqKX9zy4wGEAWMYK4W6EFQTLy7TTxWaAyoC5sAj8xcRZVZ?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| P2 request_cheers on the ephemeral VRF queue | PASS | candidate: P1 | [3z18MVog…](https://solscan.io/tx/3z18MVog4zgBTpE6jDiUSdaj9L8P5Z2XkaxG254npPNXFTVwKThtHc2UxaiQjdoSMqYK2E21r6vUePijTnQijpHH?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| VRF callback paid Cheers | PASS | P1 balance +1 USD, cheers_received 1 USD; `CheersPaid` recipients BymPzSSHHUbhcw9qB1TLQkzcV2HD17n3mB4Ax2FP9699, randomness 4a55442c30cc9f666a70d4cc73db947864bef23082dc658af5375c312cc72cb5 | [3acK2K49…](https://solscan.io/tx/3acK2K49b37rgwVbSXFBdYmk7p937iNzHmrvMBpktJLsfTSZrTazMsQqTivjbkH5kE9VcCJztK4cGJupKTxvVbtV?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |

## Player undelegate and re-delegate (commit_and_undelegate)

Run at 2026-09-12T23:41:13.669Z. Wallet `6dtg7sbLJqH4vkaFNPi79pKTpHQhbom4X5g6EimHJdeX`, Player `ENnMBsqQugmvrQJ1zPTex82PGUvoVN5xN2hfyAeg3ezW`.

| Step | Result | Detail | Transaction |
|---|---|---|---|
| fund wallet | PASS | 6dtg7sbLJqH4vkaFNPi79pKTpHQhbom4X5g6EimHJdeX | [37TgQdwW…](https://explorer.solana.com/tx/37TgQdwWWaJiJvEdWaR3vzYZHXDxjZtVxoDovRLggaQJ8XptHZiog3FfzU9sP4sSkpn7o7PwFrWFcJukEZPDv8pW?cluster=devnet) |
| init + delegate Player | PASS | ENnMBsqQugmvrQJ1zPTex82PGUvoVN5xN2hfyAeg3ezW | [4owwE46X…](https://explorer.solana.com/tx/4owwE46XL479Seaun7n7d5JKFyCUUG9FwrCcBfRS2vw49oc9vGBV9iwnXK3eXYnjnasrxnpf4vabghYZqZXFpS3W?cluster=devnet) |
| claim_chips on the ER | PASS | ER balance 250.000000 USD | [5hXduYvN…](https://solscan.io/tx/5hXduYvNB2NoMAXKawwZihtCaV9nQCPJbidq23sXhiLZVb6NSbzwFB6D3PTEUG9Yr4KSHAJr1hXoc5dG1EN4zFjN?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| router reports delegated | PASS | {"isDelegated":true,"fqdn":"https://devnet-as.magicblock.app/","delegationRecord":{"authority":"MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57","owner":"J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q","delegationSlot":497432872,"lamports":2656840}} | — |
| undelegate_player (commit_and_undelegate) | PASS | scheduled from the ER | [3sCuC1UP…](https://solscan.io/tx/3sCuC1UPpgtuqoxGcBRBMeHQvYjYusYCvyXCHViTMcEYhjh2Sfahidqs1c1jWfetxBWUC4FKr5S8DcKx5ewTgaCm?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| Player back under the program on Solana with ER state | PASS | owner J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q, base balance 250.000000 USD | — |
| router reports undelegated | PASS | {"isDelegated":false} | — |
| re-delegate Player, balance intact on the ER | PASS | ER balance 250.000000 USD | [2HBvpN1P…](https://explorer.solana.com/tx/2HBvpN1PwDy6wi9qKbh81XGCQgDhMQi1ikYvVr28podWyTQmnUJBmL1EDXcXh4M5szKJmx96hiSxeXJCzCxqUshR?cluster=devnet) |

## Keeper settlement and indexer backfill (Railway)

Run at 2026-09-13T00:00:03.566Z. Wallet `7qPBMRNjF9LgQNFHk2AbYHrojFK2ymJG4zyXdWTbiX3t`, round 10, buy [2DddNbY2…](https://solscan.io/tx/2DddNbY2r6Xt1snsLzhhNPUvqWHL1rkj2kVp7aszoiwtMK3ezUwgAdXiWt3hGyTBGP825PwTGP87417BXpiyPRBT?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app).

| Item | Result | Detail | Transaction |
|---|---|---|---|
| IDX-02 | NOT EXERCISED | attempt 1: the ~2s Railway restart was already over, so the service was up when the buy landed and backfill was never tested (/api/trades returned it 0s later via the live subscription). The re-test runs with the indexer disabled; see the next section | [2DddNbY2…](https://solscan.io/tx/2DddNbY2r6Xt1snsLzhhNPUvqWHL1rkj2kVp7aszoiwtMK3ezUwgAdXiWt3hGyTBGP825PwTGP87417BXpiyPRBT?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| KPR-01 | PASS | round 10 rolled at 1789257601; position settled 1s later by the keeper; payout 0 profit -5; the player never sent settle_player | [3fvVSGxE…](https://solscan.io/tx/3fvVSGxEFUthRP3VmHJJBHJBSKKWMbwrHy3ahHYN8vx4hKASrZYa6Cmukm59fdcQDZohdJCewFuTfxmmBNEoCuWu?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |

## Keeper settlement and indexer backfill (Railway)

Run at 2026-09-13T00:15:03.722Z. Wallet `AYUjvQx9x3Cdnw6nnbpZqLcx6o9kDELky2C56mP66THd`, round 13, buy [48jQpd4p…](https://solscan.io/tx/48jQpd4pSMZQtfurKdrdqYcMXgwUgLjDfXQXXWyKBjMFmvNsB7SiUXQCvnyvn9i4jgPEAwG3DDgmCTsQNdVhgC4r?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app).

| Item | Result | Detail | Transaction |
|---|---|---|---|
| IDX-02 | PASS | service was down when the buy landed; /api/trades returned it 64s later | [48jQpd4p…](https://solscan.io/tx/48jQpd4pSMZQtfurKdrdqYcMXgwUgLjDfXQXXWyKBjMFmvNsB7SiUXQCvnyvn9i4jgPEAwG3DDgmCTsQNdVhgC4r?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| KPR-01 | PASS | round 13 rolled at 1789258501; position settled 2s later by the keeper; payout 0 profit -5; the player never sent settle_player | [5wPrSPt6…](https://solscan.io/tx/5wPrSPt61EkHCykPMg7zCCrJbGn7byzA424kQzvjKapfmHBeaUR52G5wkuEERgiDLiSHTtyFrsS8BgsHB6X4kjYs?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |

## Keeper-driven Cheers via MagicBlock VRF (KPR-02)

Run at 2026-09-13T01:05:07.128Z, round 23. P1 `trcZbBkneuEyDipagM4jodA7ZHoX2g6nDuVnvvK339r`, P2 `J7tfWQ3L2xzwRevektQ4Ba5S7gKYMRZ3PGsKepfFwPxn`.

| Step | Result | Detail | Transaction |
|---|---|---|---|
| P2 buys YES $5 with the Cheers card | PASS | round 23 | [2Wxy93J4…](https://solscan.io/tx/2Wxy93J4xzeMe8RakXe8Nf9EwxSfSrvRVhLGCsxiBRsmnDP7DPK7cpCKMfRVCvP5NKgrrEKoNnWwkWCzJW1Pdqec?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| P1 buys YES $90 (moves the AMM) | PASS | 148238266 shares | [2WQCtMsB…](https://solscan.io/tx/2WQCtMsByHGMPaHE8ghJdvyNnujScMViAW2bRbTqspfZ2k1PL4GY9qD6uQUmrR3qbXVLfwYRELgm2HEQ6y777i46?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| P2 sells into the move at a profit | PASS | out 6.572087 USD vs cost 5 USD | [2RAXujme…](https://solscan.io/tx/2RAXujmeKqbaMyX5SDpoPxccRtUCSFmezxgKZgAXkXoJTj8iH3gZh5P1XRujvNbHnWGm9iVjDnxjmn71y6BxLaoF?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| P1 received Cheers after resolution | PASS | cheers_received 1 USD | — |
| P2 settled by the keeper | PASS | signer 59o1MkshqjC4oQcZsTCCn13BxDuFHGmNNrFfdYNhrj9r | [PE9kz5ce…](https://solscan.io/tx/PE9kz5ceFEfhNDfWqoGG2NC6jKBKyQiBuHfWnsWwqoXvRHZKPaNp7nDywXjoSDLziuJSLJqBYZBB1od2y8vX6Bx?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| request_cheers sent by the keeper | PASS | signer 59o1MkshqjC4oQcZsTCCn13BxDuFHGmNNrFfdYNhrj9r | [uvTQ8pGy…](https://solscan.io/tx/uvTQ8pGyYKNJSfUcoZ4vwCXnnQ5eWxThJY84e1cuoWFzjWLbBuLbw7LVXc3U438JwfPzjxxwVSNFSHbqwQHKXEv?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| VRF callback paid recent traders | PASS | recipients 10 (incl. P1), 1 USD each, randomness b186e4ee9a49627c… | [5LC56dLU…](https://solscan.io/tx/5LC56dLU8kzKNcEU7Z1ZyjDdQS6aV2JtcfN9kkqbGjb4WFpCmLHj4V9Ke1jJyddvnmNovXQDGuPhUPKoTMaTCf44?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| indexer stored the CheersPaid row | PASS | /api/cheers has 5LC56dLU8k… | — |

## Keeper-driven Cheers via MagicBlock VRF (KPR-02)

Run at 2026-09-13T04:20:37.635Z, round 62. P1 `DLp625rAtS8ZYMaAwPPgUE1YVoSAqBeW4QWHdjMCMTZr`, P2 `H98t7WeEuj723wT4CEo7PghncW7Jz6TbGHAk1ou7tdpK`.

| Step | Result | Detail | Transaction |
|---|---|---|---|
| P2 buys YES $5 with the Cheers card | PASS | round 62 | [Nj6mu16F…](https://solscan.io/tx/Nj6mu16FPXF3f8ntRuU5mouvQdFfvKxS6gRpHyhhdeMq1qN2Jy85xuJgERCxqEDLb6wbHQHQJ84MPax4x6PJKTr?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| P1 buys YES $90 (moves the AMM) | PASS | 262772634 shares | [5XQRNRJ4…](https://solscan.io/tx/5XQRNRJ45iyusQmaaJaVbNEkftv7pjCyLgho9yZvDWipym9r4HcAUWGrxebaMnSU7wxQfG6UQdsv5gxSjMTJVsdf?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| P2 sells into the move at a profit | PASS | out 11.028891 USD vs cost 5 USD | [5fL8FgTt…](https://solscan.io/tx/5fL8FgTtFsK9LCPJE1Skr51JoWpowbqS8ZzB7XaEZzrVfseZbGb83bifzXHpam8afbxCA77kFWNUES51XqxPjzfR?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| P1 received Cheers after resolution | PASS | cheers_received 1 USD | — |
| P2 settled by the keeper | PASS | signer 59o1MkshqjC4oQcZsTCCn13BxDuFHGmNNrFfdYNhrj9r | [5FCJNGrT…](https://solscan.io/tx/5FCJNGrTtD6TzBQ3c63oAZhfqsATDGUi1xhDgvFAmERcHNYDPWeKoSRVbYrpYJ9uKv2HhgdScJ2ZgiTZWAqUB5Bz?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| request_cheers sent by the keeper | PASS | signer 59o1MkshqjC4oQcZsTCCn13BxDuFHGmNNrFfdYNhrj9r | [2psQ2rpP…](https://solscan.io/tx/2psQ2rpPcPA9enyh397e4bBBb71kFnR8QdJB5BQDTCDC2PkRKzipesLXFPRtCzaHr4pNHuGYkunreRdgBzieQNZL?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| VRF callback paid recent traders | PASS | recipients 10 (incl. P1), 1 USD each, randomness 512b107f8c0b3381… | [44rT1Gn7…](https://solscan.io/tx/44rT1Gn7d8kCp8AyF5nfKyQs8PGX89gK9YNXHwyoVi8bfyD3Ks68nSmSzXKx4QDA5U2nY4cu1Pj45gwUecairZx2?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| indexer stored the CheersPaid row | PASS | /api/cheers has 44rT1Gn7d8… | — |

## Player undelegate and re-delegate (commit_and_undelegate)

Run at 2026-09-13T05:32:33.044Z. Wallet `5me19h1tzAfnsKFUq7sfREfL6UU5Z6J8tc4eKGditrm7`, Player `CRKZgckMfEVxQ5e5Tzgw1EKx3LUzRYXnRruhHpMzZndP`.

| Step | Result | Detail | Transaction |
|---|---|---|---|
| fund wallet | PASS | 5me19h1tzAfnsKFUq7sfREfL6UU5Z6J8tc4eKGditrm7 | [5RELHGcj…](https://explorer.solana.com/tx/5RELHGcjB16vkBB5Whp4arZuQT2wRD8JseHDwJwqgjJ1ehcoyNZdVpLyWEZidpwmETPLxam4S4EDuB1AREkkE9YH?cluster=devnet) |
| init + delegate Player | PASS | CRKZgckMfEVxQ5e5Tzgw1EKx3LUzRYXnRruhHpMzZndP | [2zGG5PTq…](https://explorer.solana.com/tx/2zGG5PTqV3XAgjySacoUWY2aowALa6ngpYE9zibkwXJncVnjvzGvmgbsqUnZ7wfoYXU6jFFeL6Svq3QfPQHvAG2s?cluster=devnet) |
| claim_chips on the ER | PASS | ER balance 250.000000 USD | [4w9w2Lir…](https://solscan.io/tx/4w9w2LirauPdYdiRNNF2ceMoB3k7KqvKzh3ytdN6xeb4Ak2iCn38mNV2ph4fhhwdhgr3jSHVeC27Spk1BEcuvqjN?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| router reports delegated | PASS | {"isDelegated":true,"fqdn":"https://devnet-as.magicblock.app/","delegationRecord":{"authority":"MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57","owner":"J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q","delegationSlot":497561311,"lamports":2656840}} | — |
| undelegate_player (commit_and_undelegate) | PASS | scheduled from the ER | [32DuaHNn…](https://solscan.io/tx/32DuaHNnWgyEgEP6tiDct5vohiBvVT3Xoq5zWeEdo2vk97yDsspfT194jDa3d1p8WkADbzfMDvv5aGaqZcmMPnk3?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| Player back under the program on Solana with ER state | PASS | owner J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q, base balance 250.000000 USD | — |
| router reports undelegated | PASS | {"isDelegated":false} | — |
| re-delegate Player, balance intact on the ER | PASS | ER balance 250.000000 USD | [5KaCaJyo…](https://explorer.solana.com/tx/5KaCaJyoQqbGbmrKcY6WgxzoGeEwD45D98V5U3uPurogerm3zbXv3xVNPaykreLsHeMCMXofkPchd1fnoGqnk2CU?cluster=devnet) |

## Keeper-driven Cheers via MagicBlock VRF (KPR-02 / MG-07, XRP, Fair Cheers v2)

Run at 2026-09-13T05:35:07.179Z, round 4398046511113. P1 `7NRuYymx21L11CWktn1A2adBkBx85iiWmiyfqb5rWup4`, P2 `8bC9Rw8zGrXEZV8yS7wxghcHWkSo8nMeyLsG974pqwAE`.

| Step | Result | Detail | Transaction |
|---|---|---|---|
| P2 buys YES $5 with the Cheers card | PASS | XRP round 4398046511113 | [4pjeKUUD…](https://solscan.io/tx/4pjeKUUD6po7XqyzLjomcsBCH5MHw3mCD8TMxMcYgK1fPNrnxUcJ6DCAmobyYEDDunYAs7jRoEXgKNSrrp9FuvBH?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| P1 buys YES $90 (moves the AMM) | PASS | 148238266 shares | [43SLgJbr…](https://solscan.io/tx/43SLgJbrwRJgifRYLMv94CKU3BsvsX1FDhAoFTQHLXVfvdkxpeVDWECFaq9ygLRs6rcoWYrv8EF8xt32og3BWR3D?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| P2 sells into the move at a profit | PASS | out 6.572087 USD vs cost 5 USD | [2Qg2apf6…](https://solscan.io/tx/2Qg2apf6FeexCREAPe6cnB3t8paKWYWwgD6rV3sF55x4mcKw8ncPdDvXVbhLGqTzf1YVSP3MC9KEPhrj2Hj2dDgB?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| P1 received Cheers after resolution | PASS | cheers_received 1 USD | — |
| P2 settled by the keeper | PASS | signer 59o1MkshqjC4oQcZsTCCn13BxDuFHGmNNrFfdYNhrj9r | [5A2hKpXo…](https://solscan.io/tx/5A2hKpXovdK5AVZ6ccsXCpU2u9atHvNzQQRMwYhLwSKqpRHTBp5Xry91QLFkT7jsDoyUutgDKTAx1ihHTg2U8rNt?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| request_cheers sent by the keeper | PASS | signer 59o1MkshqjC4oQcZsTCCn13BxDuFHGmNNrFfdYNhrj9r | [WoLerxar…](https://solscan.io/tx/WoLerxar1F1BMWr5tcMT1JwtujjUSS5H4yR12WTb9zZkzA5HtebhbsruyYbEPUvbdiQkjywjodbjDjkFbvxywtC?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| VRF callback paid recent traders | PASS | recipients 1 (incl. P1), 1 USD each, randomness 5daee9eb21aea83f… | [5utGZhqQ…](https://solscan.io/tx/5utGZhqQRGE6QXEb8Bpxj4KH81uqQ3NszNC4MgqMwG7qmD8jQMLiWviDD595iu4jPHZyw1Bdgcy56JB9Gg3uJjWj?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| indexer stored the CheersPaid row | PASS | /api/cheers has 5utGZhqQRG… | — |
