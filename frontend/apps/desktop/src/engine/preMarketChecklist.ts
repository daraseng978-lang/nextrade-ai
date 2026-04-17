import type { InstrumentContext } from "./types";

// ---------------------------------------------------------------------------
// Pre-market checklist types
// ---------------------------------------------------------------------------

export interface EconomicEvent {
  time: string;
  event: string;
  impact: "high" | "medium" | "low";
  previous: string;
  forecast: string;
}

export interface KeyLevel {
  price: number;
  label: string;
  type: "support" | "resistance" | "pivot";
}

export interface TechnicalLevel {
  symbol: string;
  keyLevels: KeyLevel[];
  overnightHigh: number;
  overnightLow: number;
  vwapAnchor: number;
  openingRangeHigh: number;
  openingRangeLow: number;
}

export interface OvernightSummary {
  symbol: string;
  sessionBias: "bullish" | "bearish" | "neutral";
  sessionRange: number;
  rangeVsAtr: number;
  gapType: "gap_up" | "gap_down" | "flat";
  gapSize: number;
  regimeSupport: boolean;
}

export interface SectorRotation {
  leadingSectors: string[];
  laggingSectors: string[];
  capitalFlow: "risk_on" | "risk_off" | "neutral";
  relativeStrength: { symbol: string; relScore: number }[];
}

export interface MentalReadiness {
  sessionReadiness: "ready" | "caution" | "stand_aside";
  notes: string[];
  suggestedMaxTrades: number;
}

export interface PreMarketBrief {
  date: string;
  technicalLevels: TechnicalLevel[];
  economicCalendar: EconomicEvent[];
  overnightSummary: OvernightSummary[];
  sectorRotation: SectorRotation;
  mentalReadiness: MentalReadiness;
  enrichedAt: string;
  handoffAgent: "strat";
}

// ---------------------------------------------------------------------------
// Deterministic mock economic calendar for the current session date
// ---------------------------------------------------------------------------

const CALENDAR_POOL: EconomicEvent[] = [
  { time: "08:30 ET", event: "Initial Jobless Claims",  impact: "medium", previous: "215K",  forecast: "218K" },
  { time: "08:30 ET", event: "Core CPI MoM",            impact: "high",   previous: "0.3%", forecast: "0.2%" },
  { time: "09:45 ET", event: "S&P Flash PMI",           impact: "medium", previous: "52.1", forecast: "51.8" },
  { time: "10:00 ET", event: "ISM Manufacturing PMI",   impact: "high",   previous: "49.2", forecast: "49.8" },
  { time: "10:00 ET", event: "JOLTS Job Openings",      impact: "medium", previous: "8.76M",forecast: "8.63M"},
  { time: "14:00 ET", event: "FOMC Meeting Minutes",    impact: "high",   previous: "—",    forecast: "—" },
  { time: "10:30 ET", event: "EIA Crude Inventories",   impact: "medium", previous: "-2.1M",forecast: "-1.5M"},
];

// Use day-of-month to pick a stable 2-3 event subset
function pickTodaysEvents(date: Date): EconomicEvent[] {
  const day = date.getUTCDate();
  const count = (day % 2 === 0) ? 3 : 2;
  const start = day % CALENDAR_POOL.length;
  return Array.from({ length: count }, (_, i) => CALENDAR_POOL[(start + i) % CALENDAR_POOL.length]);
}

// ---------------------------------------------------------------------------
// Technical levels derived from InstrumentContext
// ---------------------------------------------------------------------------

