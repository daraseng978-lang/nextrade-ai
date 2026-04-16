import type {
  HardBlock,
  InstrumentContext,
  PlaybookCandidate,
  ValidationProfile,
} from "./types";

// Validation adjusts confidence and aggression — it does not silently block.
// Only hard-block states remove a trade.
export function buildValidationProfile(
  ctx: InstrumentContext,
  candidate: PlaybookCandidate,
): ValidationProfile {
  const commentary: string[] = [];

  // Drawdown risk: wider stops relative to ATR and weak liquidity increase risk.
  const atrNorm = candidate.stopDistance / Math.max(ctx.atr, 1e-6);
  const drawdownRisk = clamp(0.2 + (atrNorm - 1) * 0.25 + (1 - ctx.liquidityScore) * 0.2, 0, 1);
  if (drawdownRisk > 0.6) commentary.push("Stop distance elevates drawdown risk.");

  // Payout stability: strong regime confidence + tight R improves stability.
  const payoutStability = clamp(0.4 + ctx.regimeConfidence * 0.45 - (atrNorm - 1) * 0.1, 0, 1);
  if (payoutStability > 0.75) commentary.push("Payout stability profile looks healthy.");

  // Account pressure: heightened by event risk and wide stops.
  const accountPressure = clamp(0.1 + ctx.eventRisk * 0.6 + (atrNorm - 1) * 0.15, 0, 1);
  if (accountPressure > 0.5) commentary.push("Event / volatility pressure is elevated.");

  // Consistency penalty: low regime confidence and weak raw score compound.
  const consistencyPenalty = clamp(
    (1 - ctx.regimeConfidence) * 0.4 + (1 - candidate.rawScore) * 0.3,
    0,
    1,
  );
  if (consistencyPenalty > 0.5) commentary.push("Consistency profile suggests reduced aggression.");

  return {
    drawdownRisk,
    payoutStability,
    accountPressure,
    consistencyPenalty,
    commentary,
  };
}

// Apply validation to the raw score and return an adjusted score.
// Adjustments only move confidence — never force a hard block.
export function applyValidationAdjustments(
  rawScore: number,
  profile: ValidationProfile,
): number {
  const bonus = 0.25 * profile.payoutStability;
  const penalty =
    0.25 * profile.drawdownRisk +
    0.15 * profile.accountPressure +
    0.2 * profile.consistencyPenalty;
  const adjusted = rawScore + bonus - penalty;
  return clamp(adjusted, 0, 1);
}

export function evaluateHardBlock(ctx: InstrumentContext, killSwitch = false): HardBlock {
  if (killSwitch) return { active: true, reason: "kill_switch", detail: "Operator kill switch engaged." };
  if (!Number.isFinite(ctx.price) || !Number.isFinite(ctx.atr) || ctx.atr <= 0) {
    return { active: true, reason: "invalid_data", detail: "Missing or invalid market data." };
  }
  if (ctx.eventRisk >= 0.95) {
    return { active: true, reason: "major_event_lockout", detail: "Inside major event lockout window." };
  }
  if (ctx.atr > ctx.price * 0.08) {
    return { active: true, reason: "extreme_volatility", detail: "ATR extreme vs. price — emergency state." };
  }
  return { active: false };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
