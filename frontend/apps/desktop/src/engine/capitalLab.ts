// Capital Lab — prop-firm readiness Monte Carlo.
// Given an edge (win rate, avg win R, avg loss R) and the firm's rules
// (profit target, daily loss, trailing drawdown), simulate many
// independent traders to estimate pass rate, bust rate, and payout
// distribution across the full evaluation + funded lifecycle.

export interface CapitalLabParams {
  accountEquity: number;
  riskPerTradePct: number;
  profitTargetPct: number;
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  winRate: number;
  avgWinR: number;
  avgLossR: number;
  tradesPerDay: number;
  maxEvalDays: number;
  fundedDays: number;
  consistencyTargetPct: number;
  paths: number;
  seed: number;
}

export type PathOutcome = "pass" | "bust" | "timeout";

export interface CapitalLabResult {
  params: CapitalLabParams;
  passRate: number;
  bustRate: number;
  timeoutRate: number;
  medianDaysToPass: number | null;
  p10DaysToPass: number | null;
  p90DaysToPass: number | null;
  medianFinalEquity: number;
  sampleCurves: number[][];
  maxDrawdown: { p10: number; p50: number; p90: number };
  finalEquityDist: { p10: number; p50: number; p90: number };
  fundedPayout: { p10: number; p50: number; p90: number; bustRate: number };
  pathBreakdown: { passed: number; busted: number; timedOut: number; totalPaths: number };
  expectancyR: number;
}

