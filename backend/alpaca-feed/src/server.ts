import express from "express";
import cors from "cors";
import cron from "node-cron";
import dotenv from "dotenv";
import { fetchDailyBars, fetchIntradayBars, fetchLatestQuote, type AlpacaConfig } from "./alpaca.js";
import { fetchYahooBundle, fetchYahooDailyBars } from "./yahoo.js";
import { fetchCrossMarketSnapshot, type CrossMarketSnapshot } from "./crossMarket.js";
import { atrFromBars, openingRangeFromBars, priorDayHighLow, spreadFromQuote, vwapFromBars } from "./indicators.js";
import { classifyRegime } from "./regime.js";
import { SYMBOL_MAPPINGS, scale, type SymbolMapping } from "./mapping.js";
import type { AlpacaBar, InstrumentContext } from "./types.js";
import { dispatchTradersPost, redactWebhook, validatePayload } from "./dispatch.js";
import { sendTelegramMessage } from "./telegram.js";
import { getEconomicCalendar, type EconomicEvent } from "./calendar.js";
import {
  aiConfigured,
  aiJournalAnalysis,
  aiMorningBrief,
  aiTradeReasoning,
  type JournalAnalysisEntry,
  type MorningBriefInput,
  type TradeReasoningInput,
} from "./ai.js";

dotenv.config();

const {
  APCA_API_KEY_ID,
  APCA_API_SECRET_KEY,
  ALPACA_FEED = "iex",
  PORT = "3001",
  CACHE_TTL_MS = "4000",
  TRADERSPOST_WEBHOOK_URL = "",
  TELEGRAM_BOT_TOKEN = "",
  TELEGRAM_CHAT_ID = "",
  MORNING_BRIEF_CRON = "0 30 7 * * 1-5",
  MORNING_BRIEF_ENABLED = "true",
  MARKET_PROVIDER = "alpaca", // "alpaca" (ETF proxy, tight quotes) | "yahoo" (real futures, ~15min delay)
  CROSS_MARKET_ENABLED = "true",
  // When provider=yahoo, we pull data at these cron times (ET) to stay
  // under Yahoo's rate limit. Two pulls/day is enough for a swing/
  // discretionary setup; the cached snapshot serves every /market/contexts
  // call in between. Empty string disables the schedule.
  YAHOO_REFRESH_CRON = "0 30 8,12 * * 1-5", // 8:30am + 12:00pm ET weekdays
  // Hybrid mode: when provider=alpaca, also pull real consolidated daily
  // bars from Yahoo once per trading day (pre-market) to get usable
  // priorHigh/priorLow. Alpaca's free IEX feed returns sparse daily
  // aggregates. Set to "false" to disable. One Yahoo hit/symbol/day is
  // well under the rate limit.
  HYBRID_YAHOO_DAILIES = "true",
  HYBRID_YAHOO_DAILIES_CRON = "0 0 8 * * 1-5", // 8:00am ET, before RTH open
} = process.env;

const provider: "alpaca" | "yahoo" = MARKET_PROVIDER === "yahoo" ? "yahoo" : "alpaca";

if (provider === "alpaca" && (!APCA_API_KEY_ID || !APCA_API_SECRET_KEY)) {
  console.error("Missing APCA_API_KEY_ID or APCA_API_SECRET_KEY in env.");
  console.error("Copy .env.example to .env and fill in your Alpaca key pair,");
  console.error("or set MARKET_PROVIDER=yahoo to use Yahoo Finance (keyless, ~15min delay).");
  process.exit(1);
}

const alpacaCfg: AlpacaConfig = {
  keyId: APCA_API_KEY_ID ?? "",
  secretKey: APCA_API_SECRET_KEY ?? "",
  feed: ALPACA_FEED === "sip" ? "sip" : "iex",
};

