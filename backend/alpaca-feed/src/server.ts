import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fetchDailyBars, fetchIntradayBars, fetchLatestQuote, type AlpacaConfig } from "./alpaca.js";
import { atrFromBars, openingRangeFromBars, priorDayHighLow, spreadFromQuote, vwapFromBars } from "./indicators.js";
import { classifyRegime } from "./regime.js";
import { SYMBOL_MAPPINGS, scale, type SymbolMapping } from "./mapping.js";
import type { InstrumentContext } from "./types.js";

dotenv.config();

const {
  APCA_API_KEY_ID,
  APCA_API_SECRET_KEY,
  ALPACA_FEED = "iex",
  PORT = "3001",
  CACHE_TTL_MS = "4000",
} = process.env;

if (!APCA_API_KEY_ID || !APCA_API_SECRET_KEY) {
  console.error("Missing APCA_API_KEY_ID or APCA_API_SECRET_KEY in env.");
  console.error("Copy .env.example to .env and fill in your Alpaca key pair.");
  process.exit(1);
}

const alpacaCfg: AlpacaConfig = {
  keyId: APCA_API_KEY_ID,
  secretKey: APCA_API_SECRET_KEY,
  feed: ALPACA_FEED === "sip" ? "sip" : "iex",
};

const cacheTtl = Math.max(500, Number(CACHE_TTL_MS) || 4000);

let cachedSnapshot: { at: number; contexts: InstrumentContext[] } | null = null;

async function buildContextFor(mapping: SymbolMapping): Promise<InstrumentContext> {
  const [quote, intraday, daily] = await Promise.all([
    fetchLatestQuote(alpacaCfg, mapping.etf).catch(() => null),
    fetchIntradayBars(alpacaCfg, mapping.etf, "5Min", 24).catch(() => []),
    fetchDailyBars(alpacaCfg, mapping.etf, 5).catch(() => []),
  ]);

  // ETF-space indicators
  const lastBar = intraday[intraday.length - 1];
  const etfPrice = quote
    ? (quote.ap + quote.bp) / 2 || lastBar?.c || 0
    : lastBar?.c || 0;
  const etfAtr = atrFromBars(intraday);
  const etfVwap = vwapFromBars(intraday);
  const etfOR = openingRangeFromBars(intraday, 3);
  const etfPD = priorDayHighLow(daily);
  const etfSpread = quote ? spreadFromQuote(quote.ap, quote.bp) : 0;

  // Regime classification works on ETF bars directly (ratios don't need scaling)
  const regimeResult = classifyRegime(intraday, daily, etfAtr);

  // Scale everything into futures-space so the decision engine computes
  // entry/stop/target in native futures price units
  const m = mapping.multiplier;
  return {
    instrument: mapping.futures,
    price:      scale(etfPrice, m),
    atr:        scale(etfAtr, m),
    vwap:       scale(etfVwap, m),
    openingRange: {
      high: scale(etfOR.high, m),
      low:  scale(etfOR.low,  m),
    },
    priorHigh: scale(etfPD.high, m),
    priorLow:  scale(etfPD.low,  m),
    regime: regimeResult.regime,
    regimeConfidence: parseFloat(regimeResult.confidence.toFixed(3)),
    liquidityScore:   parseFloat(regimeResult.liquidityScore.toFixed(3)),
    // eventRisk is calendar-driven and lives in the frontend Pre-Market
    // Brief — leave it neutral here so we don't double-count.
    eventRisk: 0.15,
    spread: scale(Math.max(etfSpread, mapping.futures.tickSize), m),
  };
}

async function buildSnapshot(): Promise<InstrumentContext[]> {
  return Promise.all(SYMBOL_MAPPINGS.map(buildContextFor));
}

const app = express();
app.use(cors());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", feed: alpacaCfg.feed, symbols: SYMBOL_MAPPINGS.map(m => `${m.futures.symbol}/${m.etf}`) });
});

app.get("/market/contexts", async (_req, res) => {
  try {
    const now = Date.now();
    if (cachedSnapshot && now - cachedSnapshot.at < cacheTtl) {
      return res.json({
        contexts: cachedSnapshot.contexts,
        cached: true,
        ageMs: now - cachedSnapshot.at,
      });
    }
    const contexts = await buildSnapshot();
    cachedSnapshot = { at: now, contexts };
    res.json({ contexts, cached: false, ageMs: 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/market/contexts] failure:", msg);
    res.status(502).json({ error: msg });
  }
});

const port = Number(PORT) || 3001;
app.listen(port, () => {
  console.log(`[alpaca-feed] listening on http://localhost:${port}`);
  console.log(`[alpaca-feed] feed=${alpacaCfg.feed} symbols=${SYMBOL_MAPPINGS.map(m => m.futures.symbol).join(",")}`);
});