// Small deterministic PRNG so the whole simulation is reproducible,
// which is what makes the unit test meaningful.
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function next(): number {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateCapitalLab(params: CapitalLabParams): CapitalLabResult {
  const rng = mulberry32(params.seed);
  const riskDollars = params.accountEquity * params.riskPerTradePct;
  const target = params.accountEquity * (1 + params.profitTargetPct);
  const dailyLossLimit = params.accountEquity * params.maxDailyLossPct;
  const trailingDDLimit = params.accountEquity * params.maxDrawdownPct;

  let passed = 0;
  let busted = 0;
  let timedOut = 0;
  const daysToPass: number[] = [];
  const finalEquities: number[] = [];
  const maxDrawdowns: number[] = [];
  const sampleCurves: number[][] = [];

  // Funded-phase accumulators.
  const fundedPayouts: number[] = [];
  let fundedBust = 0;

  for (let p = 0; p < params.paths; p++) {
    let equity = params.accountEquity;
    let peak = equity;
    let minEquity = equity;
    let outcome: PathOutcome = "timeout";
    let daysUsed = params.maxEvalDays;
    const curve: number[] = [equity];

    dayLoop: for (let d = 0; d < params.maxEvalDays; d++) {
      const startOfDay = equity;
      for (let t = 0; t < params.tradesPerDay; t++) {
        const win = rng() < params.winRate;
        const delta = win ? params.avgWinR * riskDollars : -params.avgLossR * riskDollars;
        equity += delta;
        peak = Math.max(peak, equity);
        minEquity = Math.min(minEquity, equity);
        curve.push(equity);

        if (equity >= target) {
          outcome = "pass";
          daysUsed = d + 1;
          break dayLoop;
        }
        if (peak - equity >= trailingDDLimit) {
          outcome = "bust";
          break dayLoop;
        }
        if (startOfDay - equity >= dailyLossLimit) {
          outcome = "bust";
          break dayLoop;
        }
      }
    }

    if (outcome === "pass") {
      passed++;
      daysToPass.push(daysUsed);
      const funded = runFundedPhase(
        rng,
        params.accountEquity,
        riskDollars,
        dailyLossLimit,
        trailingDDLimit,
        params.winRate,
        params.avgWinR,
        params.avgLossR,
        params.tradesPerDay,
        params.fundedDays,
        params.consistencyTargetPct,
      );
      if (funded.busted) fundedBust++;
      fundedPayouts.push(funded.payout);
    } else if (outcome === "bust") {
      busted++;
    } else {
      timedOut++;
    }

    finalEquities.push(equity);
    maxDrawdowns.push(peak - minEquity);
    if (sampleCurves.length < 20) sampleCurves.push(curve);
  }

  const expectancyR =
    params.winRate * params.avgWinR - (1 - params.winRate) * params.avgLossR;

  return {
    params,
    passRate: passed / params.paths,
    bustRate: busted / params.paths,
    timeoutRate: timedOut / params.paths,
    medianDaysToPass: percentile(daysToPass, 0.5),
    p10DaysToPass: percentile(daysToPass, 0.1),
    p90DaysToPass: percentile(daysToPass, 0.9),
    medianFinalEquity: percentile(finalEquities, 0.5) ?? params.accountEquity,
    sampleCurves,
    maxDrawdown: {
      p10: percentile(maxDrawdowns, 0.1) ?? 0,
      p50: percentile(maxDrawdowns, 0.5) ?? 0,
      p90: percentile(maxDrawdowns, 0.9) ?? 0,
    },
    finalEquityDist: {
      p10: percentile(finalEquities, 0.1) ?? params.accountEquity,
      p50: percentile(finalEquities, 0.5) ?? params.accountEquity,
      p90: percentile(finalEquities, 0.9) ?? params.accountEquity,
    },
    fundedPayout: {
      p10: percentile(fundedPayouts, 0.1) ?? 0,
      p50: percentile(fundedPayouts, 0.5) ?? 0,
      p90: percentile(fundedPayouts, 0.9) ?? 0,
      bustRate: passed > 0 ? fundedBust / passed : 0,
    },
    pathBreakdown: {
      passed,
      busted,
      timedOut,
      totalPaths: params.paths,
    },
    expectancyR,
  };
}

function runFundedPhase(
  rng: () => number,
  startingEquity: number,
  riskDollars: number,
  dailyLossLimit: number,
  trailingDDLimit: number,
  winRate: number,
  avgWinR: number,
  avgLossR: number,
  tradesPerDay: number,
  fundedDays: number,
  consistencyTargetPct: number,
): { payout: number; busted: boolean } {
  let equity = startingEquity;
  let peak = equity;
  const dailyPnL: number[] = [];
  for (let d = 0; d < fundedDays; d++) {
    const startOfDay = equity;
    for (let t = 0; t < tradesPerDay; t++) {
      const win = rng() < winRate;
      equity += win ? avgWinR * riskDollars : -avgLossR * riskDollars;
      peak = Math.max(peak, equity);
      if (peak - equity >= trailingDDLimit) {
        return { payout: 0, busted: true };
      }
      if (startOfDay - equity >= dailyLossLimit) {
        return { payout: 0, busted: true };
      }
    }
    dailyPnL.push(equity - startOfDay);
  }

  // Payout is the eval profit bonus above the starting balance,
  // trimmed by the consistency rule: a single day can't exceed
  // `consistencyTargetPct` of cumulative gross profit.
  const grossProfit = Math.max(0, equity - startingEquity);
  if (grossProfit === 0) return { payout: 0, busted: false };
  const biggestDay = Math.max(0, ...dailyPnL);
  const cap = grossProfit * consistencyTargetPct;
  const payout = biggestDay > cap ? grossProfit * (cap / Math.max(biggestDay, 1)) : grossProfit;
  return { payout, busted: false };
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[idx];
}

export const DEFAULT_CAPITAL_LAB_PARAMS: Omit<
  CapitalLabParams,
  "accountEquity" | "riskPerTradePct" | "maxDailyLossPct" | "consistencyTargetPct"
> = {
  profitTargetPct: 0.08,
  maxDrawdownPct: 0.05,
  winRate: 0.48,
  avgWinR: 1.8,
  avgLossR: 1.0,
  tradesPerDay: 2,
  maxEvalDays: 30,
  fundedDays: 30,
  paths: 1500,
  seed: 20260417,
};

export function buildDefaultParams(
  accountEquity: number,
  riskPerTradePct: number,
  maxDailyLossPct: number,
  consistencyTargetPct: number,
): CapitalLabParams {
  return {
    accountEquity,
    riskPerTradePct,
    maxDailyLossPct,
    consistencyTargetPct,
    ...DEFAULT_CAPITAL_LAB_PARAMS,
  };
}
