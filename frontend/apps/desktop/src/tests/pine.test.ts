import { describe, it, expect } from "vitest";
import { decide } from "../engine/decisionEngine";
import { DEFAULT_ACCOUNT } from "../engine/sizing";
import { mockContexts } from "../engine/mockData";
import { generatePineScript, buildAlertPayload } from "../engine/pineGenerator";

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
});
