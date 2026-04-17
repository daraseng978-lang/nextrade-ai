import { describe, it, expect } from "vitest";
import {
  buildJournalMetrics,
  computeOutcome,
  type JournalEntry,
} from "../engine/journal";

function baseEntry(overrides: Partial<JournalEntry>): JournalEntry {
  return {
    id: "t1",
    timestamp: new Date().toISOString(),
    symbol: "MES",
    side: "long",
    contracts: 1,
    entryPrice: 7000,
    stopPrice: 6990,
    tp1Price: 7010,
    tp2Price: 7020,
    stopDistance: 10,
    rMultiple: 2,
    perContractRisk: 50,
    accountRiskDollars: 50,
    notionalDollars: 35000,
    strategy: "opening_range_breakout",
    strategyLabel: "Opening Range Breakout",
    regime: "strong_trend_up",
    regimeConfidence: 0.78,
    rawScore: 0.6,
    adjustedScore: 0.62,
    playbookReasons: [],
    state: "sent",
    status: "open",
    ...overrides,
  };
}

describe("buildJournalMetrics", () => {
  it("returns zeroed metrics for an empty journal", () => {
    const m = buildJournalMetrics([]);
    expect(m.totalTrades).toBe(0);
    expect(m.winRate).toBe(0);
    expect(m.profitFactor).toBe(0);
  });

  it("counts open trades separately from closed", () => {
    const entries = [
      baseEntry({ id: "a", status: "open" }),
      baseEntry({ id: "b", status: "win",  outcomeR: 2 }),
      baseEntry({ id: "c", status: "loss", outcomeR: -1 }),
    ];
    const m = buildJournalMetrics(entries);
    expect(m.totalTrades).toBe(3);
    expect(m.openTrades).toBe(1);
    expect(m.closedTrades).toBe(2);
    expect(m.wins).toBe(1);
    expect(m.losses).toBe(1);
  });

  it("computes winRate, expectancy, and profit factor on 3W/2L", () => {
    const entries = [
      baseEntry({ id: "1", status: "win",  outcomeR:  2 }),
      baseEntry({ id: "2", status: "win",  outcomeR:  2 }),
      baseEntry({ id: "3", status: "win",  outcomeR:  1 }),
      baseEntry({ id: "4", status: "loss", outcomeR: -1 }),
      baseEntry({ id: "5", status: "loss", outcomeR: -1 }),
    ];
    const m = buildJournalMetrics(entries);
    expect(m.winRate).toBeCloseTo(3 / 5, 5);
    expect(m.avgWinR).toBeCloseTo(5 / 3, 5);
    expect(m.avgLossR).toBeCloseTo(-1, 5);
    expect(m.expectancyR).toBeCloseTo(3 / 5, 5);
    expect(m.totalR).toBeCloseTo(3, 5);
    expect(m.profitFactor).toBeCloseTo(5 / 2, 5);
  });

  it("profitFactor is Infinity when there are only wins", () => {
    const entries = [
      baseEntry({ id: "1", status: "win", outcomeR: 2 }),
      baseEntry({ id: "2", status: "win", outcomeR: 3 }),
    ];
    const m = buildJournalMetrics(entries);
    expect(m.profitFactor).toBe(Infinity);
  });

  it("tracks largest win and largest loss", () => {
    const entries = [
      baseEntry({ id: "1", status: "win",  outcomeR: 1 }),
      baseEntry({ id: "2", status: "win",  outcomeR: 4 }),
      baseEntry({ id: "3", status: "loss", outcomeR: -0.5 }),
      baseEntry({ id: "4", status: "loss", outcomeR: -2.5 }),
    ];
    const m = buildJournalMetrics(entries);
    expect(m.largestWinR).toBe(4);
    expect(m.largestLossR).toBe(-2.5);
  });

  it("computes max drawdown as worst peak-to-trough swing", () => {
    // Equity path in R: +2, +4, +3, +1, +3. Peak 4, trough 1 → DD = 3
    const entries = [
      baseEntry({ id: "1", status: "win",  outcomeR:  2 }),
      baseEntry({ id: "2", status: "win",  outcomeR:  2 }),
      baseEntry({ id: "3", status: "loss", outcomeR: -1 }),
      baseEntry({ id: "4", status: "loss", outcomeR: -2 }),
      baseEntry({ id: "5", status: "win",  outcomeR:  2 }),
    ];
    const m = buildJournalMetrics(entries);
    expect(m.maxDrawdownR).toBeCloseTo(3, 5);
  });

  it("groups totals by strategy", () => {
    const entries = [
      baseEntry({ id: "1", strategy: "opening_range_breakout",       status: "win",  outcomeR: 2 }),
      baseEntry({ id: "2", strategy: "opening_range_breakout",       status: "loss", outcomeR: -1 }),
      baseEntry({ id: "3", strategy: "vwap_reclaim_mean_reversion",  status: "win",  outcomeR: 3 }),
    ];
    const m = buildJournalMetrics(entries);
    expect(m.byStrategy.opening_range_breakout.count).toBe(2);
    expect(m.byStrategy.opening_range_breakout.totalR).toBeCloseTo(1);
    expect(m.byStrategy.vwap_reclaim_mean_reversion.count).toBe(1);
    expect(m.byStrategy.vwap_reclaim_mean_reversion.totalR).toBe(3);
  });
});

describe("computeOutcome", () => {
  const longEntry = baseEntry({
    id: "L",
    side: "long",
    entryPrice: 7000,
    stopDistance: 10,
    contracts: 2,
  });

  it("long win: exit above entry by 2× stop distance → +2R", () => {
    const { outcomeR, status } = computeOutcome(longEntry, 7020, 5);
    expect(outcomeR).toBeCloseTo(2, 5);
    expect(status).toBe("win");
  });

  it("long loss: exit below entry → negative R", () => {
    const { outcomeR, status } = computeOutcome(longEntry, 6990, 5);
    expect(outcomeR).toBeCloseTo(-1, 5);
    expect(status).toBe("loss");
  });

  it("short trade inverts: exit below entry → positive R", () => {
    const shortEntry = baseEntry({ side: "short", entryPrice: 7000, stopDistance: 10 });
    const { outcomeR, status } = computeOutcome(shortEntry, 6980, 5);
    expect(outcomeR).toBeCloseTo(2, 5);
    expect(status).toBe("win");
  });

  it("tiny move → breakeven", () => {
    const { status } = computeOutcome(longEntry, 7000.1, 5);
    expect(status).toBe("breakeven");
  });

  it("computes P&L in dollars using pointValue and contracts", () => {
    // long, 2 contracts, 20-pt move, pointValue 5 → 20 × 5 × 2 = 200
    const { pnlDollars } = computeOutcome(longEntry, 7020, 5);
    expect(pnlDollars).toBeCloseTo(200, 2);
  });
});
