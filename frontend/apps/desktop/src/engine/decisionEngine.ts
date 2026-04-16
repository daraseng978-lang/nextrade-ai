import type {
  AccountRiskConfig,
  InstrumentContext,
  PlaybookCandidate,
  SelectedSignal,
  TradeState,
} from "./types";
import { candidatesForRegime, buildCandidate } from "./playbooks";
import { STRATEGIES } from "./strategies";
import {
  applyValidationAdjustments,
  buildValidationProfile,
  evaluateHardBlock,
} from "./validation";
import { sizeTrade } from "./sizing";

// Decision engine: from context → best available trade, runner-ups,
// validation profile, final sizing and trade state.
export function decide(
  ctx: InstrumentContext,
  account: AccountRiskConfig,
  killSwitch = false,
): SelectedSignal {
  const hardBlock = evaluateHardBlock(ctx, killSwitch);
  const now = new Date().toISOString();

  // Build candidates from the regime → strategy map.
  const strategyIds = candidatesForRegime(ctx.regime);
  const built: PlaybookCandidate[] = strategyIds
    .map((id) => buildCandidate(id, ctx))
    .filter((c): c is PlaybookCandidate => c !== null);

  // Sort by raw score descending, then by tighter stop (cheaper probe).
  built.sort((a, b) =>
    b.rawScore - a.rawScore || a.stopDistance - b.stopDistance,
  );

  const best = built[0] ?? null;

  if (!best || hardBlock.active) {
    // Synthesize a stand-aside / blocked signal that still carries context.
    const placeholder: PlaybookCandidate = best ?? {
      strategy: "low_quality_no_trade",
      instrument: ctx.instrument,
      regime: ctx.regime,
      side: "flat",
      entry: ctx.price,
      stop: ctx.price,
      target: ctx.price,
      tp1: ctx.price,
      tp2: ctx.price,
      stopDistance: 0,
      rMultiple: 0,
      rawScore: 0,
      reasons: hardBlock.active
        ? [`Hard block active: ${hardBlock.reason}`]
        : ["No viable candidate for current regime."],
    };
    const validation = buildValidationProfile(ctx, placeholder);
    const adjusted = applyValidationAdjustments(placeholder.rawScore, validation);
    const sizing = sizeTrade(placeholder, 0, account);
    return {
      id: signalId(ctx, placeholder, now),
      timestamp: now,
      candidate: placeholder,
      context: ctx,
      validation,
      adjustedScore: adjusted,
      sizing: { ...sizing, finalContracts: 0 },
      state: hardBlock.active ? "hard_blocked" : "stand_aside",
      hardBlock,
      runnerUps: [],
    };
  }

  const validation = buildValidationProfile(ctx, best);
  const adjustedScore = applyValidationAdjustments(best.rawScore, validation);
  const sizing = sizeTrade(best, adjustedScore, account);
  const state = deriveState(adjustedScore, sizing.finalContracts);

  return {
    id: signalId(ctx, best, now),
    timestamp: now,
    candidate: best,
    context: ctx,
    validation,
    adjustedScore,
    sizing,
    state,
    hardBlock,
    runnerUps: built.slice(1, 4),
  };
}

function deriveState(adjustedScore: number, finalContracts: number): TradeState {
  if (finalContracts === 0) return adjustedScore < 0.35 ? "stand_aside" : "watch_only";
  if (adjustedScore >= 0.58) return "best_available";
  return "reduced_size";
}

function signalId(
  ctx: InstrumentContext,
  candidate: PlaybookCandidate,
  ts: string,
): string {
  return `${ctx.instrument.symbol}-${candidate.strategy}-${ts}`;
}

export { STRATEGIES };
