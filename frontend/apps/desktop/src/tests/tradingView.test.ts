import { describe, it, expect } from "vitest";
import {
  DEFAULT_QUAD_TIMEFRAMES,
  TIMEFRAMES,
  buildChartContext,
  tradingViewEmbedUrl,
  tradingViewSymbol,
} from "../engine/tradingView";
import { INSTRUMENTS } from "../engine/instruments";
import { decide } from "../engine/decisionEngine";
import { DEFAULT_ACCOUNT } from "../engine/sizing";
import { mockContexts } from "../engine/mockData";

describe("trading view symbol map", () => {
  it("maps every instrument to an EXCHANGE:SYMBOL string", () => {
    for (const inst of INSTRUMENTS) {
      const s = tradingViewSymbol(inst);
      expect(s).toMatch(/^[A-Z_]+:[A-Z0-9!]+$/);
    }
  });

  it("timeframes cover 1m..1D", () => {
    const ids = TIMEFRAMES.map((t) => t.id);
    expect(ids).toEqual(["1", "5", "15", "60", "240", "D"]);
  });

  it("default quad contains 4 timeframes", () => {
    expect(DEFAULT_QUAD_TIMEFRAMES.length).toBe(4);
  });
});

describe("chart context", () => {
  it("derives from a selected signal with tp1/tp2 + symbol + timeframes", () => {
    const sig = decide(mockContexts()[0], DEFAULT_ACCOUNT);
    const ctx = buildChartContext(sig);
    expect(ctx.instrument.symbol).toBe(sig.candidate.instrument.symbol);
    expect(ctx.entry).toBe(sig.candidate.entry);
    expect(ctx.stop).toBe(sig.candidate.stop);
    expect(ctx.tp1).toBe(sig.candidate.tp1);
    expect(ctx.tp2).toBe(sig.candidate.tp2);
    expect(ctx.tradingViewSymbol).toContain(":");
    expect(ctx.timeframes.length).toBeGreaterThan(0);
  });
});

describe("embed url", () => {
  it("builds a widgetembed URL containing the symbol and interval", () => {
    const url = tradingViewEmbedUrl("CME_MINI:MES1!", "5", "tv-mes-5");
    expect(url).toContain("widgetembed");
    expect(url).toContain("symbol=CME_MINI%3AMES1%21");
    expect(url).toContain("interval=5");
    expect(url).toContain("theme=dark");
  });
});
