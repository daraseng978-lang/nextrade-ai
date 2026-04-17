# Alpaca Market Data Feed

Backend shim that wraps Alpaca's free equities feed into a
`GET /market/contexts` endpoint the Nextrade AI frontend can consume.

**Why this exists:** Alpaca's free tier doesn't offer futures data, but
it does offer real-time US equities via the IEX feed. This service
fetches quotes/bars for the ETFs that track each futures contract
(SPY↔MES, QQQ↔MNQ, DIA↔MYM, IWM↔M2K, GLD↔MGC, USO↔MCL), computes
ATR/VWAP/opening range/regime, and scales everything into
futures-price space so the decision engine runs unmodified.

**Execution is unchanged.** This service is *data only*. Orders still
flow Frontend → TradersPost → Tradovate. Your Tradovate account and
TradersPost webhook config are untouched.

## Setup

1. **Sign up for Alpaca** (free): https://alpaca.markets — create a
   paper-trading account and generate an API key pair.
2. **Configure env:**
   ```bash
   cd backend/alpaca-feed
   cp .env.example .env
   # paste your APCA_API_KEY_ID + APCA_API_SECRET_KEY
   ```
3. **Install + run:**
   ```bash
   npm install
   npm run dev
   # listening on http://localhost:3001
   ```
4. **Wire the frontend:**
   - Open the app → Settings → Market Data Feed
   - Pick "REST Endpoint"
   - URL: `http://localhost:3001/market/contexts`
   - Leave API key blank (auth is server-side)
   - Status chip should flip to LIVE within one poll interval

## Endpoints

- `GET /health` — `{ status, feed, symbols }`
- `GET /market/contexts` — `{ contexts: InstrumentContext[], cached, ageMs }`

Snapshots are cached for `CACHE_TTL_MS` (default 4s) to avoid
hammering Alpaca. Poll interval in the frontend can be shorter than
the TTL — cached responses return immediately.

## Price scaling

ETF quotes live in ETF-price space (SPY ≈ $560). Futures trade at
index levels (MES ≈ $7010). Each mapping carries a `multiplier`
(`src/mapping.ts`) that converts ETF prices into futures-price space
so the frontend's entry/stop/target math works natively.

If a mapping feels off, tune the multiplier. The app scores regimes
on *ratios* (move / ATR, expansion, etc.), so small multiplier errors
don't affect classification — only the headline price.

## Regime classification

Simplified vs. the frontend's full playbook logic. Uses 3 inputs:
- **Trend strength**: net move / ATR across the intraday bars
- **Expansion**: largest bar range / average bar range
- **Liquidity**: intraday avg volume / daily avg volume

Outputs one of: `strong_trend_up`, `strong_trend_down`,
`expansion_breakout`, `reversal_mean_reversion`, `balanced_range`,
`low_quality_no_trade`.

## Feed selection

- **`iex`** (default): free, IEX-only quotes. Coverage is fine for
  liquid ETFs during RTH.
- **`sip`**: consolidated tape (all US exchanges). Requires an Alpaca
  Unlimited / Algo Trader Plus subscription. Set `ALPACA_FEED=sip`.

## Troubleshooting

- **502 from `/market/contexts`**: the error body is the Alpaca
  response. Common causes: bad key pair, IP region lockout,
  market closed + free feed returns nothing.
- **All prices zero**: Alpaca returned no bars/quote. Run during US
  RTH or use `sip` feed.
- **Frontend shows ERROR chip**: open browser devtools → Network tab.
  The REST provider logs the exact Alpaca response.

## Tests

```bash
npm run typecheck
npm test
```

Covers indicator math, regime thresholds, and symbol-mapping
completeness. Alpaca API calls are not mocked in tests — run against
the real API manually with `npm run dev`.
