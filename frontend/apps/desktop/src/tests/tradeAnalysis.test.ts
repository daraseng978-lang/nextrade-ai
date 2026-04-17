import { describe, it, expect } from "vitest";
import { analyzeTrade } from "../engine/tradeAnalysis";
import type { JournalEntry } from "../engine/journal";

function baseEntry(overrides: Partial<JournalEntry>): JournalEntry {
  return {
    id: "t",
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

describe("analyzeTrade", () => {
  it("maps status to outcome word and signal", () => {
    expect(analyzeTrade(baseEntry({ status: "win",  outcomeR: 2 })).outcomeWord).toBe("WIN");
    expect(analyzeTrade(baseEntry({ status: "win",  outcomeR: 2 })).signal).toBe("positive");
    expect(analyzeTrade(baseEntry({ status: "loss", outcomeR: -1 })).outcomeWord).toBe("LOSS");
    expect(analyzeTrade(baseEntry({ status: "loss", outcomeR: -1 })).signal).toBe("negative");
    expect(analyzeTrade(baseEntry({ status: "open" })).outcomeWord).toBe("OPEN");
  });

  it("prefers manual notes over derived summary when provided", () => {
    const a = analyzeTrade(baseEntry({
      status: "win", outcomeR: 2,
      mindsetAfter: "Let it run per plan; breathed through the pullback.",
    }));
    expect(a.summary).toContain("per plan");
  });

  it("truncates very long manual notes", () => {
    const longNote = "x".repeat(300);
    const a = analyzeTrade(baseEntry({ status: "win", outcomeR: 2, notes: longNote }));
    expect(a.summary.length).toBeLessThanOrEqual(160);
    expect(a.summary.endsWith("…")).toBe(true);
  });

  it("derives a positive summary from followed plan + disciplined emotion", () => {
    const a = analyzeTrade(baseEntry({
      status: "win", outcomeR: 2,
      followedPlan: true, emotions: ["disciplined"],
    }));
    expect(a.summary).toMatch(/stayed in the plan/);
    expect(a.factors).toContain("followed_plan");
    expect(a.factors).toContain("positive_emotions:disciplined");
  });

  it("surfaces deviation as the loss cause when plan was broken", () => {
    const a = analyzeTrade(baseEntry({
      status: "loss", outcomeR: -1.5,
      followedPlan: false,
      deviationNotes: "Moved stop to give it room",
    }));
    expect(a.summary.toLowerCase()).toContain("deviated");
    expect(a.summary).toContain("Moved stop to give it room");
    expect(a.factors).toContain("deviated_from_plan");
  });

  it("flags low conviction on losing trades with low adjusted score", () => {
    const a = analyzeTrade(baseEntry({
      status: "loss", outcomeR: -1, adjustedScore: 0.38,
    }));
    expect(a.factors).toContain("low_conviction_entry");
    expect(a.summary).toMatch(/low-conviction/);
  });

  it("always includes regime and strategy as structured factors", () => {
    const a = analyzeTrade(baseEntry({ status: "win", outcomeR: 2 }));
    expect(a.factors).toContain("regime:strong_trend_up");
    expect(a.factors).toContain("strategy:opening_range_breakout");
  });
});
