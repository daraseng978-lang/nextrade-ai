import { describe, it, expect } from "vitest";
import { buildPropFirmControl, entryStateLabel } from "../engine/propFirm";
import { decide } from "../engine/decisionEngine";
import { DEFAULT_ACCOUNT } from "../engine/sizing";
import { mockContexts } from "../engine/mockData";

describe("prop-firm control", () => {
  const ctxs = mockContexts();

  it("kill switch produces a blocked entry state", () => {
    const sig = decide(ctxs[0], DEFAULT_ACCOUNT, true);
    const control = buildPropFirmControl(sig, DEFAULT_ACCOUNT);
    expect(control.entryState).toBe("blocked");
    expect(control.blockReason).toBeDefined();
    expect(control.finalContracts).toBe(0);
    expect(control.routeReady).toBe(false);
  });

  it("approved state is only reachable with final > 0 and workflow=approved", () => {
    const sig = decide(ctxs[0], DEFAULT_ACCOUNT);
    const draft = buildPropFirmControl(sig, DEFAULT_ACCOUNT, "draft");
    expect(draft.entryState).toBe("draft");
    const approved = buildPropFirmControl(sig, DEFAULT_ACCOUNT, "approved");
    expect(["approved", "reduced_approved"]).toContain(approved.entryState);
  });

  it("final contracts are always integer", () => {
    for (const ctx of ctxs) {
      const sig = decide(ctx, DEFAULT_ACCOUNT);
      const c = buildPropFirmControl(sig, DEFAULT_ACCOUNT);
      expect(Number.isInteger(c.finalContracts)).toBe(true);
      expect(c.finalContracts).toBeLessThanOrEqual(c.qualityCap);
    }
  });

  it("watch-only signals do not become route-ready", () => {
    const bad = { ...ctxs[0], regime: "low_quality_no_trade" as const };
    const sig = decide(bad, DEFAULT_ACCOUNT);
    const c = buildPropFirmControl(sig, DEFAULT_ACCOUNT, "approved");
    expect(c.routeReady).toBe(false);
    expect(["watch_only", "blocked"]).toContain(c.entryState);
  });

  it("compliance metrics are in [0,1]", () => {
    for (const ctx of ctxs) {
      const sig = decide(ctx, DEFAULT_ACCOUNT);
      const c = buildPropFirmControl(sig, DEFAULT_ACCOUNT);
      for (const k of [
        "dailyLossPressure",
        "drawdownPressure",
        "consistencyPressure",
        "evaluationCaution",
        "payoutStability",
      ] as const) {
        expect(c.compliance[k]).toBeGreaterThanOrEqual(0);
        expect(c.compliance[k]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("entryStateLabel returns a non-empty string for every state", () => {
    const states = [
      "draft",
      "approved",
      "reduced_approved",
      "blocked",
      "watch_only",
      "sent",
    ] as const;
    for (const s of states) {
      const label = entryStateLabel(s);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