function buildTechnicalLevels(ctx: InstrumentContext): TechnicalLevel {
  const { instrument, price, atr, vwap, openingRange, priorHigh, priorLow } = ctx;
  const halfAtr = atr * 0.5;

  const levels: KeyLevel[] = ([
    { price: priorHigh,            label: "Prior Day High",      type: "resistance" as const },
    { price: priorLow,             label: "Prior Day Low",       type: "support"    as const },
    { price: openingRange.high,    label: "Opening Range High",  type: "resistance" as const },
    { price: openingRange.low,     label: "Opening Range Low",   type: "support"    as const },
    { price: vwap,                 label: "VWAP",                type: "pivot"      as const },
    { price: price + halfAtr,      label: "ATR Extension High",  type: "resistance" as const },
    { price: price - halfAtr,      label: "ATR Extension Low",   type: "support"    as const },
  ] as KeyLevel[]).sort((a, b) => b.price - a.price);

  return {
    symbol: instrument.symbol,
    keyLevels: levels,
    overnightHigh: priorHigh - atr * 0.3,
    overnightLow:  priorLow  + atr * 0.3,
    vwapAnchor: vwap,
    openingRangeHigh: openingRange.high,
    openingRangeLow:  openingRange.low,
  };
}

// ---------------------------------------------------------------------------
// Overnight session summary derived from InstrumentContext
// ---------------------------------------------------------------------------

function buildOvernightSummary(ctx: InstrumentContext): OvernightSummary {
  const { instrument, price, atr, priorHigh, priorLow, regime, regimeConfidence } = ctx;
  const sessionRange = (priorHigh - priorLow) * 0.6; // overnight is ~60% of prior full range
  const rangeVsAtr = sessionRange / atr;

  const overnightClose = priorHigh - sessionRange * 0.35;
  const gapSize = price - overnightClose;
  const gapType = gapSize > atr * 0.15 ? "gap_up" : gapSize < -atr * 0.15 ? "gap_down" : "flat";

  const trendUp   = regime === "strong_trend_up"   || regime === "breakout_continuation" as string;
  const trendDown = regime === "strong_trend_down";
  const sessionBias = trendUp ? "bullish" : trendDown ? "bearish" : "neutral";

  // Regime support: bullish overnight AND uptrend regime, or bearish overnight AND downtrend, or neutral
  const regimeSupport =
    (sessionBias === "bullish" && trendUp) ||
    (sessionBias === "bearish" && trendDown) ||
    (sessionBias === "neutral" && regimeConfidence > 0.5);

  return {
    symbol: instrument.symbol,
    sessionBias,
    sessionRange: parseFloat(sessionRange.toFixed(2)),
    rangeVsAtr:   parseFloat(rangeVsAtr.toFixed(2)),
    gapType,
    gapSize: parseFloat(Math.abs(gapSize).toFixed(2)),
    regimeSupport,
  };
}

// ---------------------------------------------------------------------------
// Sector rotation derived from instrument contexts
// ---------------------------------------------------------------------------

function buildSectorRotation(contexts: InstrumentContext[]): SectorRotation {
  const equities = contexts.filter(c => c.instrument.category === "equity_future");
  const energies  = contexts.filter(c => c.instrument.category === "energy_future");
  const metals    = contexts.filter(c => c.instrument.category === "metal_future");

  const avgLiqEquities = equities.reduce((s, c) => s + c.liquidityScore, 0) / (equities.length || 1);
  const avgLiqEnergies  = energies.reduce((s,  c) => s + c.liquidityScore, 0) / (energies.length  || 1);
  const avgLiqMetals    = metals.reduce(  (s,  c) => s + c.liquidityScore, 0) / (metals.length    || 1);

  // Relative strength: normalize liquidityScore across all contexts
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

  return { leadingSectors: leading, laggingSectors: lagging, capitalFlow, relativeStrength };
}

// ---------------------------------------------------------------------------
// Mental readiness assessment
// ---------------------------------------------------------------------------

