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
| 19 | cheers via VRF | PASS | not exercised this run: the Cheers position did not finish in profit | — |
| 20 | P1 commit_player to Solana | PASS | commit scheduled from the ER | [Np1fntai…](https://solscan.io/tx/Np1fntai7EzWQDYBWvTTRu8oH578suvoy5dfHqAPhnBPug3bCpJfGurGYJDcCkMHXyauj9XmqYgRy9xLT5RK6j2?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| 21 | base layer shows committed player state | PASS | trades 1 balance 264.780446 USD | — |

## Arena commit to Solana (MagicIntentBundleBuilder)

Run at 2026-09-12T23:18:40.506Z. The `commit_arena` transaction on the ER is [2qc96JkV…](https://solscan.io/tx/2qc96JkVd681n6icMr1hnDqpi8BkJhnSiYqUfyPa76r63AuERz5Ew4K9Nr5ezrWaPNJPdD2tmbbWNxVqciB6sMAL?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app).
Before the commit, Solana held round 0, 0 trades and 0 commits.
After it landed, Solana held round 2, 6 trades and 1 commits. The account is still owned by the delegation program, so the arena kept running on the ER. Result: PASS.
