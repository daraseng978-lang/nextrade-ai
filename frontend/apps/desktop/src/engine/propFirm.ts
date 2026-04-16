import type {
  AccountRiskConfig,
  PropFirmCompliance,
  PropFirmControl,
  PropFirmEntryState,
  SelectedSignal,
} from "./types";

// Derive a prop-firm entry state from a signal + account config.
// The state is always explainable: blockers and cautions are surfaced.
export function buildPropFirmControl(
  signal: SelectedSignal,
  account: AccountRiskConfig,
  workflow: "draft" | "approved" | "sent" = "draft",
): PropFirmControl {
  const { candidate, validation, adjustedScore, sizing, hardBlock, state } = signal;
  const compliance = buildCompliance(signal, account);

  let entryState: PropFirmEntryState;
  let blockReason: string | undefined;

  if (hardBlock.active) {
    entryState = "blocked";
    blockReason = hardBlock.detail ?? hardBlock.reason;
  } else if (state === "stand_aside" || sizing.finalContracts === 0) {
    entryState = "watch_only";
  } else if (adjustedScore >= 0.58 && sizing.finalContracts >= sizing.qualityCap) {
    entryState = workflow === "sent" ? "sent" : workflow === "approved" ? "approved" : "draft";
  } else if (sizing.finalContracts > 0) {
    entryState = workflow === "sent" ? "sent" : workflow === "approved" ? "reduced_approved" : "draft";
  } else {
    entryState = "watch_only";
  }

  // Safety: never route if the compliance check fails.
  if (!compliance.passing && entryState !== "blocked" && entryState !== "watch_only") {
    entryState = "blocked";
    blockReason = compliance.blockers[0] ?? "Prop-firm compliance failure.";
  }

  const routeReady = entryState === "approved" || entryState === "reduced_approved";

  return {
    rawScore: candidate.rawScore,
    adjustedScore,
    calculatedContracts: sizing.riskContracts,
    qualityCap: sizing.qualityCap,
    finalContracts: sizing.finalContracts,
    entryState,
    blockReason,
    validationFactors: {
      drawdownRisk: validation.drawdownRisk,
      payoutStability: validation.payoutStability,
      accountPressure: validation.accountPressure,
      consistencyPenalty: validation.consistencyPenalty,
    },
    compliance,
    routeReady,
  };
}

function buildCompliance(
  signal: SelectedSignal,
  account: AccountRiskConfig,
): PropFirmCompliance {
  const v = signal.validation;
  const perTradeRisk = signal.sizing.finalContracts * signal.sizing.perContractRisk;
  const dailyBudget = account.accountEquity * account.maxDailyLossPct;
  const dailyLossPressure = clamp(perTradeRisk / Math.max(dailyBudget, 1), 0, 1);
  const drawdownPressure = clamp(v.drawdownRisk * 0.7 + v.accountPressure * 0.3, 0, 1);
  const consistencyPressure = clamp(v.consistencyPenalty, 0, 1);
  const evaluationCaution = clamp(
    (1 - v.payoutStability) * 0.6 + v.accountPressure * 0.4,
    0,
    1,
  );

  const blockers: string[] = [];
  const cautions: string[] = [];

  if (dailyLossPressure >= 1) {
    blockers.push("Trade risk exceeds daily loss budget.");
  } else if (dailyLossPressure > 0.6) {
    cautions.push("Trade consumes a large share of today's loss budget.");
  }
  if (drawdownPressure > 0.8) blockers.push("Drawdown pressure above tolerance.");
  else if (drawdownPressure > 0.6) cautions.push("Drawdown pressure elevated.");

  if (consistencyPressure > 0.8) cautions.push("Consistency pressure high — keep size reduced.");
  if (evaluationCaution > 0.7) cautions.push("Evaluation-phase caution advised.");

  return {
    dailyLossPressure,
    drawdownPressure,
    consistencyPressure,
    evaluationCaution,
    payoutStability: v.payoutStability,
    passing: blockers.length === 0,
    blockers,
    cautions,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function entryStateLabel(state: PropFirmEntryState): string {
  switch (state) {
    case "draft": return "Draft";
    case "approved": return "Approved";
    case "reduced_approved": return "Reduced-size approved";
    case "blocked": return "Blocked";
    case "watch_only": return "Watch only";
    case "sent": return "Sent to TradersPost";
  }
}
