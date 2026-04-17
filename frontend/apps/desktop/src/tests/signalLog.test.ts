import { describe, it, expect } from "vitest";
import {
  appendSignal,
  buildSignalEntry,
  signalSetupKey,
  summarizeSignalLog,
  MAX_SIGNALS_PER_SYMBOL,
  type SignalLogEntry,
} from "../engine/signalLog";
import {
  emptyStrategyHysteresisState,
  stabilizeStrategy,
  STRATEGY_SCORE_MARGIN,
} from "../engine/strategyHysteresis";
import type { PlaybookCandidate, SelectedSignal } from "../engine/types";

function fakeSignal(symbol: string, strategy: PlaybookCandidate["strategy"], side: "long" | "short", score = 0.6): SelectedSignal {
  const c: PlaybookCandidate = {
    strategy,
    instrument: { symbol, name: symbol, tickSize: 0.25, tickValue: 1.25, pointValue: 5, session: "RTH", category: "equity_future" },
    regime: "strong_trend_up",
    side,
    entry: 7050,
    stop: 7045,
    target: 7060,
    tp1: 7055,
    tp2: 7060,
    stopDistance: 5,
    rMultiple: 2,
    rawScore: score,
    reasons: ["test"],
  };
  return {
    id: `${symbol}-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    candidate: c,
    context: {} as never,
    validation: {} as never,
    adjustedScore: score,
    sizing: { riskContracts: 1, qualityCap: 1, finalContracts: 1, perContractRisk: 25, accountRiskDollars: 25, notes: [] },
    state: "best_available",
    hardBlock: { active: false },
    runnerUps: [],
  };
}

describe("signalLog", () => {
  it("setupKey is stable for same (symbol, strategy, regime, side)", () => {
    const s1 = fakeSignal("MES", "opening_range_breakout", "long");
    const s2 = fakeSignal("MES", "opening_range_breakout", "long");
    expect(signalSetupKey(s1)).toBe(signalSetupKey(s2));
  });

  it("setupKey differs when strategy differs", () => {
    const s1 = fakeSignal("MES", "opening_range_breakout", "long");
    const s2 = fakeSignal("MES", "breakout_continuation", "long");
    expect(signalSetupKey(s1)).not.toBe(signalSetupKey(s2));
  });

  it("appendSignal keeps newest on top and caps per symbol", () => {
    let log: SignalLogEntry[] = [];
    for (let i = 0; i < MAX_SIGNALS_PER_SYMBOL + 50; i++) {
      log = appendSignal(log, buildSignalEntry(fakeSignal("MES", "opening_range_breakout", "long")));
    }
    expect(log.filter(e => e.symbol === "MES").length).toBe(MAX_SIGNALS_PER_SYMBOL);
  });

  it("summary counts per-symbol and per-strategy", () => {
    const log = [
      buildSignalEntry(fakeSignal("MES", "opening_range_breakout", "long")),
      buildSignalEntry(fakeSignal("MES", "breakout_continuation", "long")),
      buildSignalEntry(fakeSignal("MNQ", "opening_range_breakout", "short")),
    ];
    const s = summarizeSignalLog(log);
    expect(s.total).toBe(3);
    expect(s.bySymbol.MES).toBe(2);
    expect(s.bySymbol.MNQ).toBe(1);
    expect(s.byStrategy.opening_range_breakout).toBe(2);
    expect(s.uniqueSetupsToday).toBe(3);
  });
});

describe("strategyHysteresis", () => {
  const mkCandidate = (strategy: PlaybookCandidate["strategy"], score: number): PlaybookCandidate => ({
    strategy,
    instrument: { symbol: "MES", name: "MES", tickSize: 0.25, tickValue: 1.25, pointValue: 5, session: "RTH", category: "equity_future" },
    regime: "strong_trend_up",
    side: "long",
    entry: 7050, stop: 7045, target: 7060, tp1: 7055, tp2: 7060, stopDistance: 5, rMultiple: 2,
    rawScore: score, reasons: [],
  });

  it("accepts first-seen leader immediately", () => {
    const state = emptyStrategyHysteresisState();
    const A = mkCandidate("opening_range_breakout", 0.7);
    const B = mkCandidate("breakout_continuation", 0.6);
    const { best, nextState } = stabilizeStrategy(state, "MES", { candidate: A, runnerUps: [B] });
    expect(best.strategy).toBe("opening_range_breakout");
    expect(nextState.bySymbol.MES.leader.strategy).toBe("opening_range_breakout");
  });

  it("holds the prior leader when challenger doesn't beat by margin", () => {
    let state = emptyStrategyHysteresisState();
    const A = mkCandidate("opening_range_breakout", 0.65);
    const B = mkCandidate("breakout_continuation", 0.60);
    state = stabilizeStrategy(state, "MES", { candidate: A, runnerUps: [B] }).nextState;
    // Next poll — B leads by 0.02 (below 0.05 margin). Should stick with A.
    const A2 = mkCandidate("opening_range_breakout", 0.64);
    const B2 = mkCandidate("breakout_continuation", 0.66);
    const { best } = stabilizeStrategy(state, "MES", { candidate: B2, runnerUps: [A2] });
    expect(best.strategy).toBe("opening_range_breakout");
  });

  it("holds when challenger beats by margin for only 1 poll", () => {
    let state = emptyStrategyHysteresisState();
    const A = mkCandidate("opening_range_breakout", 0.65);
    const B = mkCandidate("breakout_continuation", 0.60);
    state = stabilizeStrategy(state, "MES", { candidate: A, runnerUps: [B] }).nextState;
    // B beats by 0.10 — margin met, but only 1 poll.
    const A2 = mkCandidate("opening_range_breakout", 0.60);
    const B2 = mkCandidate("breakout_continuation", 0.75);
    const { best, nextState } = stabilizeStrategy(state, "MES", { candidate: B2, runnerUps: [A2] });
    expect(best.strategy).toBe("opening_range_breakout"); // still A
    expect(nextState.bySymbol.MES.challenger?.strategy).toBe("breakout_continuation");
    expect(nextState.bySymbol.MES.challengerCount).toBe(1);
  });

  it("promotes challenger after 2 consecutive margin-beating polls", () => {
    let state = emptyStrategyHysteresisState();
    const A = mkCandidate("opening_range_breakout", 0.65);
    const B = mkCandidate("breakout_continuation", 0.60);
    state = stabilizeStrategy(state, "MES", { candidate: A, runnerUps: [B] }).nextState;
    // Poll 2
    const A2 = mkCandidate("opening_range_breakout", 0.60);
    const B2 = mkCandidate("breakout_continuation", 0.75);
    state = stabilizeStrategy(state, "MES", { candidate: B2, runnerUps: [A2] }).nextState;
    // Poll 3 — B still leads by margin → promote
    const A3 = mkCandidate("opening_range_breakout", 0.60);
    const B3 = mkCandidate("breakout_continuation", 0.78);
    const { best } = stabilizeStrategy(state, "MES", { candidate: B3, runnerUps: [A3] });
    expect(best.strategy).toBe("breakout_continuation");
  });

  it("resets state when regime changes", () => {
    let state = emptyStrategyHysteresisState();
    const A = mkCandidate("opening_range_breakout", 0.65);
    const B = mkCandidate("breakout_continuation", 0.60);
    state = stabilizeStrategy(state, "MES", { candidate: A, runnerUps: [B] }).nextState;
    // Regime changed
    const C = { ...mkCandidate("balanced_auction_rotation", 0.55), regime: "balanced_range" as const };
    const { best, nextState } = stabilizeStrategy(state, "MES", { candidate: C, runnerUps: [] });
    expect(best.strategy).toBe("balanced_auction_rotation");
    expect(nextState.bySymbol.MES.leader.regime).toBe("balanced_range");
  });

  it("tracks each symbol independently", () => {
    let state = emptyStrategyHysteresisState();
    const MESa = mkCandidate("opening_range_breakout", 0.7);
    const MESb = mkCandidate("breakout_continuation", 0.6);
    state = stabilizeStrategy(state, "MES", { candidate: MESa, runnerUps: [MESb] }).nextState;
    const MNQa: PlaybookCandidate = { ...mkCandidate("breakout_continuation", 0.7), instrument: { ...MESa.instrument, symbol: "MNQ" } };
    const { best } = stabilizeStrategy(state, "MNQ", { candidate: MNQa, runnerUps: [] });
    expect(best.strategy).toBe("breakout_continuation");
    expect(state.bySymbol.MES.leader.strategy).toBe("opening_range_breakout");
  });

  it("margin constant is 0.05", () => {
    expect(STRATEGY_SCORE_MARGIN).toBe(0.05);
  });
});
