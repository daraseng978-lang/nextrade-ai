import type {
  AccountRiskConfig,
  Instrument,
  PlaybookCandidate,
  SizingResult,
} from "./types";

// Quality cap ladder (locked). Score domain is [0..1].
export function qualityCap(score: number): number {
  if (score >= 0.75) return 4;
  if (score >= 0.58) return 3;
  if (score >= 0.45) return 2;
  if (score >= 0.35) return 1;
  return 0;
}

export function perContractRisk(candidate: PlaybookCandidate, instrument: Instrument): number {
  const ticks = candidate.stopDistance / instrument.tickSize;
  return ticks * instrument.tickValue;
}

// Final contracts = min(risk-calculated contracts, quality cap).
// Futures rule: integer contracts only, never fractional.
export function sizeTrade(
  candidate: PlaybookCandidate,
  adjustedScore: number,
  account: AccountRiskConfig,
): SizingResult {
  const perRisk = perContractRisk(candidate, candidate.instrument);
  const accountRiskDollars = account.accountEquity * account.riskPerTradePct;

  const rawRiskContracts = perRisk > 0 ? accountRiskDollars / perRisk : 0;
  const riskContracts = Math.max(0, Math.floor(rawRiskContracts));
  const cap = qualityCap(adjustedScore);

  const finalContracts = Math.max(0, Math.min(riskContracts, cap));

  const notes: string[] = [];
  if (finalContracts === 0 && adjustedScore < 0.35) {
    notes.push("Below 0.35 quality floor — stand aside.");
  } else if (finalContracts < riskContracts) {
    notes.push(`Quality cap (${cap}) below risk budget (${riskContracts}).`);
  } else if (riskContracts < cap) {
    notes.push(`Risk budget (${riskContracts}) binds below quality cap (${cap}).`);
  }
  if (riskContracts >= 1 && cap >= 1 && finalContracts === 1) {
    notes.push("Borderline trade — 1-contract probe.");
  }

  return {
    riskContracts,
    qualityCap: cap,
    finalContracts,
    perContractRisk: perRisk,
    accountRiskDollars,
    notes,
  };
}

export const DEFAULT_ACCOUNT: AccountRiskConfig = {
  accountEquity: 50_000,
  riskPerTradePct: 0.005,
  maxDailyLossPct: 0.02,
  consistencyTargetPct: 0.3,
};
