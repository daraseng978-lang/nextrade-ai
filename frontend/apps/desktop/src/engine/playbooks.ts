import type {
  InstrumentContext,
  PlaybookCandidate,
  RegimeId,
  Side,
  StrategyId,
} from "./types";
import { STRATEGIES } from "./strategies";
import { REGIME_STRATEGY_MAP } from "./regimes";

// Given an instrument context, generate a concrete candidate trade for
// a given strategy. The generator is deterministic: same context in → same
// candidate out. Levels are anchored to session structure, never invented.
export function buildCandidate(
  strategy: StrategyId,
  ctx: InstrumentContext,
): PlaybookCandidate | null {
  const meta = STRATEGIES[strategy];
  const { price, atr, vwap, openingRange, priorHigh, priorLow, regime } = ctx;

  let side: Side = "flat";
  let entry = price;
  let stop = price;
  const reasons: string[] = [];

  switch (strategy) {
    case "opening_range_breakout": {
      if (regime === "strong_trend_up" || regime === "expansion_breakout") {
        side = "long";
        entry = openingRange.high;
        stop = entry - meta.defaultStopAtrMult * atr;
        reasons.push("Opening-range high break aligned with regime.");
      } else if (regime === "strong_trend_down") {
        side = "short";
        entry = openingRange.low;
        stop = entry + meta.defaultStopAtrMult * atr;
        reasons.push("Opening-range low break aligned with regime.");
      }
      break;
    }
    case "expansion_breakout": {
      side = regime === "strong_trend_down" ? "short" : "long";
      entry = side === "long" ? priorHigh + ctx.instrument.tickSize : priorLow - ctx.instrument.tickSize;
      stop = side === "long" ? entry - meta.defaultStopAtrMult * atr : entry + meta.defaultStopAtrMult * atr;
      reasons.push("Volatility expansion outside prior range.");
      break;
    }
    case "breakout_continuation": {
      side = regime === "strong_trend_down" ? "short" : "long";
      entry = side === "long" ? priorHigh : priorLow;
      stop = side === "long" ? entry - meta.defaultStopAtrMult * atr : entry + meta.defaultStopAtrMult * atr;
      reasons.push("Retest of confirmed breakout level.");
      break;
    }
    case "trend_pullback_continuation": {
      side = regime === "strong_trend_down" ? "short" : "long";
      entry = vwap;
      stop = side === "long" ? vwap - meta.defaultStopAtrMult * atr : vwap + meta.defaultStopAtrMult * atr;
      reasons.push("Pullback into VWAP in qualified trend.");
      break;
    }
    case "balanced_auction_rotation": {
      const closerToHigh = Math.abs(price - priorHigh) < Math.abs(price - priorLow);
      side = closerToHigh ? "short" : "long";
      entry = closerToHigh ? priorHigh : priorLow;
      stop = closerToHigh ? entry + meta.defaultStopAtrMult * atr : entry - meta.defaultStopAtrMult * atr;
      reasons.push("Balanced rotation — fade value-area extreme.");
      break;
    }
    case "balanced_range": {
      const closerToHigh = Math.abs(price - priorHigh) < Math.abs(price - priorLow);
      side = closerToHigh ? "short" : "long";
      entry = closerToHigh ? priorHigh : priorLow;
      stop = closerToHigh ? entry + meta.defaultStopAtrMult * atr : entry - meta.defaultStopAtrMult * atr;
      reasons.push("Mechanical range scalp at extreme.");
      break;
    }
    case "vwap_reclaim_mean_reversion": {
      side = price < vwap ? "long" : "short";
      entry = vwap;
      stop = side === "long" ? vwap - meta.defaultStopAtrMult * atr : vwap + meta.defaultStopAtrMult * atr;
      reasons.push("VWAP reclaim after stretch.");
      break;
    }
    case "counter_trend_fade_failed_breakout": {
      const closerToHigh = Math.abs(price - priorHigh) < Math.abs(price - priorLow);
      side = closerToHigh ? "short" : "long";
      entry = closerToHigh ? priorHigh - ctx.instrument.tickSize : priorLow + ctx.instrument.tickSize;
      stop = closerToHigh ? priorHigh + meta.defaultStopAtrMult * atr : priorLow - meta.defaultStopAtrMult * atr;
      reasons.push("Failed breakout with reclaim.");
      break;
    }
    case "liquidity_sweep_and_reclaim": {
      const closerToHigh = Math.abs(price - priorHigh) < Math.abs(price - priorLow);
      side = closerToHigh ? "short" : "long";
      entry = closerToHigh ? priorHigh - ctx.instrument.tickSize * 2 : priorLow + ctx.instrument.tickSize * 2;
      stop = closerToHigh ? priorHigh + meta.defaultStopAtrMult * atr : priorLow - meta.defaultStopAtrMult * atr;
      reasons.push("Sweep of obvious liquidity followed by reclaim.");
      break;
    }
    case "reversal_mean_reversion": {
      side = regime === "strong_trend_up" ? "short" : "long";
      entry = price;
      stop = side === "long" ? price - meta.defaultStopAtrMult * atr : price + meta.defaultStopAtrMult * atr;
      reasons.push("Structure-break reversal against exhausted move.");
      break;
    }
    case "low_quality_no_trade":
    case "event_driven_high_risk":
    default:
      return null;
  }

  if (side === "flat") return null;

  const stopDistance = Math.abs(entry - stop);
  if (stopDistance <= 0) return null;

  const target = side === "long" ? entry + meta.defaultTargetR * stopDistance : entry - meta.defaultTargetR * stopDistance;
  const rMultiple = meta.defaultTargetR;

  const rawScore = scoreCandidate(meta.id, ctx, side);

  return {
    strategy,
    instrument: ctx.instrument,
    regime,
    side,
    entry,
    stop,
    target,
    stopDistance,
    rMultiple,
    rawScore,
    reasons,
  };
}

// Score a candidate in [0..1]. Combines regime alignment, confidence,
// liquidity, and a mild distance-to-entry factor.
function scoreCandidate(
  strategy: StrategyId,
  ctx: InstrumentContext,
  side: Side,
): number {
  const regimeOk = (REGIME_STRATEGY_MAP[ctx.regime] as StrategyId[]).includes(strategy);
  const regimeScore = regimeOk ? 0.35 : 0.1;
  const confidenceScore = 0.35 * ctx.regimeConfidence;
  const liquidityScore = 0.2 * ctx.liquidityScore;
  const eventPenalty = 0.2 * ctx.eventRisk;

  let sideAlignment = 0.1;
  if (
    (side === "long" && (ctx.regime === "strong_trend_up" || ctx.regime === "expansion_breakout")) ||
    (side === "short" && ctx.regime === "strong_trend_down")
  ) {
    sideAlignment = 0.1;
  }

  const score = regimeScore + confidenceScore + liquidityScore + sideAlignment - eventPenalty;
  return Math.max(0, Math.min(1, score));
}

export function candidatesForRegime(regime: RegimeId): StrategyId[] {
  return REGIME_STRATEGY_MAP[regime];
}
