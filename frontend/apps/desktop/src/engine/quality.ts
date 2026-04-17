import type {
  FootprintSignal,
  InstrumentContext,
  ProfileLocationTag,
  QualityRating,
  SetupQuality,
  Side,
  StrategyMeta,
  TriggerKind,
  VwapPreference,
} from "./types";

// ===== Quality evaluation (4-tool layered model) ===========================
//
// Each layer returns a rating in [-1..1]:
//   +1  strongly supports the trade
//    0  neutral (data missing or indifferent)
//   -1  strongly opposes the trade
//
// Downstream scoreCandidate() weights these as soft inputs — they never
// hard-gate a candidate out, they just raise or lower score (and indirectly
// contract sizing). That's intentional: the product rule is "best available
// trade unless a true hard block", not "no trade unless 4/4 tools agree".

const NEAR_TICK_MULT = 0.5;    // "at VWAP/level" = within 0.5 ATR
const FLAT_VWAP_SLOPE = 0.002; // |slope| < 0.2% of price = flat
const VOLUME_BASELINE = 0.8;   // bar volume below 80% of avg = weak
const VOLUME_STRONG = 1.3;     // bar volume above 130% of avg = confirming

// Layer 1 — Price Action + Volume (the core trigger layer).
// Inputs: recent bars, strategy's primary trigger kind, candidate entry
// Output: rating + reason string.
function evaluateTrigger(
  ctx: InstrumentContext,
  strategy: StrategyMeta,
  side: Side,
  entry: number,
): { rating: QualityRating; reason: string } {
  const trigger = strategy.quality?.primaryTrigger;
  if (!trigger) return { rating: 0, reason: "no trigger spec" };
  const bars = ctx.recentBars ?? [];
  if (bars.length === 0) {
    // No bar data — degrade neutral. Backend usually passes at least a few bars.
    return { rating: 0, reason: "no recent bars — trigger not verified" };
  }
  const last = bars[bars.length - 1];
  const prior = bars[bars.length - 2] ?? last;
  const avgVol = ctx.avgBarVolume ?? bars.reduce((s, b) => s + b.v, 0) / bars.length;
  const volRatio = avgVol > 0 ? last.v / avgVol : 1;

  const closedBeyond = side === "long" ? last.c > entry : last.c < entry;
  const rejectedAt = side === "long"
    ? last.l < entry && last.c > entry
    : last.h > entry && last.c < entry;

  switch (trigger) {
    case "breakout_close": {
      if (closedBeyond && volRatio >= VOLUME_STRONG) return { rating: 0.9, reason: `breakout close with ${volRatio.toFixed(1)}x vol` };
      if (closedBeyond && volRatio >= VOLUME_BASELINE) return { rating: 0.5, reason: `breakout close, volume ${volRatio.toFixed(1)}x` };
      if (closedBeyond) return { rating: 0.1, reason: "breakout close but weak volume" };
      return { rating: -0.4, reason: "no close beyond level yet" };
    }
    case "retest_hold": {
      const priorBroke = side === "long" ? prior.c > entry : prior.c < entry;
      const heldRetest = side === "long" ? last.l >= entry - 0.25 * ctx.atr : last.h <= entry + 0.25 * ctx.atr;
      if (priorBroke && heldRetest && volRatio >= VOLUME_BASELINE) return { rating: 0.7, reason: "retest held with healthy volume" };
      if (heldRetest) return { rating: 0.3, reason: "retest held (no clear prior break)" };
      return { rating: -0.2, reason: "no clean retest-hold" };
    }
    case "rejection": {
      if (rejectedAt && volRatio >= VOLUME_BASELINE) return { rating: 0.7, reason: "rejection candle with volume" };
      if (rejectedAt) return { rating: 0.4, reason: "rejection candle, volume light" };
      return { rating: -0.3, reason: "no rejection wick at level" };
    }
    case "reclaim": {
      const priorBelow = side === "long" ? prior.c < entry : prior.c > entry;
      const nowAbove = side === "long" ? last.c > entry : last.c < entry;
      if (priorBelow && nowAbove && volRatio >= VOLUME_BASELINE) return { rating: 0.8, reason: "reclaim confirmed with volume" };
      if (priorBelow && nowAbove) return { rating: 0.4, reason: "reclaim (thin volume)" };
      return { rating: -0.3, reason: "no reclaim pattern yet" };
    }
    case "sweep_reclaim": {
      const swept = side === "long" ? prior.l < entry && prior.c > entry : prior.h > entry && prior.c < entry;
      const reclaimed = side === "long" ? last.c > entry : last.c < entry;
      if (swept && reclaimed && volRatio >= VOLUME_BASELINE) return { rating: 0.9, reason: "sweep + reclaim with volume" };
      if (swept && reclaimed) return { rating: 0.5, reason: "sweep + reclaim, volume light" };
      if (swept) return { rating: 0, reason: "swept but no reclaim yet" };
      return { rating: -0.3, reason: "no sweep pattern detected" };
    }
    case "structure_break": {
      const broke = side === "long" ? last.c > prior.h : last.c < prior.l;
      if (broke && volRatio >= VOLUME_BASELINE) return { rating: 0.7, reason: "structure broken with volume" };
      if (broke) return { rating: 0.3, reason: "structure broken, volume light" };
      return { rating: -0.2, reason: "no structure break confirmed" };
    }
  }
  return { rating: 0, reason: "trigger unclassified" };
}

