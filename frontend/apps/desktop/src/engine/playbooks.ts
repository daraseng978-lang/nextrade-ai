import type {
  CrossMarketSnapshot,
  InstrumentContext,
  PlaybookCandidate,
  QualityRating,
  RegimeId,
  ScoreBreakdown,
  SetupQuality,
  Side,
  StrategyId,
  StrategyMeta,
} from "./types";
import { STRATEGIES } from "./strategies";
import { blendedEdgeForStrategy } from "./strategyEdge";
import type { JournalEntry } from "./journal";
import { REGIME_STRATEGY_MAP } from "./regimes";
import { evaluateSetupQuality } from "./quality";
import { pickStructureStop } from "./stops";
import { pickStructuralTargets } from "./targets";

// Given an instrument context, generate a concrete candidate trade for
// a given strategy. Pipeline:
//   1. Base geometry — side, entry, ATR-anchored reference stop (legacy logic)
//   2. Quality evaluation — price-action trigger, VWAP, volume profile,
//      footprint (the 4-tool layered model)
//   3. Structure-anchored stop — compares structure vs ATR envelope
//   4. Structural targets — TP1 at first opposing structure, TP2 capped
//      or extended based on regime
//   5. Score — all old factors PLUS triggerQuality, locationQuality,
//      footprint bonus (soft weights, never hard gates)
export function buildCandidate(
  strategy: StrategyId,
  ctx: InstrumentContext,
  journal: JournalEntry[] = [],
  crossMarket: CrossMarketSnapshot | null = null,
): PlaybookCandidate | null {
  const meta = STRATEGIES[strategy];
  const { price, atr, vwap, openingRange, priorHigh, priorLow, regime } = ctx;

  let side: Side = "flat";
  let entry = price;
  const reasons: string[] = [];

  switch (strategy) {
    case "opening_range_breakout": {
      if (regime === "strong_trend_up" || regime === "expansion_breakout") {
        side = "long";
        entry = openingRange.high;
        reasons.push("Opening-range high break aligned with regime.");
      } else if (regime === "strong_trend_down") {
        side = "short";
        entry = openingRange.low;
        reasons.push("Opening-range low break aligned with regime.");
      }
      break;
    }
    case "expansion_breakout": {
      side = regime === "strong_trend_down" ? "short" : "long";
      entry = side === "long" ? priorHigh + ctx.instrument.tickSize : priorLow - ctx.instrument.tickSize;
      reasons.push("Volatility expansion outside prior range.");
      break;
    }
    case "breakout_continuation": {
      side = regime === "strong_trend_down" ? "short" : "long";
      entry = side === "long" ? priorHigh : priorLow;
      reasons.push("Retest of confirmed breakout level.");
      break;
    }
    case "trend_pullback_continuation": {
      side = regime === "strong_trend_down" ? "short" : "long";
      entry = vwap;
      reasons.push("Pullback into VWAP in qualified trend.");
      break;
    }
    case "balanced_auction_rotation": {
      const closerToHigh = Math.abs(price - priorHigh) < Math.abs(price - priorLow);
      side = closerToHigh ? "short" : "long";
      entry = closerToHigh ? priorHigh : priorLow;
      reasons.push("Balanced rotation — fade value-area extreme.");
      break;
    }
    case "balanced_range": {
      const closerToHigh = Math.abs(price - priorHigh) < Math.abs(price - priorLow);
      side = closerToHigh ? "short" : "long";
      entry = closerToHigh ? priorHigh : priorLow;
      reasons.push("Mechanical range scalp at extreme.");
      break;
    }
    case "vwap_reclaim_mean_reversion": {
      side = price < vwap ? "long" : "short";
      entry = vwap;
      reasons.push("VWAP reclaim after stretch.");
      break;
    }
    case "counter_trend_fade_failed_breakout": {
      const closerToHigh = Math.abs(price - priorHigh) < Math.abs(price - priorLow);
      side = closerToHigh ? "short" : "long";
      entry = closerToHigh ? priorHigh - ctx.instrument.tickSize : priorLow + ctx.instrument.tickSize;
      reasons.push("Failed breakout with reclaim.");
      break;
    }
    case "liquidity_sweep_and_reclaim": {
      const closerToHigh = Math.abs(price - priorHigh) < Math.abs(price - priorLow);
      side = closerToHigh ? "short" : "long";
      entry = closerToHigh ? priorHigh - ctx.instrument.tickSize * 2 : priorLow + ctx.instrument.tickSize * 2;
      reasons.push("Sweep of obvious liquidity followed by reclaim.");
      break;
    }
    case "reversal_mean_reversion": {
      side = regime === "strong_trend_up" ? "short" : "long";
      entry = price;
      reasons.push("Structure-break reversal against exhausted move.");
      break;
    }
    case "low_quality_no_trade":
    case "event_driven_high_risk":
    default:
      return null;
  }

  if (side === "flat") return null;

  // === Quality layers ======================================================
  const { quality, triggerRating, locationRating } = evaluateSetupQuality(ctx, meta, side, entry);

  // === Stale-prior guard ===================================================
  // Strategies that anchor entry at priorHigh/priorLow (breakout*, range
  // fades, sweep, counter-trend fade) become unreliable when the feed's
  // prior levels are ATR-fallback placeholders. Penalize location and
  // add a visible warning. Trend/VWAP-reclaim strategies are unaffected.
  const priorAnchored =
    strategy === "expansion_breakout" ||
    strategy === "breakout_continuation" ||
    strategy === "balanced_auction_rotation" ||
    strategy === "balanced_range" ||
    strategy === "counter_trend_fade_failed_breakout" ||
    strategy === "liquidity_sweep_and_reclaim";
  const stalePriorPenalty = ctx.priorLevelsStale && priorAnchored ? -0.4 : 0;

  // === Structure-anchored stop ============================================
  const stopDecision = pickStructureStop(ctx, meta, side, entry, meta.defaultStopAtrMult);
  const stop = stopDecision.stop;
  const stopDistance = Math.abs(entry - stop);
  if (stopDistance <= 0) return null;

  // === Structural targets =================================================
  const { tp1, tp2, tp1Tag } = pickStructuralTargets(ctx, meta, side, entry, stopDistance);

  const rMultiple = Math.abs(tp2 - entry) / stopDistance;

  // === Scoring ============================================================
  const effectiveLocationRating = Math.max(-1, locationRating + stalePriorPenalty);
  const { score: rawScore, breakdown } = scoreCandidate(
    meta.id, ctx, side, journal, crossMarket,
    { triggerRating, locationRating: effectiveLocationRating, footprintBonus: quality.footprintConfirmation.bonus },
  );

  // === Reason lines =======================================================
  reasons.push(`Trigger: ${quality.triggerReason}`);
  reasons.push(`VWAP: ${quality.vwapContext.reason}`);
  reasons.push(`Location: ${quality.profileLocation.reason}`);
  if (quality.footprintConfirmation.available) {
    reasons.push(`Footprint: ${quality.footprintConfirmation.reason}`);
  }
  reasons.push(`Stop: ${stopDecision.reason}`);
  if (tp1Tag !== "none") reasons.push(`TP1 anchored at ${tp1Tag}.`);
  if (stopDecision.downgrade) reasons.push("⚠ Wide structure stop — size reduced.");
  if (ctx.priorLevelsStale) {
    reasons.push(
      `⚠ Prior H/L not reliable (source: ${ctx.priorLevelsSource ?? "unknown"}). ` +
      `Using ATR fallback — treat levels as approximate until daily feed recovers.`,
    );
  }

  if (crossMarket && breakdown.crossMarket !== 0) {
    const tag = crossMarket.regimeBias === "risk_on" ? "risk-on" : crossMarket.regimeBias === "risk_off" ? "risk-off" : "neutral";
    const dir = breakdown.crossMarket > 0 ? "+" : "";
    reasons.push(`Cross-market: ${tag} (${dir}${(breakdown.crossMarket * 100).toFixed(1)}% score).`);
  }

  const edge = blendedEdgeForStrategy(meta.id, journal);
  if (edge.realized) {
    reasons.push(
      `Edge: ${(edge.blended.winRate * 100).toFixed(0)}% WR · ` +
      `${edge.blended.expectancy >= 0 ? "+" : ""}${edge.blended.expectancy.toFixed(2)}R ` +
      `(blended ${edge.realized.n} live + preset).`,
    );
  } else if (edge.preset.expectancy >= 0.3) {
    reasons.push(`Capital Lab edge: +${edge.preset.expectancy.toFixed(2)}R expectancy.`);
  } else if (edge.preset.expectancy <= 0) {
    reasons.push(`Capital Lab edge: ${edge.preset.expectancy.toFixed(2)}R — negative or flat.`);
  }

  return {
    strategy,
    instrument: ctx.instrument,
    regime,
    side,
    entry,
    stop,
    target: tp2,
    tp1,
    tp2,
    stopDistance,
    rMultiple,
    rawScore,
    reasons,
    scoreBreakdown: breakdown,
    quality,
    structureStopType: stopDecision.stopType,
    tp1StructureTag: tp1Tag,
    abortConditions: meta.quality?.abortConditions ?? [],
  };
}

