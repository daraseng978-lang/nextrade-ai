import type {
  InstrumentContext,
  PlaybookCandidate,
  ProfileLocationTag,
  Side,
  StrategyMeta,
} from "./types";

// Places TP1 at the first meaningful structural target in the direction
// of the trade, and TP2 at min(default R target, next structure).
// In strong-trend / expansion regimes TP2 is allowed to extend past
// the next structure (continuation thesis).
//
// Returns the two price levels plus a human-readable tag for TP1 so the
// UI can render "TP1 → POC", "TP1 → VAH", etc.

export interface TargetDecision {
  tp1: number;
  tp2: number;
  tp1Tag: PlaybookCandidate["tp1StructureTag"];
}

export function pickStructuralTargets(
  ctx: InstrumentContext,
  strategy: StrategyMeta,
  side: Side,
  entry: number,
  stopDistance: number,
): TargetDecision {
  const defaultR = strategy.defaultTargetR;
  const defaultTp2 = side === "long" ? entry + defaultR * stopDistance : entry - defaultR * stopDistance;
  const defaultTp1 = entry + (defaultTp2 - entry) * 0.5;

  // Collect candidate structural targets IN THE DIRECTION of the trade.
  const candidates: Array<{ price: number; tag: PlaybookCandidate["tp1StructureTag"] }> = [];
  const push = (v: number | undefined, tag: PlaybookCandidate["tp1StructureTag"]) => {
    if (v == null || !isFinite(v) || v <= 0) return;
    if (side === "long" && v > entry) candidates.push({ price: v, tag });
    if (side === "short" && v < entry) candidates.push({ price: v, tag });
  };

  const firstPref = strategy.quality?.firstStructureTargets ?? [];
  // Push in preferred order so ordering influences selection when distances tie.
  for (const t of firstPref) {
    if (t === "poc") push(ctx.poc, "poc");
    if (t === "vah") push(ctx.vah, "vah");
    if (t === "val") push(ctx.val, "val");
  }
  // Always include VWAP, prior H/L, OR boundaries as fallback targets.
  push(ctx.vwap, "vwap");
  push(ctx.priorHigh, "prior_high");
  push(ctx.priorLow, "prior_low");
  push(ctx.openingRange.high, "or");
  push(ctx.openingRange.low, "or");

  if (candidates.length === 0) {
    return { tp1: defaultTp1, tp2: defaultTp2, tp1Tag: "none" };
  }

  // Nearest-in-direction structure → TP1.
  candidates.sort((a, b) =>
    side === "long" ? a.price - b.price : b.price - a.price,
  );
  const nearest = candidates[0];
  const nextAfter = candidates[1];

  // Respect a minimum R: if nearest structure is inside 0.5R, fall back
  // to defaultTp1 so we don't cap winners prematurely.
  const minR1 = 0.5 * stopDistance;
  const nearestR = Math.abs(nearest.price - entry);
  const tp1 = nearestR >= minR1 ? nearest.price : defaultTp1;
  const tp1Tag: PlaybookCandidate["tp1StructureTag"] = nearestR >= minR1 ? nearest.tag : "none";

  // TP2: prefer the smaller of defaultTp2 and next-after structure UNLESS
  // the regime supports extension (strong_trend_up/down, expansion_breakout).
  const extensionRegime =
    ctx.regime === "strong_trend_up" ||
    ctx.regime === "strong_trend_down" ||
    ctx.regime === "expansion_breakout";

  let tp2 = defaultTp2;
  if (!extensionRegime && nextAfter) {
    const nextAfterR = Math.abs(nextAfter.price - entry);
    // Only use the structural cap if it's still past tp1 AND past 1R.
    if (
      nextAfterR >= Math.abs(tp1 - entry) &&
      nextAfterR >= stopDistance &&
      // compare against defaultR in price space
      (side === "long" ? nextAfter.price < defaultTp2 : nextAfter.price > defaultTp2)
    ) {
      tp2 = nextAfter.price;
    }
  }

  return { tp1, tp2, tp1Tag };
}
