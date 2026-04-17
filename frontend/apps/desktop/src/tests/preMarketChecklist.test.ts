import { describe, it, expect } from "vitest";
import { buildPreMarketBrief, enrichContextsWithBrief } from "../engine/preMarketChecklist";
import { mockContexts } from "../engine/mockData";

const contexts = mockContexts();

describe("buildPreMarketBrief", () => {
  it("returns a brief with all required sections", () => {
    const brief = buildPreMarketBrief(contexts, false);
    expect(brief.technicalLevels).toHaveLength(contexts.length);
    expect(brief.overnightSummary).toHaveLength(contexts.length);
    expect(brief.economicCalendar.length).toBeGreaterThan(0);
    expect(brief.sectorRotation).toBeDefined();
    expect(brief.mentalReadiness).toBeDefined();
    expect(brief.handoffAgent).toBe("strat");
  });

  it("sets sessionReadiness to stand_aside when kill switch is on", () => {
    const brief = buildPreMarketBrief(contexts, true);
    expect(brief.mentalReadiness.sessionReadiness).toBe("stand_aside");
    expect(brief.mentalReadiness.suggestedMaxTrades).toBe(0);
  });

  it("always includes a valid ISO date", () => {
    const brief = buildPreMarketBrief(contexts, false);
    expect(brief.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(brief.enrichedAt).toString()).not.toBe("Invalid Date");
  });

  it("technical levels include 7 key levels per instrument", () => {
    const brief = buildPreMarketBrief(contexts, false);
    for (const tl of brief.technicalLevels) {
      expect(tl.keyLevels).toHaveLength(7);
      for (const level of tl.keyLevels) {
        expect(typeof level.price).toBe("number");
        expect(["support", "resistance", "pivot"]).toContain(level.type);
      }
    }
  });

  it("overnight summary sessionBias is a valid value", () => {
    const brief = buildPreMarketBrief(contexts, false);
    for (const o of brief.overnightSummary) {
      expect(["bullish", "bearish", "neutral"]).toContain(o.sessionBias);
      expect(o.rangeVsAtr).toBeGreaterThan(0);
    }
  });

  it("sector rotation capital flow is a valid value", () => {
    const brief = buildPreMarketBrief(contexts, false);
    expect(["risk_on", "risk_off", "neutral"]).toContain(brief.sectorRotation.capitalFlow);
    expect(brief.sectorRotation.relativeStrength).toHaveLength(contexts.length);
  });

  it("economic calendar events have valid impact levels", () => {
    const brief = buildPreMarketBrief(contexts, false);
    for (const ev of brief.economicCalendar) {
      expect(["high", "medium", "low"]).toContain(ev.impact);
      expect(ev.event.length).toBeGreaterThan(0);
      expect(ev.time.length).toBeGreaterThan(0);
    }
  });
});

describe("enrichContextsWithBrief", () => {
  it("returns the same number of contexts", () => {
    const brief = buildPreMarketBrief(contexts, false);
    const enriched = enrichContextsWithBrief(contexts, brief);
    expect(enriched).toHaveLength(contexts.length);
  });

  it("keeps all values within 0..1 bounds after enrichment", () => {
    const brief = buildPreMarketBrief(contexts, false);
    const enriched = enrichContextsWithBrief(contexts, brief);
    for (const ctx of enriched) {
      expect(ctx.eventRisk).toBeGreaterThanOrEqual(0);
      expect(ctx.eventRisk).toBeLessThanOrEqual(1);
      expect(ctx.regimeConfidence).toBeGreaterThanOrEqual(0);
      expect(ctx.regimeConfidence).toBeLessThanOrEqual(1);
      expect(ctx.liquidityScore).toBeGreaterThanOrEqual(0);
      expect(ctx.liquidityScore).toBeLessThanOrEqual(1);
    }
  });

  it("preserves symbol and instrument identity after enrichment", () => {
    const brief = buildPreMarketBrief(contexts, false);
    const enriched = enrichContextsWithBrief(contexts, brief);
    for (let i = 0; i < contexts.length; i++) {
      expect(enriched[i].instrument.symbol).toBe(contexts[i].instrument.symbol);
      expect(enriched[i].price).toBe(contexts[i].price);
    }
  });

  it("raises eventRisk when high-impact events are present", () => {
    const brief = buildPreMarketBrief(contexts, false);
    const highImpact = brief.economicCalendar.filter(e => e.impact === "high");
    if (highImpact.length > 0) {
      const enriched = enrichContextsWithBrief(contexts, brief);
      for (let i = 0; i < contexts.length; i++) {
        expect(enriched[i].eventRisk).toBeGreaterThanOrEqual(contexts[i].eventRisk);
      }
    }
  });
});