// Layer 2 — VWAP context (directional bias / fair value).
function evaluateVwap(
  ctx: InstrumentContext,
  pref: VwapPreference,
  side: Side,
  entry: number,
): { rating: QualityRating; alignment: "strong" | "mild" | "neutral" | "opposed"; reason: string } {
  if (pref === "any" || ctx.vwap === 0) {
    return { rating: 0, alignment: "neutral", reason: "VWAP not weighted for this strategy" };
  }
  const priceAboveVwap = entry > ctx.vwap;
  const slope = ctx.vwapSlope ?? 0;
  const slopeFlat = Math.abs(slope) / ctx.vwap < FLAT_VWAP_SLOPE;

  const wants = (target: "above" | "below"): boolean => {
    if (pref === "above") return target === "above";
    if (pref === "below") return target === "below";
    if (pref === "reclaim_above") return target === "above";
    if (pref === "reclaim_below") return target === "below";
    return false;
  };

  if (pref === "flat") {
    return slopeFlat
      ? { rating: 0.5, alignment: "mild", reason: "VWAP flat — balance regime confirmed" }
      : { rating: -0.3, alignment: "opposed", reason: "VWAP sloping — range thesis weakens" };
  }

  // For long trades we want price above VWAP (or above after reclaim).
  const wantsAbove = side === "long" ? wants("above") : wants("below");
  const aligned = side === "long" ? priceAboveVwap === wantsAbove : priceAboveVwap !== wantsAbove;
  if (aligned) {
    const slopeHelps = (side === "long" && slope > 0) || (side === "short" && slope < 0);
    if (slopeHelps) return { rating: 0.7, alignment: "strong", reason: "price and VWAP slope aligned with trade" };
    return { rating: 0.4, alignment: "mild", reason: "price aligned with VWAP preference" };
  }
  return { rating: -0.4, alignment: "opposed", reason: "price on wrong side of VWAP for this setup" };
}

// Layer 3 — Volume profile location quality.
function evaluateProfileLocation(
  ctx: InstrumentContext,
  preferred: ProfileLocationTag[],
  required: boolean,
  entry: number,
): { tag: ProfileLocationTag; rating: QualityRating; reason: string } {
  const { poc, vah, val, atr } = ctx;
  const tol = 0.3 * atr;
  const near = (a: number | undefined, b: number) => a != null && Math.abs(a - b) <= tol;

  let tag: ProfileLocationTag = "unknown";
  if (near(poc, entry)) tag = "poc";
  else if (near(vah, entry)) tag = "vah";
  else if (near(val, entry)) tag = "val";
  else if (vah != null && val != null) {
    if (entry > vah + tol || entry < val - tol) tag = "value_edge";
    else tag = "random";
  }

  // Missing profile: downgrade if strategy requires it, neutral otherwise.
  if (tag === "unknown") {
    return required
      ? { tag, rating: -0.3, reason: "no volume profile available — location unverified (range/reversal setup)" }
      : { tag, rating: 0, reason: "no volume profile available — accepted (breakout/trend setup)" };
  }

  // Prefer list checks
  const preferredSet = new Set<ProfileLocationTag>(preferred);
  if (preferredSet.has(tag)) return { tag, rating: 0.6, reason: `entry at preferred ${tag}` };
  if (tag === "random") {
    return required
      ? { tag, rating: -0.5, reason: "entry in random space (no profile anchor)" }
      : { tag, rating: -0.2, reason: "entry in random space — breakout OK but low confluence" };
  }
  return { tag, rating: 0.1, reason: `entry near ${tag} (not preferred but not bad)` };
}

