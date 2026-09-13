# E2E devnet run

Run at 2026-09-13T11:05:06.497Z against program `J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q`, MagicBlock ER `devnet-as`.
Players: `BDACE83xK1mKRBqrvdsb4tFx5dnRJoW2LM4HZJZMieHS`, `Dfjid6C7Q5Y2Uz8q8GGFeewRxzhhCkhY2Y2htqvuogpJ`. Arena round now 144, treasury 980383.73 USD.

| # | Step | Result | Detail | Transaction |
|---|---|---|---|---|
| 1 | fund players | PASS | BDACE83xK1mKRBqrvdsb4tFx5dnRJoW2LM4HZJZMieHS, Dfjid6C7Q5Y2Uz8q8GGFeewRxzhhCkhY2Y2htqvuogpJ | [4P7B5mtU…](https://explorer.solana.com/tx/4P7B5mtUeAYBZqYimBtxMfkP77ySBpjcUDKeR5ii9rb91qgeo8PCoi6bKwuz53MfpmCpY9WNHUd2whKVj7xdBumK?cluster=devnet) |
| 2 | P1 init+delegate player | PASS | 7qHf3WbVufM1YnYMwBh8uFpKKfCh45nn5rYFUpyaw8ef | [3vwPRdd1…](https://explorer.solana.com/tx/3vwPRdd19wa65GvGSEt3Rm1Xbo1zkXcy6LkYZxdofVfMksY9V5it6AbnNET9GiXCi2z5xWpd3jF2LGRQCLD7iQ6f?cluster=devnet) |
| 3 | P1 create session key | PASS | signer 2yA1BrkbzoJx7p7JHJh4cHyQoaMLNBXsvWyHo2QwSv8d token DnywAA1LtmZCnjeEUJ366Zo7gvirx9SGXAxpvViMwczF | [2uyhvG8j…](https://explorer.solana.com/tx/2uyhvG8jp1nLGKMMpWMEZVaJYW3wotxbjd3ZnwVm8epZW87ew9uKfmSA84GdP99iuD15TWsNy7NbrLf7rodTr7Bb?cluster=devnet) |
| 4 | P2 init+delegate player | PASS | 3PdwUCgzb92KYpSv1JwrATibFFWPMcTNTHpetq1MSvYx | [Xx7bMa6X…](https://explorer.solana.com/tx/Xx7bMa6XMNdHZDPgMs8cAaMPWNcQWjYqRyLVvzGsYvL7nbMQ3gvcgrvfq6ukLwDjSyyrvGbAvmN5ue7sYw8cypT?cluster=devnet) |
| 5 | P2 create session key | PASS | signer EMAMPKwP1jSKWSDFWN5WZojimehfVa51iiC7dZZ4Rgeh token FaQ3kQncJNbnxAR2offmGZiJUTHFkfBp3Mz92wNAuPZk | [3Fzy64zm…](https://explorer.solana.com/tx/3Fzy64zmf9uM6WfYssRhiXZCpL9oEz58nuxJDUnCrPosv3CsxpLZRnwTxTJd1pGnK1C95bMAP7Ls7t2NCp7iaap1?cluster=devnet) |
| 6 | P1 claim_chips via session key | PASS | balance 250.000000 USD | [5yERimTA…](https://solscan.io/tx/5yERimTAwCf3DnDRo191jSP3AatUzMQGNWL4Lfcpa7FQbeNpb34gqKSC69nnCDB8X2xfuxaQNcPpVBxbN7q4ruuM?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 7 | P2 claim_chips via session key | PASS | balance 250.000000 USD | [5JBFerRz…](https://solscan.io/tx/5JBFerRzogV811pKMnTHkQyfkWAw54T619fjPuM5GdKgFQdaak4YaG9mbLnD4XKSdrnv4THMVn7cntdYN5rTtMip?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 8 | round open | PASS | round 143 strike 7665513843941 ends 2026-09-13T11:05:00.000Z | — |
| 9 | P1 report_heart 80 bpm | PASS | on-chain heart rate | [2zuRz8Vr…](https://solscan.io/tx/2zuRz8VrfgDCRocfdwRXTtXWL8QbTmn9EFBmub9qEHm17skdPT6bkdYv6hjnviNNKXuTwYYNa6sT1VBTk9XWxkZL?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 10 | P1 buy YES $5 + Calm pulse | PASS | shares 10104930 (quote 10104930), maxBpm 80 | [x2X5fpCT…](https://solscan.io/tx/x2X5fpCT4TLaBv9j2pU1t7VW2NjvRvGhNwuPSHSX5koeEzUYZS3SBPHw99asVjPnHSR2yqkGFuyPrXkTMnW6r2t?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 11 | P1 balance after buy | PASS | 245000000 | — |
| 12 | P2 buy NO $5 + Cheers | PASS | shares 9707933 (quote 9707933) | [3Uf5KN6v…](https://solscan.io/tx/3Uf5KN6vUUT6gxKXdhPG22nRTiUhZWkgaoMs8YDF3pkmge8QLoDscp5Ej6hj18Z52c2eyGVc2aTBigCSdNXXNMce?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 13 | P2 sell half NO (take profit/stop) | PASS | sold 4853966 shares for 2.464819 USD | [3renjaGE…](https://solscan.io/tx/3renjaGE1DjTvw2gYjruwTuHKzRhsDstDPuUAhzBC65F5VeS3ABkLrXfy6CjmFLE5xuNW3QbbPV3Zku3wJ2bBaSm?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 14 | P2 balance after buy+sell | PASS | 247464819 | — |
| 15 | attach_ability after sell is rejected | PASS | An ability card is already attached to this position | — |
| 16 | crank rolled the round inside the ER | PASS | outcome YES strike 7665513843941 close 7666639515820, rolled 1s after end | — |
| 17 | P1 settle_player | PASS | payout 10.104930 profit 5.104930 bonus 10.000000 calm true cheers false; balance delta 20.104930; settled by script; wins 1 losses 0 calmWins 1 | [3dabfN6i…](https://solscan.io/tx/3dabfN6i6VEvarQrSjajYXFQPJz5MsRWx2Lm9wLmXE66pmmbMApSN8Qb49XAAr48sBNt6wueFXzJ2MMANznF1Xzf?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 18 | P2 settle_player | PASS | payout 0.000000 profit -2.535181 bonus 0.000000 calm false cheers false; balance delta 0.000000; settled by script; wins 0 losses 1 calmWins 0 | [2XiDt3PZ…](https://solscan.io/tx/2XiDt3PZhcRbKjyEc7zAux1AV744GnCgXgh3XsrAQjx7zg6btSduAHqtU3eEHs1J688Y77YtctQ54nC3ZQp14MGw?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 19 | cheers via VRF | NOT EXERCISED | the Cheers position did not finish in profit this run; e2e-cheers-vrf.ts exercises it deterministically | — |
| 20 | P1 commit_player to Solana | PASS | commit scheduled from the ER | [5Sq9DFvW…](https://solscan.io/tx/5Sq9DFvWunzjRa6Cmh5LdGnCg2JRFfZcoctqhuVPCxkuHvHsTUXHdtp3tatXiNxoh8TaGCn5aNuot9QmG2Sai773?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 21 | base layer shows committed player state | PASS | trades 1 balance 265.104930 USD | — |

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

## Player undelegate and re-delegate (commit_and_undelegate)

Run at 2026-09-13T11:25:23.712Z. Wallet `8rDt4WLzy3Y5r764VcxAWL5BJcj47BV5w8s8VNWV5vSv`, Player `FTsbpv59z1tFpzZvKi3QnRvZmWkYusaZWoSm8HECqXif`.

| Step | Result | Detail | Transaction |
|---|---|---|---|
| fund wallet | PASS | 8rDt4WLzy3Y5r764VcxAWL5BJcj47BV5w8s8VNWV5vSv | [2zKSZN6E…](https://explorer.solana.com/tx/2zKSZN6EDceAymYo75Hq6G5SUsNuAik9eQvGgwwTAobhwLocvB3gZwcRjcy4pC89cE8WVA4qvUsr7WyZ7ZBmvdy7?cluster=devnet) |
| init + delegate Player | PASS | FTsbpv59z1tFpzZvKi3QnRvZmWkYusaZWoSm8HECqXif | [2SSugHLg…](https://explorer.solana.com/tx/2SSugHLgBy64MPZtJZxbRqTM8T9rn7T3fSTqpFQMZDsMeBk9SUByfNJRQqG9WX5oke3ZMRdRxFW38mrEkcXVswpy?cluster=devnet) |
| claim_chips on the ER | PASS | ER balance 250.000000 USD | [4HGmrn1y…](https://solscan.io/tx/4HGmrn1yf7GMTu9i41Ft5TiwZmw5NHjzAYUeWheXkUtyHnEHoJSf7BNjnKya9mcpgCQWBtCtXXPSDpfc94aRvp6e?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| router reports delegated | PASS | {"isDelegated":true,"fqdn":"https://devnet-as.magicblock.app/","delegationRecord":{"authority":"MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57","owner":"J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q","delegationSlot":497690278,"lamports":2656840}} | — |
| undelegate_player (commit_and_undelegate) | PASS | scheduled from the ER | [3MSUBQgD…](https://solscan.io/tx/3MSUBQgDxBj2Mi5q8yua6vnH6Z7mUGqw6q4gDCS8VNSXa9bDLm2KRcvRE7tU1vPG7kaG8CyvYYHHGkQG35PCTn6L?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| Player back under the program on Solana with ER state | PASS | owner J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q, base balance 250.000000 USD | — |
| router reports undelegated | PASS | {"isDelegated":false} | — |
| re-delegate Player, balance intact on the ER | PASS | ER balance 250.000000 USD | [2wjvGqd1…](https://explorer.solana.com/tx/2wjvGqd1yEcH4kBNunEEH25PoJHnz8RJdMzUrR1o36yTM7BpNjJe9V2kDjvdnx876YMY54HjpGssnoVz5WAuP5Sx?cluster=devnet) |

## Cheers via MagicBlock VRF (deterministic run)

Run at 2026-09-13T11:35:04.962Z.

| Step | Result | Detail | Transaction |
|---|---|---|---|
| fund players | PASS | 4oudWPjQNN7Y2rx4tqiR9dmv6nz2VXoiJgBkQ19BedqY, 2j21M2BgfpFVNZzmwTNmLpnQzqrDnudYoyoaQthzxRi3 | [5QrL8S6q…](https://explorer.solana.com/tx/5QrL8S6qx9Hxwb5HfcL31SiFhWZmXsNBdVn5718RJs1gmvUeKdaq25iCFuLm5QLRSmyu7xxbE1SeNh2Hk4DJbN5E?cluster=devnet) |
| players delegated, sessions created, chips claimed | PASS | both players at 250 USD | — |
| P2 buy YES $5 with Cheers | PASS | 10246512 shares in round 149 | [3ncjsm6N…](https://solscan.io/tx/3ncjsm6NpqYbyWZbUd1ZQsntTwQH1ScDfVGfwucbUznh5mHc4BvecP5ZKh53QRLEoB4GfcSmHVzkQeCbnJsKhGRS?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| P1 buy YES $90 (moves the AMM price) | PASS | 152969086 shares | [4zEE8xRu…](https://solscan.io/tx/4zEE8xRumdZgKeSRkSa3NbbNfpfMikdcLF1Cdesn1qtkyLzGLH2L3qk4GRnD9LdxjEbDJBpmhWz8pNWLq53UiFb8?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| sell quote is above cost | PASS | sell 10246512 YES for 6.741412 USD vs cost 5 USD | — |
| P2 sells into the move | PASS | realized 1.741412 USD | [4obkJws3…](https://solscan.io/tx/4obkJws3sp7s9LcvvKPFRGoxX7xPqQFDfQKUpK2nX7WcxRbPUX7n5ZGBod1KAC7mvzQt6XtFsx3qakXnAN42ie8f?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| crank rolled the round | PASS | round 149 outcome YES, 1s after end | — |
| P2 settle marks Cheers pending | PASS | profit 1.741412 USD, cheers_pending 1 | [2ADHShu2…](https://solscan.io/tx/2ADHShu2D3YwBEe2Lh4aMYjiU3XzgeiHZDmxExapBwxZb6GrCx1nmtwcawS9BnZd7Q83pF1S22SsNyGo4yMfca7s?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| P2 request_cheers on the ephemeral VRF queue | PASS | 15 candidates (every recent trader except P2, incl. P1) | [5Ufh2o6H…](https://solscan.io/tx/5Ufh2o6H73SRimjPpAUcSkrKjwV8MipPUyZaHWn1php2UATLo7cdZikthhQPackbz7fwcdLLCR7Dfb6hwEE1iaf3?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| VRF callback paid Cheers | PASS | 10 of 15 candidates received 1 USD each | — |
| CheersPaid event from the VRF callback transaction | PASS | recipients 5PRHkZ64PEGLAd51BYcGhmXYM2m6jkGj8fTSkADDx16K, DCGuaVk7fz76wNttfcjAm1UiT4beGqFtzZ5Gsxf17xJg, Dfjid6C7Q5Y2Uz8q8GGFeewRxzhhCkhY2Y2htqvuogpJ, JCMnrkLhJoFfsRRi18mHfXAnmdJ7mLL5bBCf8koaJPht, 4oudWPjQNN7Y2rx4tqiR9dmv6nz2VXoiJgBkQ19BedqY, DaBhQgW8yeLV4FamRSPZmkYzbYjp7fJ7fa5Vh8WuNmDy, E4Gtr2KEqmGKQQkQkLy9ztApMBeWxC1a4KXp7Fw46syP, 3pGhw8LHjbgCMFCtLAiptN6LtXQpXHbR6VWBd8Jrj98Q, 3aS8LZQF89MteHbifwhNJXSEkuW2j6w4B4Y6tsRoTVBo, uanHQAuKMQVTiUR7eXdZEmDsC9tirMCRrMBLzpfhBFK, randomness 22c1e7e96e68970a… | [5YmiDckr…](https://solscan.io/tx/5YmiDckrFe5se6LRVtn7xpP4oMFkxP6AQAbN4BsJaDQDZoKWp6jdpwzwq3kPNUhXeze1WBgY35ZGpDT7cz8qLtMy?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
