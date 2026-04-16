import { describe, it, expect } from "vitest";
import { qualityCap, sizeTrade, DEFAULT_ACCOUNT } from "../engine/sizing";
import { decide } from "../engine/decisionEngine";
import { mockContexts } from "../engine/mockData";
import type { PlaybookCandidate } from "../engine/types";

describe("quality cap ladder", () => {
  it("maps score → cap per locked rules", () => {
    expect(qualityCap(0.8)).toBe(4);
    expect(qualityCap(0.6)).toBe(3);
    expect(qualityCap(0.5)).toBe(2);
    expect(qualityCap(0.4)).toBe(1);
    expect(qualityCap(0.3)).toBe(0);
  });
});

describe("sizing", () => {
  const base: PlaybookCandidate = {
    strategy: "trend_pullback_continuation",
    instrument: {
      symbol: "MES",
      name: "Micro E-mini S&P 500",
      tickSize: 0.25,
      tickValue: 1.25,
      pointValue: 5,
      session: "RTH",
      category: "equity_future",
    },
    regime: "strong_trend_up",
    side: "long",
    entry: 5100,
    stop: 5095,
    target: 5110,
    tp1: 5105,
    tp2: 5110,
    stopDistance: 5,
    rMultiple: 2,
    rawScore: 0.7,
    reasons: [],
  };

  it("never produces fractional contracts", () => {
    const r = sizeTrade(base, 0.7, DEFAULT_ACCOUNT);
    expect(Number.isInteger(r.finalContracts)).toBe(true);
    expect(Number.isInteger(r.riskContracts)).toBe(true);
  });

  it("final = min(risk-calc, quality cap)", () => {
    const r = sizeTrade(base, 0.7, DEFAULT_ACCOUNT);
    expect(r.finalContracts).toBe(Math.min(r.riskContracts, r.qualityCap));
  });

  it("score below 0.35 produces 0 contracts", () => {
    const r = sizeTrade(base, 0.2, DEFAULT_ACCOUNT);
    expect(r.finalContracts).toBe(0);
  });

  it("all live mock signals size with integer contracts only", () => {
    for (const ctx of mockContexts()) {
      const sig = decide(ctx, DEFAULT_ACCOUNT);
      expect(Number.isInteger(sig.sizing.finalContracts)).toBe(true);
      expect(sig.sizing.finalContracts).toBeLessThanOrEqual(sig.sizing.qualityCap);
    }
  });
});
