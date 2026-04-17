import type {
  InstrumentContext,
  PlaybookCandidate,
  RegimeId,
  ScoreBreakdown,
  Side,
  StrategyId,
} from "./types";
import { STRATEGIES } from "./strategies";
import { blendedEdgeForStrategy } from "./strategyEdge";
import type { JournalEntry } from "./journal";
import { REGIME_STRATEGY_MAP } from "./regimes";

// Given an instrument context, generate a concrete candidate trade for
// a given strategy. The generator is deterministic: same context in → same
// candidate out. Levels are anchored to session structure, never invented.
// Pass `journal` so Capital Lab's preset edge gets blended with realized
// outcomes (Bayesian shrinkage) before feeding into the score.
export function buildCandidate(
  strategy: StrategyId,
  ctx: InstrumentContext,
  journal: JournalEntry[] = [],
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

  const tp2 = side === "long" ? entry + meta.defaultTargetR * stopDistance : entry - meta.defaultTargetR * stopDistance;
  const tp1 = entry + (tp2 - entry) * 0.5;
  const rMultiple = meta.defaultTargetR;

  const { score: rawScore, breakdown } = scoreCandidate(meta.id, ctx, side, journal);

  // Surface the edge the score is actually using — shows Capital Lab preset
  // first, then realized once the journal has real trades to override it.
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
  };
}

// Score a candidate in [0..1] and return every contribution so the UI can
// show traders why. Weights pre-event-penalty sum to 1.0:
//   regime fit (0.25) + regime confidence (0.25) + liquidity (0.15)
// + Capital Lab/journal blended edge (0.25) + side alignment (0.10)
// − event penalty (0.20).
// The edge contribution is Bayesian-shrunk: preset dominates when the
// journal has no closed trades for this strategy; realized dominates
// after enough samples accumulate.
function scoreCandidate(
  strategy: StrategyId,
  ctx: InstrumentContext,
  side: Side,
  journal: JournalEntry[],
): { score: number; breakdown: ScoreBreakdown } {
  const regimeOk = (REGIME_STRATEGY_MAP[ctx.regime] as StrategyId[]).includes(strategy);
  const regimeScore = regimeOk ? 0.25 : 0.08;
  const confidenceScore = 0.25 * ctx.regimeConfidence;
  const liquidityScore = 0.15 * ctx.liquidityScore;

  const edgeInfo = blendedEdgeForStrategy(strategy, journal);
  const edgeScore = 0.25 * edgeInfo.edgeScore;

  const eventPenalty = 0.2 * ctx.eventRisk;

  let sideAlignment = 0.1;
  if (
    (side === "long" && (ctx.regime === "strong_trend_up" || ctx.regime === "expansion_breakout")) ||
    (side === "short" && ctx.regime === "strong_trend_down")
  ) {
    sideAlignment = 0.1;
  }

  const raw = regimeScore + confidenceScore + liquidityScore + edgeScore + sideAlignment - eventPenalty;
  const score = Math.max(0, Math.min(1, raw));

  const breakdown: ScoreBreakdown = {
    regime: regimeScore,
    confidence: confidenceScore,
    liquidity: liquidityScore,
    edge: edgeScore,
    side: sideAlignment,
    event: -eventPenalty,
    total: score,
    realizedN: edgeInfo.realized?.n ?? 0,
  };
  return { score, breakdown };
}

export function candidatesForRegime(regime: RegimeId): StrategyId[] {
  return REGIME_STRATEGY_MAP[regime];
}
