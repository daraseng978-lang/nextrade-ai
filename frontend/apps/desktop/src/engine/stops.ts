import type {
  InstrumentContext,
  Side,
  StrategyMeta,
  StructureStopType,
} from "./types";

// Picks the stop level using "structure first, ATR-bounded second":
//   1. Find the structural stop for this strategy (e.g. OR invalidation).
//   2. Compute the raw ATR-multiple stop (current behavior).
//   3. Return the SAFER (wider) of the two up to a reasonable cap.
//      - If structure stop is unrealistically tight (< 0.3 × ATR), apply
//        a minimum ATR floor so a random wick doesn't stop us out.
//      - If structure stop is absurdly wide (> 2 × ATR), fall back to
//        the ATR stop + mark the candidate as "wide-stop downgrade".
//
// Returns the final stop price plus a label describing what anchored it,
// plus a flag telling the sizer whether to reduce size.

const MIN_STOP_ATR = 0.3; // floor — avoid < 30% ATR stops
const MAX_STOP_ATR = 2.0; // ceiling — anything wider forces ATR fallback

export interface StopDecision {
  stop: number;
  stopType: StructureStopType;
  widened: boolean;        // structure stop was wider than default ATR
  downgrade: boolean;      // structure stop exceeded MAX_STOP_ATR — reduce size
  reason: string;
}

export function pickStructureStop(
  ctx: InstrumentContext,
  strategy: StrategyMeta,
  side: Side,
  entry: number,
  baseAtrMult: number,
): StopDecision {
  const { atr, vwap, openingRange, priorHigh, priorLow, instrument } = ctx;
  const atrStop = side === "long" ? entry - baseAtrMult * atr : entry + baseAtrMult * atr;
  const buffer = Math.max(instrument.tickSize * 2, 0.05 * atr);

  const stopType: StructureStopType = strategy.quality?.stopType ?? "atr_only";
  let structureLevel: number | null = null;

  switch (stopType) {
    case "or_invalidation":
      structureLevel = side === "long" ? openingRange.low - buffer : openingRange.high + buffer;
      break;
    case "retest_fail":
      // Stop beyond the level we're retesting — entry minus the level or
      // the prior swing extreme, whichever is worse.
      structureLevel = side === "long"
        ? Math.min(priorLow, entry - baseAtrMult * atr) - buffer
        : Math.max(priorHigh, entry + baseAtrMult * atr) + buffer;
      break;
    case "sweep_extreme": {
      // Last bar's extreme is where the sweep extended. Add a buffer past it.
      const last = ctx.recentBars?.[ctx.recentBars.length - 1];
      structureLevel = side === "long"
        ? (last ? last.l : priorLow) - buffer
        : (last ? last.h : priorHigh) + buffer;
      break;
    }
    case "range_opposite_edge":
      structureLevel = side === "long" ? priorLow - buffer : priorHigh + buffer;
      break;
    case "swing_structure": {
      // Use the most recent 3-bar swing low/high as the invalidation.
      const tail = (ctx.recentBars ?? []).slice(-3);
      if (tail.length > 0) {
        structureLevel = side === "long"
          ? Math.min(...tail.map(b => b.l)) - buffer
          : Math.max(...tail.map(b => b.h)) + buffer;
      }
      break;
    }
    case "vwap_break":
      if (vwap > 0) structureLevel = side === "long" ? vwap - buffer : vwap + buffer;
      break;
    case "atr_only":
    default:
      break;
  }

  if (structureLevel == null || !isFinite(structureLevel)) {
    return {
      stop: atrStop,
      stopType: "atr_only",
      widened: false,
      downgrade: false,
      reason: "ATR-only stop (no structure available)",
    };
  }

  const structureDistance = Math.abs(entry - structureLevel);
  const atrDistance = Math.abs(entry - atrStop);

  // Floor: structure way tighter than MIN_STOP_ATR → use ATR-floor stop.
  if (structureDistance < MIN_STOP_ATR * atr) {
    return {
      stop: side === "long" ? entry - MIN_STOP_ATR * atr : entry + MIN_STOP_ATR * atr,
      stopType,
      widened: false,
      downgrade: false,
      reason: `structure stop too tight (< ${MIN_STOP_ATR}×ATR) — using ATR floor`,
    };
  }

  // Ceiling: structure way wider than MAX_STOP_ATR → fall back to ATR stop,
  // flag as downgrade so sizing can trim contracts.
  if (structureDistance > MAX_STOP_ATR * atr) {
    return {
      stop: atrStop,
      stopType,
      widened: true,
      downgrade: true,
      reason: `structure stop > ${MAX_STOP_ATR}×ATR — falling back to ATR stop + size downgrade`,
    };
  }

  // Structure inside the envelope: pick the wider of structure/atr (safer).
  const useStructure = structureDistance >= atrDistance;
  return {
    stop: useStructure ? structureLevel : atrStop,
    stopType: useStructure ? stopType : "atr_only",
    widened: useStructure && structureDistance > atrDistance,
    downgrade: false,
    reason: useStructure
      ? `structure stop (${stopType}) wider than ATR — using structure`
      : `ATR stop wider than ${stopType} structure — using ATR`,
  };
}
