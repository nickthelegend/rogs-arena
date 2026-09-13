# E2E devnet run

Run at 2026-09-12T23:15:07.809Z against program `J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q`, MagicBlock ER `devnet-as`.
Players: `75hZaAkk1Cnv1mctMQvSa9rGKLxtcvJm6WXxKYhT2qfE`, `DjYUFBgaPSQoyeUSa1BU1e2p2e92FSWuS7SAHzUXChYi`. Arena round now 2, treasury 999287.75 USD.

| # | Step | Result | Detail | Transaction |
|---|---|---|---|---|
| 1 | fund players | PASS | 75hZaAkk1Cnv1mctMQvSa9rGKLxtcvJm6WXxKYhT2qfE, DjYUFBgaPSQoyeUSa1BU1e2p2e92FSWuS7SAHzUXChYi | [4bQ2K3U2…](https://explorer.solana.com/tx/4bQ2K3U2Xkhg4HKTbLxHw7v7qG9kFcxc1wbYqxppyzD1driaEKQTjqw3CZkeTBnNXUQfFkXi3EwxJr7m1z3oFS9i?cluster=devnet) |
| 2 | P1 init+delegate player | PASS | F6Ht4ykBNX5yYhrEdgndF5eWumxuRzTmJ1a7ZmDjGw6 | [2Hap4Rjf…](https://explorer.solana.com/tx/2Hap4RjfnYRRXaC2MkDQvw4TkNaEHgyAzZtJ3GjAs8nJTePZWssXG7ipqSrC4ck1n5mGcpfswEDhJBJXtK8wyoPR?cluster=devnet) |
| 3 | P1 create session key | PASS | signer 4BZVFzEerPXAdvY6DaxXTjKZj1mrcMzCL9pRshMpBuSp token 6kx7AdQvcn25py44NeaTdgy3Pdwyz2ioqGqjaS9H6Yin | [4tEVFnMu…](https://explorer.solana.com/tx/4tEVFnMuy4aC4QQtRSJ4wta4hqnvQuaBY4BUCbdRAHQnXVbPK8BrpUhjd8MdmTdhHVfBWyfFeBs3BRvzWgp8BsZV?cluster=devnet) |
| 4 | P2 init+delegate player | PASS | 2qajnhQrFXzWRJRYnu5zcyirhQFzkBhDFnhQ7JL1AQZB | [2dptWrsB…](https://explorer.solana.com/tx/2dptWrsBVPcV7XqgNXEMBxitXtyzMZ3rhEoJ9y17ZRr1WhkBnSfrGs6E58KBHXxkc9zUpzCUJmAxMQv1Fyq2ae3p?cluster=devnet) |
| 5 | P2 create session key | PASS | signer 7JV9t9gcjrLsXHixecmZ4FqDMVC4dshXxkJSNKjYB5qC token 3S9Te9AhpssZrQ8FcfwVTECDm9UQfEnSvgbcTvdUZSg6 | [4qiJiSZG…](https://explorer.solana.com/tx/4qiJiSZGwt27SaUPHNe33mNSeYocEzt6P6ojdpaAhKmyV4gHhWGtBc7UFRXbWAj4t6HJr4tpPzR2TeaQRrFGQZzQ?cluster=devnet) |
| 6 | P1 claim_chips via session key | PASS | balance 250.000000 USD | [41XV3Ute…](https://solscan.io/tx/41XV3UteUrU4jnRKF2CFVmoroazvAW5GFBG9cSjBW9AAu3G1tqQqVBTvoLaicU5mMpA41pcwvjrcTDX4GgvHm1u8?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 7 | P2 claim_chips via session key | PASS | balance 250.000000 USD | [3zzHGQiY…](https://solscan.io/tx/3zzHGQiYPan8bgSMrmhZpoY1fameikFhu9UDUdKzx9489PqTUrhg36uxYaR3QwNQSegddz9V6F8E5gY2MYFeVMP5?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 8 | round open | PASS | round 1 strike 7725570971918 ends 2026-09-12T23:15:00.000Z | — |
| 9 | P1 report_heart 80 bpm | PASS | on-chain heart rate | [2p5NfkAw…](https://solscan.io/tx/2p5NfkAwZGe73nk1XgBBMSnv2GQ3NY14rjotKMF4sez3wNopZuHYGcT4mZD8jZ5Bt4bdTLkc4vvMR2zgoHaSyoWC?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 10 | P1 buy YES $5 + Calm pulse | PASS | shares 9780446 (quote 9780446), maxBpm 80 | [3gh5Mhbz…](https://solscan.io/tx/3gh5MhbzQFBJm2NZRyQ9KyMnivgJNTy64AvqLFqfECZRVPU1NkG9aZrizSri7WTUimJFhfn4VK9uavzyeHynDivM?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 11 | P1 balance after buy | PASS | 245000000 | — |
| 12 | P2 buy NO $5 + Cheers | PASS | shares 10019482 (quote 10019482) | [woeRhRoT…](https://solscan.io/tx/woeRhRoTxkmNeRQJ6Ctj7hJukMTXnkPMJjR6HPTRfaEyUWYoeZTLsUyDLgokYe9NH3PieVzb4PB6QaAUcx6t39G?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 13 | P2 sell half NO (take profit/stop) | PASS | sold 5009741 shares for 2.465775 USD | [3ege7gTK…](https://solscan.io/tx/3ege7gTK41PizhrAkVuKNnxDTSiVrY7pX4nJWHaEesSwx9jWCGrcxtCDXmwE1aHuiAEUZKme87FN27dFt42Pzqzx?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 14 | P2 balance after buy+sell | PASS | 247465775 | — |
| 15 | attach_ability after sell is rejected | PASS | An ability card is already attached to this position | — |
| 16 | crank rolled the round inside the ER | PASS | outcome YES strike 7725570971918 close 7726266920786, rolled 1s after end | — |
| 17 | P1 settle_player | PASS | payout 9.780446 profit 4.780446 bonus 10.000000 calm true cheers false; balance delta 19.780446; wins 1 losses 0 calmWins 1 | [3zMLWSBB…](https://solscan.io/tx/3zMLWSBBf65YsxLWh5qk4yta2xPxq5VHC6sHdesmdM1zECiBzWCbVjJddAgeKV4HicwmfDLSFE9N8efSbDJHQtCc?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 18 | P2 settle_player | PASS | payout 0.000000 profit -2.534225 bonus 0.000000 calm false cheers false; balance delta 0.000000; wins 0 losses 1 calmWins 0 | [5dpUySWh…](https://solscan.io/tx/5dpUySWhmdkyKXNcPg7BaQnCm1xmowd6xT6taV87LT37yBBv1XDgpGYcEmgKwy3PfBWPTKsppLswEUoMB5CNsf8Z?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 19 | cheers via VRF | NOT EXERCISED | the Cheers position did not finish in profit this run; VRF Cheers is verified in the deterministic run below | — |
| 20 | P1 commit_player to Solana | PASS | commit scheduled from the ER | [Np1fntai…](https://solscan.io/tx/Np1fntai7EzWQDYBWvTTRu8oH578suvoy5dfHqAPhnBPug3bCpJfGurGYJDcCkMHXyauj9XmqYgRy9xLT5RK6j2?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 21 | base layer shows committed player state | PASS | trades 1 balance 264.780446 USD | — |

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
