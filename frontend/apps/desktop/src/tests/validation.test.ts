import { describe, it, expect } from "vitest";
import {
  applyValidationAdjustments,
  buildValidationProfile,
  evaluateHardBlock,
} from "../engine/validation";
import { decide } from "../engine/decisionEngine";
import { DEFAULT_ACCOUNT } from "../engine/sizing";
import { mockContexts } from "../engine/mockData";

describe("validation", () => {
  it("adjusted score stays in [0, 1]", () => {
    for (const ctx of mockContexts()) {
      const sig = decide(ctx, DEFAULT_ACCOUNT);
      expect(sig.adjustedScore).toBeGreaterThanOrEqual(0);
      expect(sig.adjustedScore).toBeLessThanOrEqual(1);
    }
  });

  it("validation fields influence the adjusted score", () => {
    const ctx = mockContexts()[0];
    const sig = decide(ctx, DEFAULT_ACCOUNT);
    const profile = buildValidationProfile(ctx, sig.candidate);
    const base = sig.candidate.rawScore;
    const adj = applyValidationAdjustments(base, profile);
    const stress = applyValidationAdjustments(base, {
      ...profile,
      drawdownRisk: 1,
      accountPressure: 1,
      consistencyPenalty: 1,
      payoutStability: 0,
    });
    expect(adj).toBeGreaterThanOrEqual(stress);
  });

  it("hard block never fires for normal mock data", () => {
    for (const ctx of mockContexts()) {
      expect(evaluateHardBlock(ctx, false).active).toBe(false);
    }
  });

  it("invalid data produces a hard block", () => {
    const ctx = { ...mockContexts()[0], atr: 0 };
    expect(evaluateHardBlock(ctx, false).active).toBe(true);
  });
});
