import { describe, it, expect } from "vitest";
import { blendedEdgeForStrategy, realizedStrategyEdge } from "../engine/strategyEdge";
import { STRATEGIES } from "../engine/strategies";
import type { JournalEntry } from "../engine/journal";

function closedEntry(strategy: JournalEntry["strategy"], outcomeR: number): JournalEntry {
  return {
    id: `${strategy}-${outcomeR}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    symbol: "MES",
    side: "long",
    contracts: 1,
    entryPrice: 5000,
    stopPrice: 4995,
    tp1Price: 5005,
    tp2Price: 5010,
    stopDistance: 5,
    rMultiple: 2,
    perContractRisk: 25,
    accountRiskDollars: 25,
    notionalDollars: 25000,
    strategy,
    strategyLabel: STRATEGIES[strategy].label,
    regime: "strong_trend_up",
    regimeConfidence: 0.7,
    rawScore: 0.7,
    adjustedScore: 0.7,
    playbookReasons: [],
    state: "approved",
    status: outcomeR > 0 ? "win" : outcomeR < 0 ? "loss" : "breakeven",
    outcomeR,
  };
}

describe("blendedEdgeForStrategy", () => {
  const strat = "opening_range_breakout";
  const preset = STRATEGIES[strat].edge;

  it("returns preset alone when journal is empty", () => {
    const blend = blendedEdgeForStrategy(strat, []);
    expect(blend.realized).toBeNull();
    expect(blend.blended.winRate).toBe(preset.winRate);
    expect(blend.edgeScore).toBeGreaterThan(0);
    expect(blend.edgeScore).toBeLessThanOrEqual(1);
  });

  it("shrinks realized toward preset — preset dominates at small n", () => {
    // 3 wins in a row would naively say 100% WR
    const journal = [closedEntry(strat, 2), closedEntry(strat, 2), closedEntry(strat, 2)];
    const blend = blendedEdgeForStrategy(strat, journal);
    expect(blend.realized?.n).toBe(3);
    // blend weight for realized at n=3 with k=10 is 3/13 ≈ 0.23
    // so blended WR ≈ 0.23 * 1 + 0.77 * 0.44 ≈ 0.57, nowhere near 100%
    expect(blend.blended.winRate).toBeGreaterThan(preset.winRate);
    expect(blend.blended.winRate).toBeLessThan(0.7);
  });

  it("realized data dominates at large n", () => {
    const journal = Array.from({ length: 40 }, (_, i) =>
      closedEntry(strat, i % 2 === 0 ? 2 : -1), // 50% WR, ~+0.5R expectancy
    );
    const blend = blendedEdgeForStrategy(strat, journal);
    expect(blend.realized?.n).toBe(40);
    // n=40 with k=10 gives realized weight 40/50 = 0.8
    expect(blend.blended.winRate).toBeCloseTo(0.8 * 0.5 + 0.2 * preset.winRate, 2);
  });

  it("ignores entries from other strategies", () => {
    const journal = [
      closedEntry("breakout_continuation", 2),
      closedEntry("breakout_continuation", 2),
    ];
    const blend = blendedEdgeForStrategy(strat, journal);
    expect(blend.realized).toBeNull();
  });
});

describe("realizedStrategyEdge", () => {
  it("returns null for strategy with no closed trades", () => {
    expect(realizedStrategyEdge("expansion_breakout", [])).toBeNull();
  });

  it("computes wins / (wins+losses) for WR (ignores breakevens)", () => {
    const journal = [
      closedEntry("expansion_breakout", 2),
      closedEntry("expansion_breakout", -1),
      closedEntry("expansion_breakout", 0),
    ];
    const r = realizedStrategyEdge("expansion_breakout", journal);
    expect(r?.n).toBe(3);
    expect(r?.winRate).toBe(0.5);
  });
});
