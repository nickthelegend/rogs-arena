# watcher

Live DreamDex BTC 15-minute binary market dashboard. YES/NO values match the trading chart: book mid, then last fill, then last price. When the current market expires or rolls, the watcher switches automatically.

To install dependencies:

```bash
bun install
```

To run the live 15m market:

```bash
bun run start
```

Watch a different window with `--interval`:

```bash
bun run start -- --interval 1m
bun run start -- --interval 5m
bun run start -- --interval 15m
bun run start -- --interval 1h
```

Press `q` to quit.