// Scores in [0..1]. Base weights preserved from the prior model, with
// three new soft inputs added:
//   trigger  (±0.12) — Price Action + Volume rating
//   location (±0.08) — blended VWAP + profile-location rating
//   footprint(0..0.08) — positive-only bonus, never negative when absent
//
// Base weights were held roughly constant; trigger+location replace what
// was previously just "side alignment + regime confidence" implicit quality.
function scoreCandidate(
  strategy: StrategyId,
  ctx: InstrumentContext,
  side: Side,
  journal: JournalEntry[],
  crossMarket: CrossMarketSnapshot | null,
  q: { triggerRating: QualityRating; locationRating: QualityRating; footprintBonus: number },
): { score: number; breakdown: ScoreBreakdown } {
  const regimeOk = (REGIME_STRATEGY_MAP[ctx.regime] as StrategyId[]).includes(strategy);
  const regimeScore = regimeOk ? 0.22 : 0.06;        // was 0.25 / 0.08
  const confidenceScore = 0.20 * ctx.regimeConfidence; // was 0.25
  const liquidityScore = 0.12 * ctx.liquidityScore;  // was 0.15
  const edgeInfo = blendedEdgeForStrategy(strategy, journal);
  const edgeScore = 0.20 * edgeInfo.edgeScore;        // was 0.25
  const eventPenalty = 0.2 * ctx.eventRisk;

  let sideAlignment = 0.08;                           // was 0.10
  if (
    (side === "long" && (ctx.regime === "strong_trend_up" || ctx.regime === "expansion_breakout")) ||
    (side === "short" && ctx.regime === "strong_trend_down")
  ) {
    sideAlignment = 0.08;
  }
  const crossMarketScore = crossMarketContribution(ctx, side, crossMarket);

  // New quality inputs — soft weights scaled by their -1..1 ratings.
  const triggerComponent = 0.12 * q.triggerRating;
  const locationComponent = 0.08 * q.locationRating;
  const footprintComponent = Math.max(0, q.footprintBonus);

  const raw =
    regimeScore + confidenceScore + liquidityScore + edgeScore + sideAlignment
    + triggerComponent + locationComponent + footprintComponent
    - eventPenalty + crossMarketScore;

  const score = Math.max(0, Math.min(1, raw));

  const breakdown: ScoreBreakdown = {
    regime: regimeScore,
    confidence: confidenceScore,
    liquidity: liquidityScore,
    edge: edgeScore,
    side: sideAlignment,
    event: -eventPenalty,
    crossMarket: crossMarketScore,
    trigger: triggerComponent,
    location: locationComponent,
    footprint: footprintComponent,
    total: score,
    realizedN: edgeInfo.realized?.n ?? 0,
  };
  return { score, breakdown };
}

