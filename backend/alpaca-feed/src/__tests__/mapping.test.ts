import { describe, it, expect } from "vitest";
import { SYMBOL_MAPPINGS, scale } from "../mapping.js";

describe("symbol mapping", () => {
  it("covers every futures symbol the frontend ships with", () => {
    const symbols = SYMBOL_MAPPINGS.map(m => m.futures.symbol).sort();
    expect(symbols).toEqual(["M2K", "MCL", "MES", "MGC", "MNQ", "MYM"]);
  });

  it("every mapping has a positive multiplier and an ETF proxy", () => {
    for (const m of SYMBOL_MAPPINGS) {
      expect(m.multiplier).toBeGreaterThan(0);
      expect(m.etf.length).toBeGreaterThan(0);
    }
  });

  it("scale multiplies an ETF price by the configured factor", () => {
    expect(scale(100, 10)).toBe(1000);
    expect(scale(0.5, 0)).toBe(0);
  });
});
