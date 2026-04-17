import { describe, it, expect } from "vitest";
import {
  buildDefaultParams,
  mulberry32,
  simulateCapitalLab,
} from "../engine/capitalLab";

describe("capital lab monte carlo", () => {
  it("is deterministic for a fixed seed", () => {
    const params = buildDefaultParams(50_000, 0.005, 0.02, 0.3);
    const a = simulateCapitalLab({ ...params, paths: 200, seed: 42 });
    const b = simulateCapitalLab({ ...params, paths: 200, seed: 42 });
    expect(a.passRate).toBe(b.passRate);
    expect(a.bustRate).toBe(b.bustRate);
    expect(a.medianDaysToPass).toBe(b.medianDaysToPass);
    expect(a.finalEquityDist.p50).toBe(b.finalEquityDist.p50);
  });

  it("reports negative expectancy when edge is negative", () => {
    const params = buildDefaultParams(50_000, 0.005, 0.02, 0.3);
    const result = simulateCapitalLab({
      ...params,
      winRate: 0.3,
      avgWinR: 1,
      avgLossR: 1,
      paths: 300,
    });
    expect(result.expectancyR).toBeLessThan(0);
    expect(result.passRate).toBeLessThan(0.3);
  });

  it("achieves a high pass rate when edge is strongly positive", () => {
    const params = buildDefaultParams(50_000, 0.005, 0.02, 0.3);
    const result = simulateCapitalLab({
      ...params,
      winRate: 0.65,
      avgWinR: 2.2,
      avgLossR: 1,
      paths: 500,
      maxEvalDays: 60,
    });
    expect(result.expectancyR).toBeGreaterThan(0.5);
    expect(result.passRate).toBeGreaterThan(0.6);
  });

  it("path breakdown sums to total paths", () => {
    const params = buildDefaultParams(50_000, 0.005, 0.02, 0.3);
    const result = simulateCapitalLab({ ...params, paths: 400 });
    const { passed, busted, timedOut, totalPaths } = result.pathBreakdown;
    expect(passed + busted + timedOut).toBe(totalPaths);
    expect(totalPaths).toBe(400);
  });

  it("funded payouts are non-negative", () => {
    const params = buildDefaultParams(50_000, 0.005, 0.02, 0.3);
    const result = simulateCapitalLab({ ...params, paths: 300 });
    expect(result.fundedPayout.p10).toBeGreaterThanOrEqual(0);
    expect(result.fundedPayout.p50).toBeGreaterThanOrEqual(0);
    expect(result.fundedPayout.p90).toBeGreaterThanOrEqual(0);
  });
});

describe("mulberry32 prng", () => {
  it("produces values in [0, 1)", () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic per seed", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });
});