// Maps VIX/DXY/TNX-derived risk_on/off/neutral bias into a ±0.06 tilt
// on the raw score. Equity futures (MES/MNQ/MYM/M2K) love risk-on long;
// metals (MGC) love risk-off long. Energy (MCL) is mostly DXY-sensitive.
function crossMarketContribution(
  ctx: InstrumentContext,
  side: Side,
  crossMarket: CrossMarketSnapshot | null,
): number {
  if (!crossMarket || crossMarket.regimeBias === "neutral") return 0;
  const { regimeBias } = crossMarket;
  const { category } = ctx.instrument;
  const longBias = side === "long" ? 1 : side === "short" ? -1 : 0;
  if (longBias === 0) return 0;

  if (category === "equity_future") {
    return regimeBias === "risk_on" ? 0.04 * longBias : -0.04 * longBias;
  }
  if (category === "metal_future") {
    return regimeBias === "risk_off" ? 0.04 * longBias : -0.02 * longBias;
  }
  if (category === "energy_future") {
    return regimeBias === "risk_on" ? 0.03 * longBias : -0.03 * longBias;
  }
  return 0;
}

export function candidatesForRegime(regime: RegimeId): StrategyId[] {
  return REGIME_STRATEGY_MAP[regime];
}

// Convenience export for tests.
export type { SetupQuality, StrategyMeta };
