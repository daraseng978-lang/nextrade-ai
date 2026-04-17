import express from "express";
import cors from "cors";
import cron from "node-cron";
import dotenv from "dotenv";
import { fetchDailyBars, fetchIntradayBars, fetchLatestQuote, type AlpacaConfig } from "./alpaca.js";
import { atrFromBars, openingRangeFromBars, priorDayHighLow, spreadFromQuote, vwapFromBars } from "./indicators.js";
import { classifyRegime } from "./regime.js";
import { SYMBOL_MAPPINGS, scale, type SymbolMapping } from "./mapping.js";
import type { InstrumentContext } from "./types.js";
import { dispatchTradersPost, redactWebhook, validatePayload } from "./dispatch.js";
import { sendTelegramMessage } from "./telegram.js";
import { getEconomicCalendar, type EconomicEvent } from "./calendar.js";

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
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    feed: alpacaCfg.feed,
    symbols: SYMBOL_MAPPINGS.map(m => `${m.futures.symbol}/${m.etf}`),
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
  const calendar = await getEconomicCalendar();
  return {
    date: now.toISOString().slice(0, 10),
    economicCalendar: calendar,
    overnightSummary: contexts.map(buildOvernightSummary),
    sectorRotation: buildSectorRotation(contexts),
  };
}

function formatBriefMessage(brief: MorningBrief): string {
  const { economicCalendar, overnightSummary, sectorRotation, date } = brief;
  const highImpact = economicCalendar.filter(e => e.impact === "high");
  const bullets: string[] = [];
  bullets.push(`📋 Morning Brief · ${date}`);
  bullets.push("");
  bullets.push(`Flow: ${sectorRotation.capitalFlow.replace("_", " ")}`);
  if (highImpact.length > 0) {
    bullets.push("");
    bullets.push("High-impact events:");
    for (const e of highImpact) {
      bullets.push(`• ${e.time} ${e.event}`);
    }
  }
  bullets.push("");
  bullets.push("Overnight bias:");
  for (const o of overnightSummary.slice(0, 6)) {
    bullets.push(`• ${o.symbol} ${o.sessionBias}${o.regimeSupport ? " ✓" : " ✗"}`);
  }
  bullets.push("");
  bullets.push("Liquidity (top 3):");
  for (const r of sectorRotation.relativeStrength.slice(0, 3)) {
    bullets.push(`• ${r.symbol} ${(r.relScore * 100).toFixed(0)}%`);
  }
  return bullets.join("\n");
}

const port = Number(PORT) || 3001;
app.listen(port, () => {
  console.log(`[alpaca-feed] listening on http://localhost:${port}`);
  console.log(`[alpaca-feed] feed=${alpacaCfg.feed} symbols=${SYMBOL_MAPPINGS.map(m => m.futures.symbol).join(",")}`);
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
});
