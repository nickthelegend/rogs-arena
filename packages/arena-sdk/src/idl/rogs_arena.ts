/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/rogs_arena.json`.
 */
export type RogsArena = {
  "address": "J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q",
  "metadata": {
    "name": "rogsArena",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Rogs Arena: BTC 5-minute social trading rounds on MagicBlock Ephemeral Rollups"
  },
  "instructions": [
    {
      "name": "attachAbility",
      "discriminator": [
        44,
        238,
        61,
        152,
        36,
        192,
        139,
        122
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "arena",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player.owner",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "ability",
          "type": "u8"
        }
      ]
    },
    {
      "name": "buy",
      "discriminator": [
        102,
        6,
        61,
        18,
        1,
        218,
        235,
        234
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "arena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player.owner",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "minShares",
          "type": "u64"
        },
        {
          "name": "ability",
          "type": "u8"
        }
      ]
    },
    {
      "name": "cheersCallback",
      "docs": [
        "VRF callback: pays CHEERS_AMOUNT to up to ten randomly chosen candidates."
      ],
      "discriminator": [
        183,
        47,
        144,
        95,
        74,
        115,
        230,
        98
      ],
      "accounts": [
        {
          "name": "vrfProgramIdentity",
          "docs": [
            "Scoped VRF identity PDA, bound to this program. Its presence as a signer proves",
            "the callback was issued by the VRF program for this program."
          ],
          "signer": true
        },
        {
          "name": "arena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              }
            ]
          }
        },
        {
          "name": "winner",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "winner.owner",
                "account": "player"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "claimChips",
      "discriminator": [
        145,
        205,
        154,
        242,
        241,
        150,
        215,
        26
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "arena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player.owner",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "commitArena",
      "docs": [
        "Commits the arena snapshot from the ER back to Solana (stays delegated)."
      ],
      "discriminator": [
        219,
        190,
        95,
        171,
        235,
        130,
        112,
        250
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "arena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "commitPlayer",
      "docs": [
        "Commits the player's account to Solana and keeps playing on the ER."
      ],
      "discriminator": [
        240,
        196,
        120,
        93,
        216,
        101,
        42,
        253
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "delegateArena",
      "discriminator": [
        216,
        55,
        214,
        212,
        195,
        162,
        39,
        100
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferArena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "arena"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                254,
                100,
                243,
                32,
                79,
                16,
                81,
                95,
                101,
                68,
                249,
                10,
                141,
                166,
                103,
                28,
                69,
                80,
                111,
                239,
                30,
                4,
                220,
                196,
                106,
                100,
                22,
                194,
                26,
                68,
                60,
                186
              ]
            }
          }
        },
        {
          "name": "delegationRecordArena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "arena"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataArena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "arena"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "arena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "delegatePlayer",
      "discriminator": [
        235,
        159,
        245,
        102,
        161,
        199,
        254,
        89
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferPlayer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                254,
                100,
                243,
                32,
                79,
                16,
                81,
                95,
                101,
                68,
                249,
                10,
                141,
                166,
                103,
                28,
                69,
                80,
                111,
                239,
                30,
                4,
                220,
                196,
                106,
                100,
                22,
                194,
                26,
                68,
                60,
                186
              ]
            }
          }
        },
        {
          "name": "delegationRecordPlayer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPlayer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "fundTreasury",
      "docs": [
        "Adds house chips (devnet play money) and records it on-chain."
      ],
      "discriminator": [
        71,
        154,
        45,
        220,
        206,
        32,
        174,
        239
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "arena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initPlayer",
      "discriminator": [
        114,
        27,
        219,
        144,
        50,
        15,
        228,
        66
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeArena",
      "discriminator": [
        11,
        37,
        221,
        1,
        205,
        120,
        25,
        230
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "arena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "initializeArenaArgs"
            }
          }
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "baseAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "reportHeart",
      "discriminator": [
        226,
        76,
        75,
        1,
        55,
        28,
        132,
        110
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "arena",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player.owner",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "bpm",
          "type": "u16"
        }
      ]
    },
    {
      "name": "requestCheers",
      "docs": [
        "Asks MagicBlock VRF to pick up to ten recent traders for a won Cheers card."
      ],
      "discriminator": [
        157,
        37,
        143,
        188,
        1,
        121,
        77,
        214
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "arena",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              }
            ]
          }
        },
        {
          "name": "winner",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "winner.owner",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "oracleQueue",
          "writable": true
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "callerSeed",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "resetCheers",
      "docs": [
        "Frees a cheers request whose VRF callback never arrived so it can be retried."
      ],
      "discriminator": [
        54,
        3,
        98,
        123,
        109,
        131,
        118,
        125
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player.owner",
                "account": "player"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "rollRound",
      "docs": [
        "Resolves the finished round with the oracle price and opens the next one.",
        "A no-op while the current round is still running, so the crank can tick often."
      ],
      "discriminator": [
        171,
        253,
        218,
        190,
        227,
        154,
        197,
        53
      ],
      "accounts": [
        {
          "name": "arena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              }
            ]
          }
        },
        {
          "name": "priceFeed"
        }
      ],
      "args": []
    },
    {
      "name": "scheduleRoundCrank",
      "docs": [
        "Schedules `roll_round` on the ER through the MagicBlock crank scheduler."
      ],
      "discriminator": [
        156,
        56,
        70,
        180,
        249,
        136,
        58,
        163
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "arena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              }
            ]
          }
        },
        {
          "name": "priceFeed"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "program",
          "address": "J83qUBtZwGwgyA7Sta8Kbj1GTTA6qtUBLEnkDV8wA64q"
        }
      ],
      "args": [
        {
          "name": "taskId",
          "type": "i64"
        },
        {
          "name": "intervalMs",
          "type": "i64"
        },
        {
          "name": "iterations",
          "type": "i64"
        }
      ]
    },
    {
      "name": "sell",
      "discriminator": [
        51,
        230,
        133,
        164,
        1,
        127,
        131,
        173
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "arena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player.owner",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": "u8"
        },
        {
          "name": "shares",
          "type": "u64"
        },
        {
          "name": "minOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settlePlayer",
      "docs": [
        "Settles every position whose round has resolved. Idempotent."
      ],
      "discriminator": [
        163,
        18,
        55,
        160,
        79,
        20,
        108,
        114
      ],
      "accounts": [
        {
          "name": "arena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player.owner",
                "account": "player"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "undelegatePlayer",
      "docs": [
        "Commits the player's account and returns it to Solana."
      ],
      "discriminator": [
        230,
        242,
        176,
        199,
        120,
        26,
        119,
        243
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "arena",
      "discriminator": [
        243,
        215,
        44,
        44,
        231,
        211,
        232,
        168
      ]
    },
    {
      "name": "player",
      "discriminator": [
        205,
        222,
        112,
        7,
        165,
        155,
        206,
        218
      ]
    },
    {
      "name": "sessionTokenV2",
      "discriminator": [
        178,
        3,
        85,
        254,
        13,
        116,
        128,
        41
      ]
    }
  ],
  "events": [
    {
      "name": "abilityAttached",
      "discriminator": [
        208,
        241,
        134,
        122,
        10,
        124,
        207,
        105
      ]
    },
    {
      "name": "arenaPaused",
      "discriminator": [
        142,
        227,
        167,
        147,
        27,
        20,
        199,
        166
      ]
    },
    {
      "name": "cheersPaid",
      "discriminator": [
        230,
        238,
        94,
        9,
        54,
        111,
        118,
        221
      ]
    },
    {
      "name": "cheersRequested",
      "discriminator": [
        253,
        150,
        121,
        123,
        108,
        83,
        122,
        156
      ]
    },
    {
      "name": "cheersReset",
      "discriminator": [
        75,
        224,
        87,
        188,
        165,
        71,
        6,
        135
      ]
    },
    {
      "name": "chipsClaimed",
      "discriminator": [
        98,
        9,
        227,
        123,
        23,
        147,
        88,
        54
      ]
    },
    {
      "name": "heartReported",
      "discriminator": [
        25,
        31,
        49,
        40,
        39,
        230,
        83,
        70
      ]
    },
    {
      "name": "positionSettled",
      "discriminator": [
        75,
        100,
        92,
        189,
        245,
        116,
        252,
        221
      ]
    },
    {
      "name": "roundOpened",
      "discriminator": [
        99,
        173,
        228,
        72,
        142,
        57,
        109,
        178
      ]
    },
    {
      "name": "roundResolved",
      "discriminator": [
        204,
        146,
        253,
        187,
        8,
        61,
        75,
        29
      ]
    },
    {
      "name": "tradeExecuted",
      "discriminator": [
        41,
        110,
        64,
        129,
        60,
        79,
        179,
        80
      ]
    },
    {
      "name": "treasuryFunded",
      "discriminator": [
        172,
        66,
        241,
        101,
        216,
        219,
        147,
        130
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Signer is not allowed to act for this account"
    },
    {
      "code": 6001,
      "name": "invalidConfig",
      "msg": "Invalid arena configuration"
    },
    {
      "code": 6002,
      "name": "notJoined",
      "msg": "Player has not joined the arena yet"
    },
    {
      "code": 6003,
      "name": "roundNotOpen",
      "msg": "The round is not open for trading"
    },
    {
      "code": 6004,
      "name": "tradingLocked",
      "msg": "Trading is locked in the final seconds of the round"
    },
    {
      "code": 6005,
      "name": "invalidOutcome",
      "msg": "Invalid outcome"
    },
    {
      "code": 6006,
      "name": "amountTooSmall",
      "msg": "Trade amount is below the minimum"
    },
    {
      "code": 6007,
      "name": "amountTooLarge",
      "msg": "Trade amount is above the maximum"
    },
    {
      "code": 6008,
      "name": "insufficientBalance",
      "msg": "Not enough chips"
    },
    {
      "code": 6009,
      "name": "slippageExceeded",
      "msg": "Price moved beyond the allowed slippage"
    },
    {
      "code": 6010,
      "name": "noPositionSlot",
      "msg": "All position slots are in use; settle finished rounds first"
    },
    {
      "code": 6011,
      "name": "noPosition",
      "msg": "No position in the current round"
    },
    {
      "code": 6012,
      "name": "nothingToSell",
      "msg": "Not enough shares to sell"
    },
    {
      "code": 6013,
      "name": "invalidAbility",
      "msg": "Invalid ability card"
    },
    {
      "code": 6014,
      "name": "abilityAlreadySet",
      "msg": "An ability card is already attached to this position"
    },
    {
      "code": 6015,
      "name": "oracleMismatch",
      "msg": "Price feed does not match the arena oracle"
    },
    {
      "code": 6016,
      "name": "oracleOwner",
      "msg": "Price feed is not owned by the MagicBlock oracle program"
    },
    {
      "code": 6017,
      "name": "oracleInvalid",
      "msg": "Price feed account is malformed"
    },
    {
      "code": 6018,
      "name": "oracleStale",
      "msg": "Price feed is stale"
    },
    {
      "code": 6019,
      "name": "treasuryInsufficient",
      "msg": "House treasury is too low"
    },
    {
      "code": 6020,
      "name": "faucetCooldown",
      "msg": "Faucet is cooling down"
    },
    {
      "code": 6021,
      "name": "faucetBalanceTooHigh",
      "msg": "Balance is too high to use the faucet"
    },
    {
      "code": 6022,
      "name": "invalidHeartRate",
      "msg": "Heart rate is out of range"
    },
    {
      "code": 6023,
      "name": "noCheersPending",
      "msg": "No cheers payout is pending"
    },
    {
      "code": 6024,
      "name": "cheersInflight",
      "msg": "A cheers randomness request is already in flight"
    },
    {
      "code": 6025,
      "name": "noCheersInflight",
      "msg": "No cheers randomness request is in flight"
    },
    {
      "code": 6026,
      "name": "cheersNotTimedOut",
      "msg": "The cheers request has not timed out yet"
    },
    {
      "code": 6027,
      "name": "cheersCandidateInvalid",
      "msg": "Invalid cheers candidate"
    },
    {
      "code": 6028,
      "name": "tooManyCandidates",
      "msg": "Too many cheers candidates"
    },
    {
      "code": 6029,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6030,
      "name": "invalidQueue",
      "msg": "Invalid VRF queue"
    }
  ],
  "types": [
    {
      "name": "abilityAttached",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "ability",
            "type": "u8"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "arena",
      "docs": [
        "Global arena state. Delegated to the ephemeral rollup."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "oracleFeed",
            "type": "pubkey"
          },
          {
            "name": "roundSeconds",
            "type": "i64"
          },
          {
            "name": "liquidity",
            "type": "u64"
          },
          {
            "name": "feeBps",
            "type": "u64"
          },
          {
            "name": "treasury",
            "docs": [
              "House chips: seeds round liquidity, collects fees, pays bonuses."
            ],
            "type": "u64"
          },
          {
            "name": "claimsOutstanding",
            "docs": [
              "Winning shares still owed to players across resolved rounds."
            ],
            "type": "u64"
          },
          {
            "name": "totalVolume",
            "type": "u64"
          },
          {
            "name": "totalTrades",
            "type": "u64"
          },
          {
            "name": "totalPlayers",
            "type": "u64"
          },
          {
            "name": "crankTaskId",
            "type": "i64"
          },
          {
            "name": "lastRollTs",
            "type": "i64"
          },
          {
            "name": "historyHead",
            "type": "u64"
          },
          {
            "name": "historyLen",
            "type": "u64"
          },
          {
            "name": "recentHead",
            "type": "u64"
          },
          {
            "name": "commits",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "pad",
            "type": {
              "array": [
                "u8",
                7
              ]
            }
          },
          {
            "name": "current",
            "type": {
              "defined": {
                "name": "roundState"
              }
            }
          },
          {
            "name": "history",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "roundSummary"
                  }
                },
                64
              ]
            }
          },
          {
            "name": "recent",
            "type": {
              "array": [
                "pubkey",
                16
              ]
            }
          }
        ]
      }
    },
    {
      "name": "arenaPaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "u64"
          },
          {
            "name": "needed",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "cheersPaid",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "recipients",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "amountEach",
            "type": "u64"
          },
          {
            "name": "randomness",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "cheersRequested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "candidates",
            "type": "u8"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "cheersReset",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "chipsClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "first",
            "type": "bool"
          },
          {
            "name": "balance",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "heartReported",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "bpm",
            "type": "u16"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "initializeArenaArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oracleFeed",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "roundSeconds",
            "type": "i64"
          },
          {
            "name": "liquidity",
            "type": "u64"
          },
          {
            "name": "feeBps",
            "type": "u64"
          },
          {
            "name": "treasurySeed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "player",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "joined",
            "type": "bool"
          },
          {
            "name": "balance",
            "type": "u64"
          },
          {
            "name": "positions",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "position"
                  }
                },
                4
              ]
            }
          },
          {
            "name": "tradesTotal",
            "type": "u32"
          },
          {
            "name": "winsTotal",
            "type": "u32"
          },
          {
            "name": "lossesTotal",
            "type": "u32"
          },
          {
            "name": "winStreak",
            "type": "u16"
          },
          {
            "name": "bestStreak",
            "type": "u16"
          },
          {
            "name": "sameSideStreak",
            "type": "u16"
          },
          {
            "name": "lastSide",
            "type": "u8"
          },
          {
            "name": "calmWins",
            "type": "u32"
          },
          {
            "name": "dayIndex",
            "type": "i64"
          },
          {
            "name": "dayTrades",
            "type": "u16"
          },
          {
            "name": "badges",
            "type": "u32"
          },
          {
            "name": "pnlTotal",
            "type": "i64"
          },
          {
            "name": "bonusTotal",
            "type": "u64"
          },
          {
            "name": "volumeTotal",
            "type": "u64"
          },
          {
            "name": "heartBpm",
            "type": "u16"
          },
          {
            "name": "heartTs",
            "type": "i64"
          },
          {
            "name": "cheersPending",
            "type": "u8"
          },
          {
            "name": "cheersInflight",
            "type": "u8"
          },
          {
            "name": "cheersRequestedTs",
            "type": "i64"
          },
          {
            "name": "cheersReceived",
            "type": "u64"
          },
          {
            "name": "lastFaucetTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "position",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "yesShares",
            "type": "u64"
          },
          {
            "name": "noShares",
            "type": "u64"
          },
          {
            "name": "cost",
            "docs": [
              "Gross chips spent on buys (never reduced)."
            ],
            "type": "u64"
          },
          {
            "name": "proceeds",
            "docs": [
              "Net chips received from sells."
            ],
            "type": "u64"
          },
          {
            "name": "basisYes",
            "docs": [
              "Remaining cost basis per side, reduced pro rata on sells."
            ],
            "type": "u64"
          },
          {
            "name": "basisNo",
            "type": "u64"
          },
          {
            "name": "maxBpm",
            "docs": [
              "Highest heart rate reported while this position was live."
            ],
            "type": "u16"
          },
          {
            "name": "heartSamples",
            "type": "u16"
          },
          {
            "name": "ability",
            "type": "u8"
          },
          {
            "name": "active",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "positionSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": "u8"
          },
          {
            "name": "payout",
            "type": "u64"
          },
          {
            "name": "profit",
            "type": "i64"
          },
          {
            "name": "ability",
            "type": "u8"
          },
          {
            "name": "bonus",
            "type": "u64"
          },
          {
            "name": "calm",
            "type": "bool"
          },
          {
            "name": "cheers",
            "type": "bool"
          },
          {
            "name": "balance",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "roundOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "strikePrice",
            "type": "i64"
          },
          {
            "name": "priceExpo",
            "type": "i32"
          },
          {
            "name": "liquidity",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "roundResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "strikePrice",
            "type": "i64"
          },
          {
            "name": "closePrice",
            "type": "i64"
          },
          {
            "name": "priceExpo",
            "type": "i32"
          },
          {
            "name": "outcome",
            "type": "u8"
          },
          {
            "name": "yesPool",
            "type": "u64"
          },
          {
            "name": "noPool",
            "type": "u64"
          },
          {
            "name": "volume",
            "type": "u64"
          },
          {
            "name": "trades",
            "type": "u64"
          },
          {
            "name": "houseBack",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "roundState",
      "docs": [
        "The live round. Layout has no implicit padding (zero-copy)."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "strikePrice",
            "type": "i64"
          },
          {
            "name": "closePrice",
            "type": "i64"
          },
          {
            "name": "yesPool",
            "type": "u64"
          },
          {
            "name": "noPool",
            "type": "u64"
          },
          {
            "name": "collateral",
            "docs": [
              "Chips backing the round; always equals the number of minted YES+NO sets."
            ],
            "type": "u64"
          },
          {
            "name": "volume",
            "type": "u64"
          },
          {
            "name": "trades",
            "type": "u64"
          },
          {
            "name": "priceExpo",
            "type": "i32"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "outcome",
            "type": "u8"
          },
          {
            "name": "pad",
            "type": {
              "array": [
                "u8",
                2
              ]
            }
          }
        ]
      }
    },
    {
      "name": "roundSummary",
      "docs": [
        "A resolved round kept for settlement and history."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "strikePrice",
            "type": "i64"
          },
          {
            "name": "closePrice",
            "type": "i64"
          },
          {
            "name": "yesPool",
            "type": "u64"
          },
          {
            "name": "noPool",
            "type": "u64"
          },
          {
            "name": "volume",
            "type": "u64"
          },
          {
            "name": "trades",
            "type": "u64"
          },
          {
            "name": "priceExpo",
            "type": "i32"
          },
          {
            "name": "outcome",
            "type": "u8"
          },
          {
            "name": "pad",
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          }
        ]
      }
    },
    {
      "name": "sessionTokenV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "targetProgram",
            "type": "pubkey"
          },
          {
            "name": "sessionSigner",
            "type": "pubkey"
          },
          {
            "name": "feePayer",
            "type": "pubkey"
          },
          {
            "name": "validUntil",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "tradeExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": "u8"
          },
          {
            "name": "side",
            "type": "u8"
          },
          {
            "name": "amount",
            "docs": [
              "Gross chips in for buys, net chips out for sells."
            ],
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "yesPriceBps",
            "docs": [
              "YES probability after the trade, in basis points."
            ],
            "type": "u64"
          },
          {
            "name": "realizedPnl",
            "docs": [
              "Sell proceeds minus the cost basis of the shares sold; 0 for buys."
            ],
            "type": "i64"
          },
          {
            "name": "ability",
            "type": "u8"
          },
          {
            "name": "balance",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "treasuryFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "treasury",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
