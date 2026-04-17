import { describe, it, expect } from "vitest";
import { decide } from "../engine/decisionEngine";
import { DEFAULT_ACCOUNT } from "../engine/sizing";
import { mockContexts } from "../engine/mockData";
import { generatePineScript, buildAlertPayload } from "../engine/pineGenerator";
import { buildPreMarketBrief, enrichContextsWithBrief } from "../engine/preMarketChecklist";

describe("pine generator", () => {
  const ctxs = mockContexts();

  it("generates a day-specific script anchored to the selected playbook", () => {
    for (const ctx of ctxs) {
      const sig = decide(ctx, DEFAULT_ACCOUNT);
      if (sig.state === "hard_blocked" || sig.state === "stand_aside") continue;
      const script = generatePineScript(sig);
      expect(script).toContain("@version=5");
      expect(script).toContain(sig.candidate.instrument.symbol);
      expect(script).toContain(sig.candidate.strategy);
      expect(script).toContain(`orHigh = ${sig.context.openingRange.high}`);
      expect(script).toContain(`orLow  = ${sig.context.openingRange.low}`);
      expect(script).toContain(`pdH    = ${sig.context.priorHigh}`);
      expect(script).toContain(`pdL    = ${sig.context.priorLow}`);
    }
  });

  it("alert payload matches normalized signal fields", () => {
    const sig = decide(ctxs[0], DEFAULT_ACCOUNT);
    const payload = JSON.parse(buildAlertPayload(sig));
    expect(payload.ticker).toBe(sig.candidate.instrument.symbol);
    expect(payload.strategy).toBe(sig.candidate.strategy);
    expect(payload.action).toBe(sig.candidate.side === "long" ? "buy" : "sell");
    expect(payload.quantity).toBe(sig.sizing.finalContracts);
    expect(payload.stopLoss.stopPrice).toBe(sig.candidate.stop);
  });

  it("candidate carries a TP1 between entry and TP2", () => {
    const sig = decide(ctxs[0], DEFAULT_ACCOUNT);
    const { entry, tp1, tp2 } = sig.candidate;
    const lo = Math.min(entry, tp2);
    const hi = Math.max(entry, tp2);
    expect(tp1).toBeGreaterThanOrEqual(lo);
    expect(tp1).toBeLessThanOrEqual(hi);
  });

  it("injects Reggie brief block when brief is supplied", () => {
    const brief = buildPreMarketBrief(ctxs, false);
    const enriched = enrichContextsWithBrief(ctxs, brief);
    const sig = decide(enriched[0], DEFAULT_ACCOUNT);
    const script = generatePineScript(sig, brief);
    expect(script).toContain("Reggie pre-market brief");
    expect(script).toContain("Readiness:");
    expect(script).toContain("Overnight bias:");
  });

  it("emits hline() calls for each key level when brief is supplied", () => {
    const brief = buildPreMarketBrief(ctxs, false);
    const enriched = enrichContextsWithBrief(ctxs, brief);
    const sig = decide(enriched[0], DEFAULT_ACCOUNT);
    const script = generatePineScript(sig, brief);
    expect(script).toContain("hline(");
    expect(script).toContain("Key levels (Reggie");
    const hlineCount = (script.match(/hline\(/g) ?? []).length;
    expect(hlineCount).toBe(7);
  });

  it("emits overnight reference levels when brief is supplied", () => {
    const brief = buildPreMarketBrief(ctxs, false);
    const enriched = enrichContextsWithBrief(ctxs, brief);
    const sig = decide(enriched[0], DEFAULT_ACCOUNT);
    const script = generatePineScript(sig, brief);
    expect(script).toContain("onH =");
    expect(script).toContain("onL =");
  });

  it("generates without brief (backward-compatible, no hlines)", () => {
    const sig = decide(ctxs[0], DEFAULT_ACCOUNT);
    const script = generatePineScript(sig);
    expect(script).toContain("@version=5");
    expect(script).not.toContain("hline(");
    expect(script).not.toContain("Reggie");
  });
});
