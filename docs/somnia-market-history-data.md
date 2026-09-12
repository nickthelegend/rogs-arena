# Somnia Market History Data

Question: can the app read historical YES/NO binary market values for charting?

## Findings

- The best chart source is `useCandles(pool, intervalSeconds, { limit, from, to })` from `@somnia-chain/markets-sdk/react`. It reads indexed OHLCV candle buckets and returns them oldest-first. Source: `apps/web/node_modules/@somnia-chain/markets-sdk/src/hooks.ts:361`.
- Candles exist for binary pools, and their prices are raw YES-probability terms. The available rollup intervals are `1m`, `5m`, `15m`, `1h`, `4h`, and `1d` via `CANDLE_INTERVALS = [60, 300, 900, 3600, 14400, 86400]`. Source: `apps/web/node_modules/@somnia-chain/markets-sdk/src/candles.ts:15` and `apps/web/node_modules/@somnia-chain/markets-sdk/src/candles.ts:65`.
- Raw fill history is available through `client.getFills(pool, { limit, offset, since, until })`. It supports pagination and unix-second time bounds, but returns newest-first raw fills rather than chart buckets. Source: `apps/web/node_modules/@somnia-chain/markets-sdk/src/fills.ts:18` and `apps/web/node_modules/@somnia-chain/markets-sdk/src/fills.ts:55`.
- `useLiveFills(pool, limit)` is only the live/snapshot tape for a watched pool. It is useful for updating the chart tip, not for complete history. Source: `apps/web/node_modules/@somnia-chain/markets-sdk/src/hooks.ts:139`.
- The unified exchange helpers can view the same binary market through a `#YES` or `#NO` tradable symbol. The NO side automatically mirrors price as `1 - YES` through `priceView`, and `fetchOHLCV(ref, timeframe, since, limit)` returns human OHLCV rows. Source: `apps/web/node_modules/@somnia-chain/markets-sdk/src/unified/exchange.ts:610` and `apps/web/node_modules/@somnia-chain/markets-sdk/src/unified/exchange.ts:674`.

## Recommendation

For a YES/NO line chart over a 15-minute market window, use `useCandles` with `intervalSeconds = 60`, `from = tradingStart`, and `to = expiry`, then derive:

- YES line: each candle close converted from raw quote units with `toHuman(closePrice, quoteDecimals)`.
- NO line: `1 - yes`.
- Live tip: overlay or append points from `useLiveFills` and/or `useLiveBinaryOrderBook`.

Use paged `getFills` only if the chart needs every individual trade print instead of bucketed price history.