function buildMentalReadiness(
  contexts: InstrumentContext[],
  killSwitch: boolean,
  events: EconomicEvent[],
): MentalReadiness {
  const notes: string[] = [];
  const highImpactCount = events.filter(e => e.impact === "high").length;
  const avgEventRisk = contexts.reduce((s, c) => s + c.eventRisk, 0) / (contexts.length || 1);

  let readinessScore = 1.0;

  if (killSwitch) {
    notes.push("Kill switch is engaged — system in standby mode.");
    readinessScore -= 0.8;
  }

  if (highImpactCount >= 2) {
    notes.push(`${highImpactCount} high-impact events scheduled — reduce size or stand aside near releases.`);
    readinessScore -= 0.3;
  } else if (highImpactCount === 1) {
    notes.push("1 high-impact event scheduled — widen stops or wait for post-release clarity.");
    readinessScore -= 0.15;
  }

  if (avgEventRisk > 0.4) {
    notes.push("Elevated event risk across watchlist — prefer defined-risk entries.");
    readinessScore -= 0.2;
  }

  const lowQualityCount = contexts.filter(c => c.regime === "low_quality_no_trade").length;
  if (lowQualityCount > 1) {
    notes.push(`${lowQualityCount} instruments in low-quality no-trade regime — patience required.`);
    readinessScore -= 0.1;
  }

  if (notes.length === 0) {
    notes.push("Conditions look clean. Execute your process and manage risk.");
  }

  const sessionReadiness: MentalReadiness["sessionReadiness"] =
    readinessScore >= 0.75 ? "ready" :
    readinessScore >= 0.45 ? "caution" :
    "stand_aside";

  // Quality over quantity — cap at 2 good trades on a ready day, 1 on
  // caution. Trader explicitly wants 1-2 high-conviction trades, not
  // 50 mediocre ones.
  const suggestedMaxTrades =
    sessionReadiness === "ready"      ? 2 :
    sessionReadiness === "caution"    ? 1 :
    0;

  return { sessionReadiness, notes, suggestedMaxTrades };
}

// ---------------------------------------------------------------------------
// Main builder — Reggie calls this once per session morning
// ---------------------------------------------------------------------------

export function buildPreMarketBrief(
  contexts: InstrumentContext[],
  killSwitch: boolean,
): PreMarketBrief {
  const now = new Date();
  const events = pickTodaysEvents(now);

  return {
    date: now.toISOString().slice(0, 10),
    technicalLevels: contexts.map(buildTechnicalLevels),
    economicCalendar: events,
    overnightSummary: contexts.map(buildOvernightSummary),
    sectorRotation:   buildSectorRotation(contexts),
    mentalReadiness:  buildMentalReadiness(contexts, killSwitch, events),
    enrichedAt: now.toISOString(),
    handoffAgent: "strat",
  };
}

// ---------------------------------------------------------------------------
// Enrich InstrumentContext fields using the pre-market brief
// Called before decide() so the decision engine uses Reggie's findings
// ---------------------------------------------------------------------------

export function enrichContextsWithBrief(
  contexts: InstrumentContext[],
  brief: PreMarketBrief,
): InstrumentContext[] {
  return contexts.map((ctx) => {
    const overnight = brief.overnightSummary.find(o => o.symbol === ctx.instrument.symbol);
    const highImpact = brief.economicCalendar.filter(e => e.impact === "high");

    // Economic calendar → raise eventRisk for high-impact days
    const eventRiskBoost = highImpact.length * 0.12;
    const enrichedEventRisk = Math.min(1, ctx.eventRisk + eventRiskBoost);

    // Overnight session → adjust regimeConfidence (support = nudge up, contradiction = nudge down)
    const regimeDelta = overnight?.regimeSupport ? 0.05 : -0.05;
    const enrichedRegimeConfidence = Math.max(0, Math.min(1, ctx.regimeConfidence + regimeDelta));

    // Sector rotation → liquidityScore is already best-sourced from the sector
    // but we can nudge it based on capital flow
    const { capitalFlow } = brief.sectorRotation;
    const liquidityDelta =
      ctx.instrument.category === "equity_future" && capitalFlow === "risk_on"  ?  0.05 :
      ctx.instrument.category === "equity_future" && capitalFlow === "risk_off" ? -0.08 :
      ctx.instrument.category === "metal_future"  && capitalFlow === "risk_off" ?  0.05 :
      0;
    const enrichedLiquidityScore = Math.max(0, Math.min(1, ctx.liquidityScore + liquidityDelta));

    return {
      ...ctx,
      eventRisk:        enrichedEventRisk,
      regimeConfidence: enrichedRegimeConfidence,
      liquidityScore:   enrichedLiquidityScore,
    };
  });
}