// When MARKET_PROVIDER=yahoo, we stop serving fresh fetches on every
// request — a cron pulls 2x/day (see YAHOO_REFRESH_CRON) and the cache
// serves everything in between. Cache TTL is effectively "forever" in
// yahoo mode; operator can force a refresh via POST /market/refresh.
const YAHOO_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h; cron invalidates earlier
const defaultCacheTtl = provider === "yahoo" ? YAHOO_CACHE_TTL : 4000;
const cacheTtl = Math.max(500, Number(CACHE_TTL_MS) || defaultCacheTtl);

let cachedSnapshot: { at: number; contexts: InstrumentContext[] } | null = null;
// Cross-market follows the same schedule as futures in yahoo mode.
const crossMarketTtl = provider === "yahoo" ? YAHOO_CACHE_TTL : 30_000;
let cachedCrossMarket: { at: number; snapshot: CrossMarketSnapshot } | null = null;

// Hybrid mode (provider=alpaca): Alpaca's IEX free tier returns garbage
// daily bars (only IEX-routed trades, ~2% of SPY volume). We pull real
// consolidated daily bars from Yahoo once per trading day and cache them
// here, keyed by Yahoo symbol (ES=F, SPY, etc.).
const yahooDailyCache: Map<string, AlpacaBar[]> = new Map();
let yahooDailyLastRefresh = 0;

async function getCrossMarketSnapshot(): Promise<CrossMarketSnapshot> {
  const now = Date.now();
  if (cachedCrossMarket && now - cachedCrossMarket.at < crossMarketTtl) {
    return cachedCrossMarket.snapshot;
  }
  const snapshot = await fetchCrossMarketSnapshot();
  cachedCrossMarket = { at: now, snapshot };
  return snapshot;
}

