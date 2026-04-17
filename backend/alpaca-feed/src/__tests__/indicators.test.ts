import { describe, it, expect } from "vitest";
import { atrFromBars, openingRangeFromBars, priorDayHighLow, spreadFromQuote, vwapFromBars } from "../indicators.js";
import type { AlpacaBar } from "../types.js";

function bar(o: number, h: number, l: number, c: number, v: number = 1000): AlpacaBar {
  return { t: "2026-04-17T13:30:00Z", o, h, l, c, v };
}

describe("indicators", () => {
  it("atrFromBars averages true range across the window", () => {
    const bars = [bar(100, 101, 99, 100), bar(100, 103, 100, 102), bar(102, 104, 101, 103)];
    const atr = atrFromBars(bars, 14);
    expect(atr).toBeGreaterThan(0);
    expect(atr).toBeLessThan(10);
  });

  it("atrFromBars is 0 when fewer than 2 bars are supplied", () => {
    expect(atrFromBars([])).toBe(0);
    expect(atrFromBars([bar(100, 101, 99, 100)])).toBe(0);
  });

  it("vwapFromBars prefers the feed's vw field when present", () => {
    const bars: AlpacaBar[] = [{ ...bar(100, 101, 99, 100), vw: 123.45 }];
    expect(vwapFromBars(bars)).toBe(123.45);
  });

  it("vwapFromBars computes volume-weighted typical price when vw is missing", () => {
    const bars = [bar(100, 101, 99, 100, 1000), bar(100, 102, 100, 101, 2000)];
    const v = vwapFromBars(bars);
    expect(v).toBeGreaterThan(99);
    expect(v).toBeLessThan(102);
  });

  it("openingRangeFromBars returns high/low of the first N bars", () => {
    const bars = [bar(100, 105, 99, 104), bar(104, 106, 103, 105), bar(105, 107, 104, 106), bar(106, 110, 105, 109)];
    const or = openingRangeFromBars(bars, 3);
    expect(or.high).toBe(107);
    expect(or.low).toBe(99);
  });

  it("priorDayHighLow picks the second-to-last daily bar", () => {
    const bars = [bar(100, 105, 95, 102), bar(102, 108, 101, 106), bar(106, 110, 104, 108)];
    const pd = priorDayHighLow(bars);
    expect(pd.high).toBe(108);
    expect(pd.low).toBe(101);
  });

  it("spreadFromQuote returns ask-bid, floored at zero", () => {
    expect(spreadFromQuote(100.02, 100.00)).toBeCloseTo(0.02);
    expect(spreadFromQuote(0, 0)).toBe(0);
  });
});
