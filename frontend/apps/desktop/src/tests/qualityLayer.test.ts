import { describe, it, expect } from "vitest";
import { buildCandidate, candidatesForRegime } from "../engine/playbooks";
import { evaluateSetupQuality } from "../engine/quality";
import { pickStructureStop } from "../engine/stops";
import { pickStructuralTargets } from "../engine/targets";
import { STRATEGIES } from "../engine/strategies";
import { mockContexts } from "../engine/mockData";
import type { InstrumentContext } from "../engine/types";

function baseCtx(): InstrumentContext {
  return {
    instrument: {
      symbol: "MES",
      name: "Micro E-mini S&P 500",
      tickSize: 0.25,
      tickValue: 1.25,
      pointValue: 5,
      session: "RTH",
      category: "equity_future",
    },
    price: 7050,
    atr: 6,
    vwap: 7045,
    openingRange: { high: 7055, low: 7040 },
    priorHigh: 7060,
    priorLow: 7035,
    regime: "strong_trend_up",
    regimeConfidence: 0.7,
    liquidityScore: 0.7,
    eventRisk: 0.15,
    spread: 0.5,
  };
}

describe("Quality-layer trade frequency", () => {
  it("still produces at least one candidate per symbol in a normal regime", () => {
    const contexts = mockContexts();
    let produced = 0;
    for (const ctx of contexts) {
      const ids = candidatesForRegime(ctx.regime);
      for (const id of ids) {
        const c = buildCandidate(id, ctx);
        if (c) { produced++; break; }
      }
    }
    // At least 4/6 instruments should produce a candidate. Prior-to-upgrade
    // behavior was "every regime maps to something"; we do NOT regress that.
    expect(produced).toBeGreaterThanOrEqual(4);
  });

  it("still produces candidates when volume profile data is missing", () => {
    const ctx = baseCtx();
    // Strip optional quality data entirely — simulates a provider that
    // doesn't fill poc/vah/val/recentBars/footprint.
    const c = buildCandidate("opening_range_breakout", ctx);
    expect(c).not.toBeNull();
    expect(c!.rawScore).toBeGreaterThan(0);
  });

  it("still produces candidates when footprint is unavailable (reduced mode)", () => {
    const ctx = { ...baseCtx(), footprintAvailable: false };
    const c = buildCandidate("opening_range_breakout", ctx);
    expect(c).not.toBeNull();
    expect(c!.scoreBreakdown?.footprint).toBe(0);
    // Not penalized — zero-contribution, not negative.
  });
});

describe("Quality-layer scoring", () => {
  it("reports trigger/location/footprint rows in the score breakdown", () => {
    const c = buildCandidate("opening_range_breakout", baseCtx());
    expect(c?.scoreBreakdown).toBeDefined();
    expect(c!.scoreBreakdown!).toHaveProperty("trigger");
    expect(c!.scoreBreakdown!).toHaveProperty("location");
    expect(c!.scoreBreakdown!).toHaveProperty("footprint");
  });

  it("weak trigger downgrades the score but does not null out the candidate", () => {
    // bar with NO close beyond OR high, no volume
    const ctx: InstrumentContext = {
      ...baseCtx(),
      recentBars: [{ t: "", o: 7045, h: 7050, l: 7042, c: 7048, v: 100 }],
      avgBarVolume: 500, // last bar 20% of avg = very weak volume
    };
    const c = buildCandidate("opening_range_breakout", ctx);
    expect(c).not.toBeNull();
    // Trigger rating should be negative
    expect(c!.quality!.triggerQuality).toBeLessThan(0);
    // Score still > 0 — soft downgrade, not hard block
    expect(c!.rawScore).toBeGreaterThan(0);
  });

  it("strong trigger boosts the score vs no-trigger baseline", () => {
    const ctxNoBars = baseCtx();
    const ctxStrong: InstrumentContext = {
      ...ctxNoBars,
      recentBars: [
        { t: "", o: 7050, h: 7058, l: 7048, c: 7057, v: 1000 }, // closes beyond OR high = 7055
      ],
      avgBarVolume: 500, // last bar 2x avg = strong volume
    };
    const weak = buildCandidate("opening_range_breakout", ctxNoBars);
    const strong = buildCandidate("opening_range_breakout", ctxStrong);
    expect(strong!.rawScore).toBeGreaterThan(weak!.rawScore);
  });
});