// Layer 4 — Footprint / order-flow bonus. Positive-only: missing or absent
// footprint NEVER subtracts score. An available signal that opposes the
// setup downgrades confidence mildly but does not invalidate.
function evaluateFootprint(
  ctx: InstrumentContext,
  side: Side,
  preferred: FootprintSignal[],
): { available: boolean; signal: FootprintSignal; bonus: number; reason: string } {
  if (!ctx.footprintAvailable) {
    return { available: false, signal: "none", bonus: 0, reason: "footprint data unavailable — running in reduced mode" };
  }
  const delta = ctx.deltaLastBar ?? 0;
  // Lightweight heuristic classification from delta:
  //   large |delta| aligned with side → imbalance_with
  //   large |delta| opposed to side  → imbalance_against (or absorption at a level)
  //   tiny delta on wide range       → exhaustion (no new aggression)
  //   delta sign flips vs price      → delta_divergence
  let signal: FootprintSignal = "none";
  const alignedWithSide = (side === "long" && delta > 0) || (side === "short" && delta < 0);
  if (Math.abs(delta) >= 500 && alignedWithSide) signal = "imbalance_with";
  else if (Math.abs(delta) >= 500 && !alignedWithSide) signal = "imbalance_against";
  else if (Math.abs(delta) < 50) signal = "exhaustion";

  const preferredSet = new Set<FootprintSignal>(preferred);
  if (preferredSet.has(signal)) return { available: true, signal, bonus: 0.08, reason: `footprint bonus: ${signal}` };
  if (signal === "imbalance_against") return { available: true, signal, bonus: -0.04, reason: `footprint headwind: ${signal}` };
  return { available: true, signal, bonus: 0, reason: `footprint: ${signal} (not notable)` };
}

// Top-level: combines all four layers into a SetupQuality object + a pair
// of aggregate ratings (trigger, location) that scoreCandidate() uses.
export function evaluateSetupQuality(
  ctx: InstrumentContext,
  strategy: StrategyMeta,
  side: Side,
  entry: number,
): { quality: SetupQuality; triggerRating: QualityRating; locationRating: QualityRating } {
  const q = strategy.quality;
  if (!q) {
    return {
      quality: {
        triggerQuality: 0,
        locationQuality: 0,
        vwapContext: { rating: 0, alignment: "neutral", reason: "no quality spec" },
        profileLocation: { tag: "unknown", rating: 0, reason: "no quality spec" },
        footprintConfirmation: { available: false, signal: "none", bonus: 0, reason: "no quality spec" },
        triggerReason: "no quality spec",
      },
      triggerRating: 0,
      locationRating: 0,
    };
  }
  const trigger = evaluateTrigger(ctx, strategy, side, entry);
  const vwap = evaluateVwap(ctx, q.vwap.preference, side, entry);
  const profile = evaluateProfileLocation(ctx, q.profile.preferredLocations, q.profile.requiresLocation, entry);
  const footprint = evaluateFootprint(ctx, side, q.footprint.preferredSignals);

  // Aggregate trigger/location ratings. Footprint is NOT folded in here —
  // it sits as its own positive-only bonus in scoreCandidate.
  const triggerQuality = trigger.rating;
  // Location quality = average of profile + vwap (both contribute to "is
  // this a good place to trade?"). VWAP-dominant strategies will see
  // vwap do the heavy lifting; range/reversal will see profile dominate.
  const locationQuality = Math.max(-1, Math.min(1, 0.5 * profile.rating + 0.5 * vwap.rating));

  return {
    quality: {
      triggerQuality,
      locationQuality,
      vwapContext: vwap,
      profileLocation: profile,
      footprintConfirmation: footprint,
      triggerReason: trigger.reason,
    },
    triggerRating: triggerQuality,
    locationRating: locationQuality,
  };
}

export { NEAR_TICK_MULT };
