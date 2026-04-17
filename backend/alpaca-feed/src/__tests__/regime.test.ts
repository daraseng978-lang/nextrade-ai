import { describe, it, expect } from "vitest";
import { classifyRegime } from "../regime.js";
import type { AlpacaBar } from "../types.js";

function bar(c: number, h: number, l: number, v = 1000): AlpacaBar {
  return { t: "2026-04-17T13:30:00Z", o: c, h, l, c, v };
}

describe("classifyRegime", () => {
  it("returns low_quality_no_trade when there aren't enough bars", () => {
    const r = classifyRegime([], [], 0);
    expect(r.regime).toBe("low_quality_no_trade");
  });

  it("detects a strong uptrend on a clean march up", () => {
    const bars = [
      bar(100, 101, 99), bar(101, 102, 100), bar(102, 103, 101),
      bar(103, 104, 102), bar(104, 107, 103), bar(107, 108, 106),
      bar(108, 109, 107), bar(109, 110, 108),
    ];
    const atr = 1.5;
    const r = classifyRegime(bars, [bar(100, 101, 99, 10000)], atr);
    expect(r.regime).toBe("strong_trend_up");
    expect(r.confidence).toBeGreaterThan(0.6);
  });

  it("detects a strong downtrend on a clean march down", () => {
    const bars = [
      bar(110, 111.5, 107.5), bar(108, 109, 106), bar(105, 106, 104),
      bar(102, 103, 100), bar(100, 100.5, 98), bar(98, 98.5, 96),
      bar(96, 97, 94), bar(94, 95, 88), // wider bar drives expansion
    ];
    const atr = 1.5;
    const r = classifyRegime(bars, [bar(100, 101, 99, 10000)], atr);
    expect(r.regime).toBe("strong_trend_down");
  });

  it("labels a quiet sideways window as balanced_range or low_quality", () => {
    const bars = [
      bar(100, 100.5, 99.8), bar(100.1, 100.4, 99.9), bar(100, 100.3, 99.9),
      bar(100.05, 100.35, 99.85), bar(100.02, 100.3, 99.9), bar(100.0, 100.28, 99.88),
      bar(100.03, 100.32, 99.9), bar(100.01, 100.29, 99.89),
    ];
    const atr = 0.5;
    const r = classifyRegime(bars, [bar(100, 101, 99, 10000)], atr);
    expect(["balanced_range", "low_quality_no_trade"]).toContain(r.regime);
  });

  it("liquidity score is bounded in [0, 1]", () => {
    const bars = [
      bar(100, 101, 99, 999999),
      bar(101, 102, 100, 999999),
      bar(102, 103, 101, 999999),
      bar(103, 104, 102, 999999),
      bar(104, 105, 103, 999999),
      bar(105, 106, 104, 999999),
    ];
    const r = classifyRegime(bars, [bar(100, 101, 99, 1)], 1);
    expect(r.liquidityScore).toBeLessThanOrEqual(1);
    expect(r.liquidityScore).toBeGreaterThanOrEqual(0);
  });
});
