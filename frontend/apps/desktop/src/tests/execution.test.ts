import { describe, it, expect } from "vitest";
import { formatExecution } from "../engine/executionFormatter";
import { decide } from "../engine/decisionEngine";
import { DEFAULT_ACCOUNT } from "../engine/sizing";
import { mockContexts } from "../engine/mockData";

describe("execution outputs", () => {
  const ctxs = mockContexts();
  const sig = decide(ctxs[0], DEFAULT_ACCOUNT);
  const out = formatExecution(sig);

  it("produces all three formats from the same signal", () => {
    expect(out.telegram).toContain(sig.candidate.instrument.symbol);
    expect(out.keyValue).toContain(`SYMBOL=${sig.candidate.instrument.symbol}`);
    const json = JSON.parse(out.json);
    expect(json.ticker).toBe(sig.candidate.instrument.symbol);
    expect(json.strategy).toBe(sig.candidate.strategy);
  });

  it("watch-only signals do not flip to live-ready state", () => {
    const standAside = decide({ ...ctxs[0], atr: 0 }, DEFAULT_ACCOUNT);
    const o2 = formatExecution(standAside);
    expect(o2.state).toBe("watch_only");
    expect(o2.tradersPost.quantity).toBe(0);
  });

  it("KEY=VALUE and JSON formats agree on contracts", () => {
    const kvContracts = Number(out.keyValue.match(/CONTRACTS=(\d+)/)?.[1] ?? "-1");
    const json = JSON.parse(out.json);
    expect(kvContracts).toBe(json.quantity);
  });
});