async function buildContextFor(mapping: SymbolMapping): Promise<InstrumentContext> {
  const [quote, intraday, daily] = await Promise.all([
    fetchLatestQuote(alpacaCfg, mapping.etf).catch((err) => {
      console.warn(`[alpaca] ${mapping.etf} quote failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }),
    fetchIntradayBars(alpacaCfg, mapping.etf, "5Min", 24).catch((err) => {
      console.warn(`[alpaca] ${mapping.etf} intraday bars failed: ${err instanceof Error ? err.message : err}`);
      return [];
    }),
    fetchDailyBars(alpacaCfg, mapping.etf, 5).catch((err) => {
      console.warn(`[alpaca] ${mapping.etf} daily bars failed: ${err instanceof Error ? err.message : err}`);
      return [];
    }),
  ]);

  // Log what we got so we can see when Alpaca returns empty
  const coverage = `${mapping.etf}: quote=${quote ? "✓" : "✗"} intraday=${intraday.length} daily=${daily.length}`;
  if (!quote && intraday.length === 0 && daily.length === 0) {
    console.warn(`[alpaca] ${coverage} — ALL EMPTY`);
  } else {
    console.log(`[alpaca] ${coverage}`);
  }

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

  // Hybrid: prefer Yahoo's consolidated futures daily bars for priorH/L
  // (Alpaca IEX daily bars are IEX-routed only → distorted). Yahoo bars
  // are already in futures-price-space so we don't scale them.
  const m = mapping.multiplier;
  const yahooDaily = yahooDailyCache.get(mapping.yahooSymbol);
  let priorHigh = scale(etfPD.high, m);
  let priorLow = scale(etfPD.low, m);
  if (yahooDaily && yahooDaily.length >= 2) {
    const yahooPD = priorDayHighLow(yahooDaily);
    priorHigh = yahooPD.high;
    priorLow = yahooPD.low;
  }

  // Scale everything else into futures-space so the decision engine
  // computes entry/stop/target in native futures price units.
  return {
    instrument: mapping.futures,
    price:      scale(etfPrice, m),
    atr:        scale(etfAtr, m),
    vwap:       scale(etfVwap, m),
    openingRange: {
      high: scale(etfOR.high, m),
      low:  scale(etfOR.low,  m),
    },
    priorHigh,
    priorLow,
    regime: regimeResult.regime,
    regimeConfidence: parseFloat(regimeResult.confidence.toFixed(3)),
    liquidityScore:   parseFloat(regimeResult.liquidityScore.toFixed(3)),
    // eventRisk is calendar-driven and lives in the frontend Pre-Market
    // Brief — leave it neutral here so we don't double-count.
    eventRisk: 0.15,
    spread: scale(Math.max(etfSpread, mapping.futures.tickSize), m),
  };
}

// Yahoo Finance path — pulls the REAL futures symbol (ES=F, NQ=F, …)
// so we don't need ETF→futures scaling. Ideal for operators without an
// Alpaca key. Quote is ~15 min delayed; good enough for everything
// except execution-timing decisions.
async function buildYahooContextFor(mapping: SymbolMapping): Promise<InstrumentContext> {
  let bundle: Awaited<ReturnType<typeof fetchYahooBundle>>;
  try {
    bundle = await fetchYahooBundle(mapping.yahooSymbol);
  } catch (err) {
    console.warn(`[yahoo] ${mapping.yahooSymbol} bundle failed: ${err instanceof Error ? err.message : err}`);
    bundle = { symbol: mapping.yahooSymbol, intraday: [], daily: [], quote: null };
  }
  const { quote, intraday, daily } = bundle;

  const coverage = `${mapping.yahooSymbol}: quote=${quote ? "✓" : "✗"} intraday=${intraday.length} daily=${daily.length}`;
  if (!quote && intraday.length === 0 && daily.length === 0) {
    console.warn(`[yahoo] ${coverage} — ALL EMPTY`);
  } else {
    console.log(`[yahoo] ${coverage}`);
  }

  const lastBar = intraday[intraday.length - 1];
  const price = quote?.price ?? lastBar?.c ?? 0;
  const atr = atrFromBars(intraday);
  const vwap = vwapFromBars(intraday);
  const or = openingRangeFromBars(intraday, 3);
  const pd = priorDayHighLow(daily);

  const regimeResult = classifyRegime(intraday, daily, atr);

  // Yahoo doesn't publish bid/ask — use a single tick as the minimum
  // plausible spread so downstream code doesn't divide by zero.
  const spread = mapping.futures.tickSize;

  return {
    instrument: mapping.futures,
    price,
    atr,
    vwap,
    openingRange: { high: or.high, low: or.low },
    priorHigh: pd.high,
    priorLow: pd.low,
    regime: regimeResult.regime,
    regimeConfidence: parseFloat(regimeResult.confidence.toFixed(3)),
    liquidityScore: parseFloat(regimeResult.liquidityScore.toFixed(3)),
    eventRisk: 0.15,
    spread,
  };
}

// Pull Yahoo daily bars for each mapped symbol once and stash in
// `yahooDailyCache`. Used by hybrid mode (provider=alpaca) to fill in
// the priorHigh/priorLow that IEX daily bars are too sparse to provide.
// Serial, paced (yahoo.ts handles throttling). Runs at most once/day.
async function refreshYahooDailies(): Promise<void> {
  console.log("[hybrid-yahoo-daily] refreshing daily bars for all symbols...");
  let ok = 0, fail = 0;
  for (const mapping of SYMBOL_MAPPINGS) {
    try {
      const bars = await fetchYahooDailyBars(mapping.yahooSymbol);
      if (bars.length >= 2) {
        yahooDailyCache.set(mapping.yahooSymbol, bars);
        ok++;
      } else {
        console.warn(`[hybrid-yahoo-daily] ${mapping.yahooSymbol} returned ${bars.length} bars — skipping`);
        fail++;
      }
    } catch (err) {
      console.warn(`[hybrid-yahoo-daily] ${mapping.yahooSymbol} failed: ${err instanceof Error ? err.message : err}`);
      fail++;
    }
  }
  yahooDailyLastRefresh = Date.now();
  console.log(`[hybrid-yahoo-daily] done — ${ok} ok, ${fail} failed`);
}

async function buildSnapshot(): Promise<InstrumentContext[]> {
  if (provider === "yahoo") {
    // Serialize: Yahoo's free tier 429s on bursts. Module-level pacing
    // in yahoo.ts handles the gap between requests.
    const out: InstrumentContext[] = [];
    for (const mapping of SYMBOL_MAPPINGS) {
      out.push(await buildYahooContextFor(mapping));
    }
    return out;
  }
  return Promise.all(SYMBOL_MAPPINGS.map(buildContextFor));
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    provider,
    feed: alpacaCfg.feed,
    crossMarket: CROSS_MARKET_ENABLED === "true",
    ai: { configured: aiConfigured(), model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001" },
    symbols: SYMBOL_MAPPINGS.map(m =>
      provider === "yahoo" ? `${m.futures.symbol}=${m.yahooSymbol}` : `${m.futures.symbol}/${m.etf}`,
    ),
    tradersPost: {
      configured: !!TRADERSPOST_WEBHOOK_URL,
      webhook: TRADERSPOST_WEBHOOK_URL ? redactWebhook(TRADERSPOST_WEBHOOK_URL) : null,
    },
    telegram: {
      configured: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
      chatId: TELEGRAM_CHAT_ID ? maskChatId(TELEGRAM_CHAT_ID) : null,
    },
  });
});

function maskChatId(id: string): string {
  if (id.length <= 4) return "***";
  return `${id.slice(0, 2)}***${id.slice(-2)}`;
}

app.post("/dispatch/telegram", async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return res.status(503).json({
      ok: false,
      error: "Telegram not configured. Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in backend/alpaca-feed/.env and restart.",
    });
  }
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  if (!text) {
    return res.status(400).json({ ok: false, error: "body.text required" });
  }
  try {
    const result = await sendTelegramMessage(text, {
      botToken: TELEGRAM_BOT_TOKEN,
      chatId: TELEGRAM_CHAT_ID,
    });
    console.log(`[/dispatch/telegram] ${result.status} ${result.ok ? "ok" : "FAIL"} (${text.length} chars)`);
    res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/dispatch/telegram] error:", msg);
    res.status(400).json({ ok: false, error: msg });
  }
});

app.post("/dispatch/traderspost", async (req, res) => {
  if (!TRADERSPOST_WEBHOOK_URL) {
    return res.status(503).json({
      ok: false,
      error: "TradersPost webhook URL not configured. Set TRADERSPOST_WEBHOOK_URL in backend/alpaca-feed/.env and restart.",
    });
  }
  try {
    const payload = validatePayload(req.body);
    const result = await dispatchTradersPost(payload, TRADERSPOST_WEBHOOK_URL);
    console.log(`[/dispatch/traderspost] ${payload.action} ${payload.ticker} qty=${payload.quantity} -> ${result.status}`);
    res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/dispatch/traderspost] error:", msg);
    res.status(400).json({ ok: false, error: msg });
  }
});

// On-demand morning brief — build + send to Telegram immediately.
// Useful for testing, or for operators who want a fresh brief mid-session.
app.post("/dispatch/brief", async (_req, res) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return res.status(503).json({
      ok: false,
      error: "Telegram not configured. Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in backend/alpaca-feed/.env and restart.",
    });
  }
  try {
    console.log("[/dispatch/brief] on-demand brief requested...");
    const contexts = await buildSnapshot();
    const brief = await buildMorningBrief(contexts);
    const message = formatBriefMessage(brief);
    const result = await sendTelegramMessage(message, {
      botToken: TELEGRAM_BOT_TOKEN,
      chatId: TELEGRAM_CHAT_ID,
    });
    console.log(`[/dispatch/brief] ${result.ok ? "sent ✓" : "FAILED"} (${message.length} chars)`);
    res.status(result.ok ? 200 : 502).json({
      ...result,
      preview: message,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/dispatch/brief] error:", msg);
    res.status(500).json({ ok: false, error: msg });
  }
});

app.get("/market/contexts", async (_req, res) => {
  try {
    const now = Date.now();
    const includeCross = CROSS_MARKET_ENABLED === "true";
    const crossP = includeCross ? getCrossMarketSnapshot().catch((err) => {
      console.warn(`[cross-market] snapshot failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }) : Promise.resolve(null);
    if (cachedSnapshot && now - cachedSnapshot.at < cacheTtl) {
      const crossMarket = await crossP;
      return res.json({
        contexts: cachedSnapshot.contexts,
        crossMarket,
        provider,
        cached: true,
        ageMs: now - cachedSnapshot.at,
      });
    }
    const [contexts, crossMarket] = await Promise.all([buildSnapshot(), crossP]);
    cachedSnapshot = { at: now, contexts };
    res.json({ contexts, crossMarket, provider, cached: false, ageMs: 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/market/contexts] failure:", msg);
    res.status(502).json({ error: msg });
  }
});

app.get("/market/cross", async (_req, res) => {
  try {
    const snapshot = await getCrossMarketSnapshot();
    res.json(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/market/cross] failure:", msg);
    res.status(502).json({ error: msg });
  }
});

// Force a fresh pull of futures + cross-market. Useful when operator
// wants data outside the scheduled refresh windows (e.g. a surprise
// Fed headline dropped at 11:03am). Rate-limited by providers.
app.post("/market/refresh", async (_req, res) => {
  try {
    const contexts = await buildSnapshot();
    cachedSnapshot = { at: Date.now(), contexts };
    let cross: CrossMarketSnapshot | null = null;
    if (CROSS_MARKET_ENABLED === "true") {
      cross = await fetchCrossMarketSnapshot().catch(() => null);
      if (cross) cachedCrossMarket = { at: Date.now(), snapshot: cross };
    }
    console.log(`[/market/refresh] refreshed ${contexts.length} contexts + cross=${cross ? "✓" : "✗"}`);
    res.json({ ok: true, contexts: contexts.length, crossMarket: cross });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/market/refresh] failure:", msg);
    res.status(502).json({ ok: false, error: msg });
  }
});

// ---------------------------------------------------------------------------
// AI endpoints (Claude Haiku 4.5 by default)
// ---------------------------------------------------------------------------

app.get("/ai/status", (_req, res) => {
  res.json({ configured: aiConfigured(), model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001" });
});

app.post("/ai/trade-reasoning", async (req, res) => {
  if (!aiConfigured()) {
    return res.status(503).json({ ok: false, error: "AI not configured (set ANTHROPIC_API_KEY)" });
  }
  try {
    const body = req.body as TradeReasoningInput;
    if (!body?.selected?.strategy) return res.status(400).json({ ok: false, error: "body.selected.strategy required" });
    const commentary = await aiTradeReasoning(body);
    res.json({ ok: true, commentary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/ai/trade-reasoning] error:", msg);
    res.status(500).json({ ok: false, error: msg });
  }
});

app.post("/ai/journal-analysis", async (req, res) => {
  if (!aiConfigured()) {
    return res.status(503).json({ ok: false, error: "AI not configured (set ANTHROPIC_API_KEY)" });
  }
  try {
    const journal = req.body?.journal as JournalAnalysisEntry[] | undefined;
    if (!Array.isArray(journal)) return res.status(400).json({ ok: false, error: "body.journal must be an array" });
    const analysis = await aiJournalAnalysis(journal);
    res.json({ ok: true, analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/ai/journal-analysis] error:", msg);
    res.status(500).json({ ok: false, error: msg });
  }
});

app.post("/ai/morning-brief", async (req, res) => {
  if (!aiConfigured()) {
    return res.status(503).json({ ok: false, error: "AI not configured (set ANTHROPIC_API_KEY)" });
  }
  try {
    const body = req.body as MorningBriefInput;
    if (!Array.isArray(body?.contexts)) return res.status(400).json({ ok: false, error: "body.contexts required" });
    const narrative = await aiMorningBrief(body);
    res.json({ ok: true, narrative });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/ai/morning-brief] error:", msg);
    res.status(500).json({ ok: false, error: msg });
  }
});

// ---------------------------------------------------------------------------
// Morning brief builder (simplified backend version)
// ---------------------------------------------------------------------------

interface OvernightSummary {
  symbol: string;
  sessionBias: "bullish" | "bearish" | "neutral";
  regimeSupport: boolean;
}

interface SectorRotation {
  capitalFlow: "risk_on" | "risk_off" | "neutral";
  relativeStrength: { symbol: string; relScore: number }[];
}

interface MorningBrief {
  date: string;
  economicCalendar: EconomicEvent[];
  overnightSummary: OvernightSummary[];
  sectorRotation: SectorRotation;
  crossMarket: CrossMarketSnapshot | null;
}

function buildOvernightSummary(ctx: InstrumentContext): OvernightSummary {
  const { instrument, price, atr, priorHigh, priorLow, regime, regimeConfidence } = ctx;
  const overnightClose = priorHigh - (priorHigh - priorLow) * 0.6 * 0.35;
  const gapSize = price - overnightClose;
  const gapType = gapSize > atr * 0.15 ? "gap_up" : gapSize < -atr * 0.15 ? "gap_down" : "flat";

  const trendUp   = regime === "strong_trend_up";
  const trendDown = regime === "strong_trend_down";
  const sessionBias = trendUp ? "bullish" : trendDown ? "bearish" : "neutral";

  const regimeSupport =
    (sessionBias === "bullish" && trendUp) ||
    (sessionBias === "bearish" && trendDown) ||
    (sessionBias === "neutral" && regimeConfidence > 0.5);

  return { symbol: instrument.symbol, sessionBias, regimeSupport };
}

function buildSectorRotation(contexts: InstrumentContext[]): SectorRotation {
  const equities = contexts.filter(c => c.instrument.category === "equity_future");
  const energies  = contexts.filter(c => c.instrument.category === "energy_future");
  const metals    = contexts.filter(c => c.instrument.category === "metal_future");

  const avgLiqEquities = equities.reduce((s, c) => s + c.liquidityScore, 0) / (equities.length || 1);
  const avgLiqEnergies  = energies.reduce((s,  c) => s + c.liquidityScore, 0) / (energies.length  || 1);
  const avgLiqMetals    = metals.reduce(  (s,  c) => s + c.liquidityScore, 0) / (metals.length    || 1);

  const relativeStrength = contexts.map(c => ({
    symbol: c.instrument.symbol,
    relScore: parseFloat(c.liquidityScore.toFixed(2)),
  })).sort((a, b) => b.relScore - a.relScore);

  const leading: string[] = [];
  const lagging: string[] = [];
  if (avgLiqEquities > 0.8) leading.push("Equities"); else if (avgLiqEquities < 0.6) lagging.push("Equities");
  if (avgLiqEnergies > 0.75) leading.push("Energy");  else if (avgLiqEnergies < 0.55) lagging.push("Energy");
  if (avgLiqMetals   > 0.75) leading.push("Metals");  else if (avgLiqMetals   < 0.55) lagging.push("Metals");

  const avgEventRisk = contexts.reduce((s, c) => s + c.eventRisk, 0) / (contexts.length || 1);
  const capitalFlow: "risk_on" | "risk_off" | "neutral" =
    avgEventRisk > 0.5 ? "risk_off" :
    avgLiqEquities > 0.75 ? "risk_on" :
    "neutral";

  return { capitalFlow, relativeStrength };
}

async function buildMorningBrief(contexts: InstrumentContext[]): Promise<MorningBrief> {
  const now = new Date();
  const includeCross = CROSS_MARKET_ENABLED === "true";
  const [calendar, crossMarket] = await Promise.all([
    getEconomicCalendar(),
    includeCross
      ? getCrossMarketSnapshot().catch(() => null)
      : Promise.resolve(null),
  ]);
  return {
    date: now.toISOString().slice(0, 10),
    economicCalendar: calendar,
    overnightSummary: contexts.map(buildOvernightSummary),
    sectorRotation: buildSectorRotation(contexts),
    crossMarket,
  };
}

// Richer pre-market brief modelled on SignalForge's Telegram layout —
// TL;DR one-liner up top, cross-market snapshot, then the usual blocks.
// Operators pasting this into a group chat get the headline in 3 seconds
// and the detail if they want it.
function formatBriefMessage(brief: MorningBrief): string {
  const { economicCalendar, overnightSummary, sectorRotation, date, crossMarket } = brief;
  const highImpact = economicCalendar.filter(e => e.impact === "high");
  const bullishN = overnightSummary.filter(o => o.sessionBias === "bullish").length;
  const bearishN = overnightSummary.filter(o => o.sessionBias === "bearish").length;
  const flow = sectorRotation.capitalFlow.replace("_", " ");

  const tldr =
    crossMarket && crossMarket.regimeBias !== "neutral"
      ? `${crossMarket.regimeBias.replace("_", "-")} tape · ${bullishN} long / ${bearishN} short bias · ${flow}`
      : `${flow} flow · ${bullishN} long / ${bearishN} short bias`;

  const lines: string[] = [];
  lines.push(`📋 Pre-Market Brief · ${date}`);
  lines.push(`TL;DR: ${tldr}`);
  lines.push("");

  if (crossMarket) {
    lines.push("🌐 Cross-market:");
    lines.push(`  ${crossMarket.summary}`);
    lines.push("");
  }

  if (highImpact.length > 0) {
    lines.push("⚠️ High-impact events:");
    for (const e of highImpact.slice(0, 6)) {
      const deltaNote = e.forecast !== "—" ? ` (fcst ${e.forecast}, prev ${e.previous})` : "";
      lines.push(`  • ${e.time} ${e.event}${deltaNote}`);
    }
    lines.push("");
  }

  lines.push("📈 Overnight bias:");
  for (const o of overnightSummary.slice(0, 6)) {
    const arrow = o.sessionBias === "bullish" ? "▲" : o.sessionBias === "bearish" ? "▼" : "—";
    const support = o.regimeSupport ? "✓" : "✗";
    lines.push(`  • ${o.symbol} ${arrow} ${o.sessionBias} ${support}`);
  }
  lines.push("");

  lines.push("💧 Liquidity leaders:");
  for (const r of sectorRotation.relativeStrength.slice(0, 3)) {
    lines.push(`  • ${r.symbol} ${(r.relScore * 100).toFixed(0)}%`);
  }

  if (crossMarket && crossMarket.regimeBias !== "neutral") {
    lines.push("");
    const tilt = crossMarket.regimeBias === "risk_on"
      ? "Favor long equities · fade long safe-havens (metals)."
      : "Favor long safe-havens (metals) · fade long equities.";
    lines.push(`🎯 Playbook tilt: ${tilt}`);
  }

  return lines.join("\n");
}

const port = Number(PORT) || 3001;
app.listen(port, () => {
  console.log(`[alpaca-feed] listening on http://localhost:${port}`);
  console.log(`[alpaca-feed] provider=${provider}${provider === "alpaca" ? ` feed=${alpacaCfg.feed}` : " (Yahoo Finance, ~15min delay)"} symbols=${SYMBOL_MAPPINGS.map(m => m.futures.symbol).join(",")}`);
  console.log(`[alpaca-feed] cross-market (VIX/DXY/10y): ${CROSS_MARKET_ENABLED === "true" ? "ENABLED" : "DISABLED"}`);
  console.log(`[alpaca-feed] AI (Claude): ${aiConfigured() ? `ENABLED (${process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001"})` : "DISABLED (no ANTHROPIC_API_KEY)"}`);
  if (TRADERSPOST_WEBHOOK_URL) {
    console.log(`[alpaca-feed] tradersPost webhook: ${redactWebhook(TRADERSPOST_WEBHOOK_URL)}`);
  } else {
    console.log(`[alpaca-feed] tradersPost dispatch: DISABLED (no TRADERSPOST_WEBHOOK_URL set)`);
  }
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    console.log(`[alpaca-feed] telegram notifications: ENABLED (chat ${maskChatId(TELEGRAM_CHAT_ID)})`);
  } else {
    console.log(`[alpaca-feed] telegram notifications: DISABLED (no TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID set)`);
  }

  // Schedule morning brief (weekdays 7:30am by default, or custom cron expression)
  if (MORNING_BRIEF_ENABLED === "true" && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    cron.schedule(MORNING_BRIEF_CRON, async () => {
      try {
        console.log("[morning-brief] executing scheduled brief...");
        const contexts = await buildSnapshot();
        const brief = await buildMorningBrief(contexts);
        const message = formatBriefMessage(brief);
        const result = await sendTelegramMessage(message, {
          botToken: TELEGRAM_BOT_TOKEN,
          chatId: TELEGRAM_CHAT_ID,
        });
        console.log(`[morning-brief] ${result.ok ? "sent ✓" : "FAILED"} (${message.length} chars)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[morning-brief] error:", msg);
      }
    });
    console.log(`[alpaca-feed] morning brief: SCHEDULED (${MORNING_BRIEF_CRON})`);
  } else if (MORNING_BRIEF_ENABLED === "true") {
    console.log(`[alpaca-feed] morning brief: DISABLED (no telegram config)`);
  }

  // Scheduled Yahoo refresh — only when provider=yahoo. Two pulls per
  // trading day is enough for discretionary/swing workflows and keeps
  // us comfortably under Yahoo's rate limits. POST /market/refresh for
  // ad-hoc updates.
  if (provider === "yahoo" && YAHOO_REFRESH_CRON) {
    cron.schedule(YAHOO_REFRESH_CRON, async () => {
      try {
        console.log("[yahoo-refresh] scheduled pull starting...");
        const contexts = await buildSnapshot();
        cachedSnapshot = { at: Date.now(), contexts };
        if (CROSS_MARKET_ENABLED === "true") {
          const cross = await fetchCrossMarketSnapshot().catch(() => null);
          if (cross) cachedCrossMarket = { at: Date.now(), snapshot: cross };
        }
        console.log(`[yahoo-refresh] done — ${contexts.length} contexts cached`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[yahoo-refresh] error:", msg);
      }
    });
    console.log(`[alpaca-feed] yahoo refresh: SCHEDULED (${YAHOO_REFRESH_CRON})`);

    // Do an initial pull 5s after startup so we have data right away,
    // without blocking the listen() callback. Failures are logged and
    // the operator can retry via /market/refresh.
    setTimeout(async () => {
      try {
        console.log("[yahoo-refresh] initial pull on startup...");
        const contexts = await buildSnapshot();
        cachedSnapshot = { at: Date.now(), contexts };
        if (CROSS_MARKET_ENABLED === "true") {
          const cross = await fetchCrossMarketSnapshot().catch(() => null);
          if (cross) cachedCrossMarket = { at: Date.now(), snapshot: cross };
        }
        console.log(`[yahoo-refresh] initial pull done — ${contexts.length} contexts cached`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[yahoo-refresh] initial pull error:", msg);
      }
    }, 5000);
  }

  // Hybrid mode — Alpaca quotes/intraday + one Yahoo daily-bar pull per
  // trading day to get real consolidated priorHigh/priorLow. One hit
  // per symbol per day is well under Yahoo's rate limit.
  if (provider === "alpaca" && HYBRID_YAHOO_DAILIES === "true") {
    cron.schedule(HYBRID_YAHOO_DAILIES_CRON, () => {
      refreshYahooDailies().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[hybrid-yahoo-daily] cron error:", msg);
      });
    });
    console.log(`[alpaca-feed] hybrid yahoo dailies: SCHEDULED (${HYBRID_YAHOO_DAILIES_CRON})`);

    // Initial pull 3s after startup so priorHigh/priorLow are correct
    // on the first /market/contexts request.
    setTimeout(() => {
      refreshYahooDailies().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[hybrid-yahoo-daily] initial pull error:", msg);
      });
    }, 3000);
  }
});