describe("Structure-anchored stops", () => {
  it("uses structure stop when it's wider than the ATR envelope", () => {
    // OR low is far below the entry — structure stop should dominate.
    const ctx: InstrumentContext = { ...baseCtx(), openingRange: { high: 7055, low: 7010 } };
    const d = pickStructureStop(ctx, STRATEGIES.opening_range_breakout, "long", 7055, 0.9);
    expect(d.stopType).toBe("or_invalidation");
    // Stop should be below OR low (7010), not at 7055 - 0.9*6 = 7049.6
    expect(d.stop).toBeLessThan(7050);
  });

  it("falls back to ATR when structure stop is absurdly wide and flags downgrade", () => {
    // OR low extremely far below = structure stop wider than 2×ATR
    const ctx: InstrumentContext = { ...baseCtx(), atr: 1, openingRange: { high: 7055, low: 7000 } };
    const d = pickStructureStop(ctx, STRATEGIES.opening_range_breakout, "long", 7055, 0.9);
    expect(d.downgrade).toBe(true);
    // Fallback stop should be entry - 0.9×ATR = 7055 - 0.9
    expect(d.stop).toBeCloseTo(7054.1, 1);
  });

  it("applies an ATR floor when structure stop is too tight", () => {
    // Entry AT OR high, OR low basically at entry — structure distance ~0
    const ctx: InstrumentContext = {
      ...baseCtx(),
      atr: 10,
      openingRange: { high: 7055, low: 7054.99 }, // 0.01-point invalidation
    };
    const d = pickStructureStop(ctx, STRATEGIES.opening_range_breakout, "long", 7055, 0.9);
    // Floor should push stop to entry - 0.3*ATR = 7055 - 3 = 7052
    expect(d.stop).toBeCloseTo(7052, 1);
    expect(d.reason).toContain("too tight");
  });
});

describe("Structural TP1", () => {
  it("places TP1 at the nearest in-direction structure", () => {
    const ctx: InstrumentContext = {
      ...baseCtx(),
      priorHigh: 7080, // push priorHigh past POC so POC wins
      poc: 7065,
      vah: 7075,
      val: 7020,
    };
    const d = pickStructuralTargets(ctx, STRATEGIES.opening_range_breakout, "long", 7055, 10);
    // Nearest long-side structure = POC at 7065
    expect(d.tp1).toBeCloseTo(7065, 0);
    expect(d.tp1Tag).toBe("poc");
  });

  it("falls back to default half-R TP1 when structures are too close (<0.5R)", () => {
    const ctx: InstrumentContext = {
      ...baseCtx(),
      poc: 7055.1, // inside 0.5R of entry
    };
    const d = pickStructuralTargets(ctx, STRATEGIES.opening_range_breakout, "long", 7055, 10);
    expect(d.tp1Tag).toBe("none");
    // Fallback = entry + 0.5 × defaultR × stopDistance = 7055 + 0.5 × 2.0 × 10 = 7065
    expect(d.tp1).toBeCloseTo(7065, 0);
  });

  it("caps TP2 at next structure in non-trend regimes", () => {
    const ctx: InstrumentContext = {
      ...baseCtx(),
      regime: "balanced_range",
      poc: 7060,
      vah: 7070,
    };
    const d = pickStructuralTargets(ctx, STRATEGIES.balanced_auction_rotation, "long", 7040, 4);
    // defaultR=1.5 × 4 = 6 → defaultTp2 = 7046. Next-after structure POC=7060
    // is past defaultTp2, so tp2 stays at defaultTp2 (or close to it).
    expect(d.tp2).toBeLessThanOrEqual(7070);
  });
});

describe("evaluateSetupQuality direct tests", () => {
  it("returns neutral when quality spec is missing on passive strategy", () => {
    const q = evaluateSetupQuality(
      baseCtx(),
      STRATEGIES.low_quality_no_trade,
      "long",
      7055,
    );
    // low_quality_no_trade has no .quality block
    expect(q.triggerRating).toBe(0);
    expect(q.locationRating).toBe(0);
  });

  it("flags missing profile as neutral for breakout but negative for range", () => {
    const ctx = baseCtx(); // no poc/vah/val
    const breakout = evaluateSetupQuality(ctx, STRATEGIES.opening_range_breakout, "long", 7055);
    const range = evaluateSetupQuality(ctx, STRATEGIES.balanced_range, "long", 7040);
    // Breakout: requiresLocation=false → profile missing is neutral (0)
    expect(breakout.quality.profileLocation.rating).toBeCloseTo(0, 1);
    // Range: requiresLocation=true → profile missing is negative
    expect(range.quality.profileLocation.rating).toBeLessThan(0);
  });

  it("footprint bonus is zero (not negative) when footprint is unavailable", () => {
    const q = evaluateSetupQuality(baseCtx(), STRATEGIES.opening_range_breakout, "long", 7055);
    expect(q.quality.footprintConfirmation.available).toBe(false);
    expect(q.quality.footprintConfirmation.bonus).toBe(0);
  });
});

describe("Candidate shape preservation (no regression)", () => {
  it("candidate still has the core fields the sizing engine needs", () => {
    const c = buildCandidate("opening_range_breakout", baseCtx());
    expect(c).not.toBeNull();
    expect(c!.entry).toBeGreaterThan(0);
    expect(c!.stop).toBeGreaterThan(0);
    expect(c!.tp1).toBeGreaterThan(0);
    expect(c!.tp2).toBeGreaterThan(0);
    expect(c!.stopDistance).toBeGreaterThan(0);
    expect(c!.rMultiple).toBeGreaterThan(0);
    expect(c!.rawScore).toBeGreaterThan(0);
  });

  it("quality fields are attached to every non-passive candidate", () => {
    const c = buildCandidate("opening_range_breakout", baseCtx());
    expect(c!.quality).toBeDefined();
    expect(c!.structureStopType).toBeDefined();
    expect(c!.tp1StructureTag).toBeDefined();
    expect(c!.abortConditions).toBeDefined();
    expect(c!.abortConditions!.length).toBeGreaterThan(0);
  });
});
