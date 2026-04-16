import { describe, it, expect } from "vitest";
import { decide } from "../engine/decisionEngine";
import { DEFAULT_ACCOUNT } from "../engine/sizing";
import { mockContexts } from "../engine/mockData";
import { REGIMES, REGIME_STRATEGY_MAP } from "../engine/regimes";
import { STRATEGIES } from "../engine/strategies";

describe("taxonomy", () => {
  it("has all 7 regimes", () => {
    expect(REGIMES.map((r) => r.id).sort()).toEqual(
      [
        "balanced_range",
        "event_driven_high_risk",
        "expansion_breakout",
        "low_quality_no_trade",
        "reversal_mean_reversion",
        "strong_trend_down",
        "strong_trend_up",
      ].sort(),
    );
  });

  it("has all 12 strategies", () => {
    expect(Object.keys(STRATEGIES).length).toBe(12);
  });

  it("every regime maps to valid strategies", () => {
    for (const regime of Object.keys(REGIME_STRATEGY_MAP)) {
      const strategies = REGIME_STRATEGY_MAP[regime as keyof typeof REGIME_STRATEGY_MAP];
      for (const s of strategies) expect(STRATEGIES[s]).toBeDefined();
    }
  });
});

describe("decision engine", () => {
  const ctxs = mockContexts();
  const mes = ctxs.find((c) => c.instrument.symbol === "MES")!;
  const mcl = ctxs.find((c) => c.instrument.symbol === "MCL")!;

  it("produces a best available or reduced-size candidate for trending regime", () => {
    const sig = decide(mes, DEFAULT_ACCOUNT);
    expect(sig.state === "best_available" || sig.state === "reduced_size").toBe(true);
    expect(["long", "short"]).toContain(sig.candidate.side);
    expect(sig.candidate.instrument.symbol).toBe("MES");
  });

  it("strong trend up selects a continuation family strategy", () => {
    const sig = decide(mes, DEFAULT_ACCOUNT);
    const family = STRATEGIES[sig.candidate.strategy].family;
    expect(["trend", "breakout"]).toContain(family);
  });

  it("strong trend down produces a short candidate", () => {
    const sig = decide(mcl, DEFAULT_ACCOUNT);
    expect(sig.candidate.side).toBe("short");
  });

  it("kill switch produces a hard-block signal", () => {
    const sig = decide(mes, DEFAULT_ACCOUNT, true);
    expect(sig.state).toBe("hard_blocked");
    expect(sig.sizing.finalContracts).toBe(0);
    expect(sig.hardBlock.active).toBe(true);
  });

  it("provides runner-ups unless hard-blocked or single-strategy regime", () => {
    const sig = decide(mes, DEFAULT_ACCOUNT);
    expect(sig.runnerUps.length).toBeGreaterThan(0);
  });

  it("every mock instrument produces a normalized, typed signal", () => {
    for (const ctx of ctxs) {
      const sig = decide(ctx, DEFAULT_ACCOUNT);
      expect(sig.candidate.instrument).toBeDefined();
      expect(Number.isFinite(sig.adjustedScore)).toBe(true);
      expect(Number.isFinite(sig.sizing.finalContracts)).toBe(true);
    }
  });
});
