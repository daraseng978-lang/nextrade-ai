import type { PropFirmControl, SelectedSignal } from "./types";
import type { PreMarketBrief } from "./preMarketChecklist";

// Auto Pilot = the system takes the approve + send steps on the trader's
// behalf, but only when every guardrail passes. This file holds the pure
// decision logic so it can be tested without React state.

export type AutoPilotReasonCode =
  | "ok"
  | "autopilot_off"
  | "kill_switch_on"
  | "hard_block_active"
  | "not_draft"
  | "no_contracts"
  | "low_score"
  | "compliance_failing"
  | "stand_aside_readiness"
  | "daily_limit_reached"
  | "already_processed";

export interface AutoPilotDecision {
  action: "approve_and_send" | "skip";
  reasonCode: AutoPilotReasonCode;
  reason: string;
}

export interface AutoPilotInput {
  autoPilot: boolean;
  killSwitch: boolean;
  signal: SelectedSignal;
  propFirm: PropFirmControl;
  executionState: string;
  brief: PreMarketBrief;
  autoTradeCount: number;
  lastProcessedSignalId: string | null;
  // Signals below this adjusted score are never auto-traded, regardless
  // of quality-cap ladder output. 0.65 = "best available" threshold.
  minAdjustedScore?: number;
}

export const AUTOPILOT_MIN_SCORE_DEFAULT = 0.65;

export function evaluateAutoPilot(input: AutoPilotInput): AutoPilotDecision {
  const min = input.minAdjustedScore ?? AUTOPILOT_MIN_SCORE_DEFAULT;
  const { signal, propFirm, brief } = input;

  if (!input.autoPilot) {
    return skip("autopilot_off", "Auto Pilot is not armed.");
  }
  if (input.killSwitch) {
    return skip("kill_switch_on", "Kill switch is engaged — routing disabled.");
  }
  if (signal.hardBlock.active) {
    return skip("hard_block_active", `Hard block: ${signal.hardBlock.reason ?? "unknown"}.`);
  }
  if (input.executionState !== "draft") {
    return skip("not_draft", `Execution state is "${input.executionState}" — only "draft" auto-executes.`);
  }
  if (signal.sizing.finalContracts <= 0) {
    return skip("no_contracts", "Sizing returned 0 contracts — nothing to route.");
  }
  if (signal.adjustedScore < min) {
    return skip("low_score", `Adjusted score ${signal.adjustedScore.toFixed(2)} < auto-pilot floor ${min.toFixed(2)}.`);
  }
  if (!propFirm.compliance.passing) {
    const blocker = propFirm.compliance.blockers[0] ?? "compliance failing";
    return skip("compliance_failing", `Prop-firm compliance blocker: ${blocker}.`);
  }
  if (brief.mentalReadiness.sessionReadiness === "stand_aside") {
    return skip("stand_aside_readiness", "Reggie flagged STAND ASIDE — no auto-trades today.");
  }
  if (input.autoTradeCount >= brief.mentalReadiness.suggestedMaxTrades) {
    return skip(
      "daily_limit_reached",
      `Daily auto-trade limit reached (${input.autoTradeCount}/${brief.mentalReadiness.suggestedMaxTrades}).`,
    );
  }
  if (input.lastProcessedSignalId === signal.id) {
    return skip("already_processed", "This signal was already auto-processed.");
  }

  return {
    action: "approve_and_send",
    reasonCode: "ok",
    reason: `Guardrails passed · adj ${signal.adjustedScore.toFixed(2)} · ${signal.sizing.finalContracts} ct · readiness ${brief.mentalReadiness.sessionReadiness}.`,
  };
}

function skip(code: AutoPilotReasonCode, reason: string): AutoPilotDecision {
  return { action: "skip", reasonCode: code, reason };
}
