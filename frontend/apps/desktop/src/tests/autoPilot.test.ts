import { describe, it, expect } from "vitest";
import { decide } from "../engine/decisionEngine";
import { mockContexts } from "../engine/mockData";
import { DEFAULT_ACCOUNT } from "../engine/sizing";
import { buildPropFirmControl } from "../engine/propFirm";
import { buildPreMarketBrief, enrichContextsWithBrief } from "../engine/preMarketChecklist";
import { autoPilotSetupKey, evaluateAutoPilot, AUTOPILOT_MIN_SCORE_DEFAULT } from "../engine/autoPilot";

function buildInputs() {
  const ctxs = enrichContextsWithBrief(mockContexts(), buildPreMarketBrief(mockContexts(), false));
  const signal = decide(ctxs[0], DEFAULT_ACCOUNT);
  const brief = buildPreMarketBrief(ctxs, false);
  const propFirm = buildPropFirmControl(signal, DEFAULT_ACCOUNT, "draft");
  return { signal, brief, propFirm };
}

describe("evaluateAutoPilot", () => {
  it("skips when autopilot is off", () => {
    const { signal, brief, propFirm } = buildInputs();
    const d = evaluateAutoPilot({
      autoPilot: false,
      killSwitch: false,
      signal,
      propFirm,
      executionState: "draft",
      brief,
      autoTradeCount: 0,
      lastProcessedSignalId: null,
    });
    expect(d.action).toBe("skip");
    expect(d.reasonCode).toBe("autopilot_off");
  });

  it("skips when kill switch is engaged", () => {
    const { signal, brief, propFirm } = buildInputs();
    const d = evaluateAutoPilot({
      autoPilot: true,
      killSwitch: true,
      signal,
      propFirm,
      executionState: "draft",
      brief,
      autoTradeCount: 0,
      lastProcessedSignalId: null,
    });
    expect(d.action).toBe("skip");
    expect(d.reasonCode).toBe("kill_switch_on");
  });

  it("skips when execution state is not draft", () => {
    const { signal, brief, propFirm } = buildInputs();
    const d = evaluateAutoPilot({
      autoPilot: true,
      killSwitch: false,
      signal,
      propFirm,
      executionState: "sent",
      brief,
      autoTradeCount: 0,
      lastProcessedSignalId: null,
    });
    expect(d.action).toBe("skip");
    expect(d.reasonCode).toBe("not_draft");
  });

  it("skips when adjusted score is below floor", () => {
    const { signal, brief, propFirm } = buildInputs();
    const d = evaluateAutoPilot({
      autoPilot: true,
      killSwitch: false,
      signal: { ...signal, adjustedScore: 0.3 },
      propFirm,
      executionState: "draft",
      brief,
      autoTradeCount: 0,
      lastProcessedSignalId: null,
      minAdjustedScore: AUTOPILOT_MIN_SCORE_DEFAULT,
    });
    expect(d.action).toBe("skip");
    expect(d.reasonCode).toBe("low_score");
  });

  it("skips when compliance is failing", () => {
    const { signal, brief, propFirm } = buildInputs();
    const d = evaluateAutoPilot({
      autoPilot: true,
      killSwitch: false,
      signal: { ...signal, adjustedScore: 0.8 },
      propFirm: { ...propFirm, compliance: { ...propFirm.compliance, passing: false, blockers: ["daily_loss > limit"] } },
      executionState: "draft",
      brief,
      autoTradeCount: 0,
      lastProcessedSignalId: null,
    });
    expect(d.action).toBe("skip");
    expect(d.reasonCode).toBe("compliance_failing");
  });

  it("skips when readiness is stand aside", () => {
    const { signal, propFirm } = buildInputs();
    const brief = buildPreMarketBrief(mockContexts(), true); // kill switch → stand_aside
    const d = evaluateAutoPilot({
      autoPilot: true,
      killSwitch: false,
      signal: { ...signal, adjustedScore: 0.8 },
      propFirm,
      executionState: "draft",
      brief,
      autoTradeCount: 0,
      lastProcessedSignalId: null,
    });
    expect(d.action).toBe("skip");
    expect(d.reasonCode).toBe("stand_aside_readiness");
  });

  it("skips when the daily trade limit is reached", () => {
    const { signal, brief, propFirm } = buildInputs();
    const d = evaluateAutoPilot({
      autoPilot: true,
      killSwitch: false,
      signal: { ...signal, adjustedScore: 0.8 },
      propFirm,
      executionState: "draft",
      brief,
      autoTradeCount: brief.mentalReadiness.suggestedMaxTrades,
      lastProcessedSignalId: null,
    });
    expect(d.action).toBe("skip");
    expect(d.reasonCode).toBe("daily_limit_reached");
  });

  it("skips when the same setup key was already processed", () => {
    const { signal, brief, propFirm } = buildInputs();
    // Use the stable setup key (symbol+strategy+regime+side) — the auto
    // pilot no longer dedups on signal.id because that embeds a poll
    // timestamp that rotates every 5 seconds.
    const setupKey = autoPilotSetupKey(signal);
    const d = evaluateAutoPilot({
      autoPilot: true,
      killSwitch: false,
      signal: { ...signal, adjustedScore: 0.8 },
      propFirm,
      executionState: "draft",
      brief,
      autoTradeCount: 0,
      lastProcessedSignalId: setupKey,
    });
    expect(d.action).toBe("skip");
    expect(d.reasonCode).toBe("already_processed");
  });

  it("skips inside the per-symbol cooldown window", () => {
    const { signal, brief, propFirm } = buildInputs();
    const d = evaluateAutoPilot({
      autoPilot: true,
      killSwitch: false,
      signal: { ...signal, adjustedScore: 0.8 },
      propFirm,
      executionState: "draft",
      brief,
      autoTradeCount: 0,
      lastProcessedSignalId: null, // different setup, but still inside cooldown
      lastProcessedAt: Date.now() - 10 * 60 * 1000, // 10 min ago, cooldown = 30 min
    });
    expect(d.action).toBe("skip");
    expect(d.reasonCode).toBe("symbol_cooldown");
  });

  it("allows the next trade after the cooldown window expires", () => {
    const { signal, brief, propFirm } = buildInputs();
    const d = evaluateAutoPilot({
      autoPilot: true,
      killSwitch: false,
      signal: { ...signal, adjustedScore: 0.8 },
      propFirm,
      executionState: "draft",
      brief,
      autoTradeCount: 0,
      lastProcessedSignalId: null,
      lastProcessedAt: Date.now() - 40 * 60 * 1000, // 40 min ago, past 30 min cooldown
    });
    expect(d.action).toBe("approve_and_send");
  });

  it("approves and sends when every guardrail passes", () => {
    const { signal, brief, propFirm } = buildInputs();
    const d = evaluateAutoPilot({
      autoPilot: true,
      killSwitch: false,
      signal: {
        ...signal,
        adjustedScore: 0.8,
        sizing: { ...signal.sizing, finalContracts: 1 },
        hardBlock: { active: false },
      },
      propFirm: { ...propFirm, compliance: { ...propFirm.compliance, passing: true, blockers: [] } },
      executionState: "draft",
      brief,
      autoTradeCount: 0,
      lastProcessedSignalId: null,
    });
    expect(d.action).toBe("approve_and_send");
    expect(d.reasonCode).toBe("ok");
  });

  it("respects an overridden minAdjustedScore floor", () => {
    const { signal, brief, propFirm } = buildInputs();
    const d = evaluateAutoPilot({
      autoPilot: true,
      killSwitch: false,
      signal: {
        ...signal,
        adjustedScore: 0.55,
        sizing: { ...signal.sizing, finalContracts: 1 },
        hardBlock: { active: false },
      },
      propFirm: { ...propFirm, compliance: { ...propFirm.compliance, passing: true, blockers: [] } },
      executionState: "draft",
      brief,
      autoTradeCount: 0,
      lastProcessedSignalId: null,
      minAdjustedScore: 0.5,
    });
    expect(d.action).toBe("approve_and_send");
  });
});
