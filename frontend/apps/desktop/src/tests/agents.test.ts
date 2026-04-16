import { describe, it, expect } from "vitest";
import { AGENT_REGISTRY, buildAgentStatuses, groupAgents } from "../engine/agents";
import { decide } from "../engine/decisionEngine";
import { DEFAULT_ACCOUNT } from "../engine/sizing";
import { mockContexts } from "../engine/mockData";
import { buildPropFirmControl } from "../engine/propFirm";

const STATES = ["idle", "running", "waiting", "blocked", "completed", "escalated"];

function buildInput(killSwitch = false) {
  const ctx = mockContexts()[0];
  const signal = decide(ctx, DEFAULT_ACCOUNT, killSwitch);
  const propFirm = buildPropFirmControl(signal, DEFAULT_ACCOUNT);
  return {
    signal,
    propFirm,
    executionState: "draft" as const,
    killSwitch,
    quorumEnabled: false,
    journalCount: 0,
  };
}

describe("agent registry", () => {
  it("contains every required specialty", () => {
    const specialties = AGENT_REGISTRY.map((a) => a.specialty);
    const required = [
      "decision_engine",
      "risk_sizing",
      "validation",
      "pine_generation",
      "execution_routing",
      "prop_firm_gating",
      "chart_display",
      "agent_supervisor",
      "control_center",
      "journal",
      "qa",
    ];
    for (const s of required) expect(specialties).toContain(s);
  });

  it("each agent has exactly one specialty", () => {
    const specialties = AGENT_REGISTRY.map((a) => a.specialty);
    expect(new Set(specialties).size).toBe(specialties.length);
  });

  it("each agent has a cute name, a role title, and an avatar emoji", () => {
    for (const a of AGENT_REGISTRY) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.avatar.length).toBeGreaterThan(0);
    }
  });
});

describe("agent statuses", () => {
  it("builds a status for every registered agent", () => {
    const statuses = buildAgentStatuses(buildInput());
    expect(statuses.length).toBe(AGENT_REGISTRY.length);
    for (const s of statuses) {
      expect(STATES).toContain(s.state);
      expect(typeof s.currentTask).toBe("string");
      expect(s.currentTask.length).toBeGreaterThan(0);
      expect(typeof s.summary).toBe("string");
      expect(s.summary.length).toBeGreaterThan(0);
      expect(typeof s.lastUpdate).toBe("string");
    }
  });

  it("decision engineer summary never leaks chain-of-thought", () => {
    const input = buildInput();
    const statuses = buildAgentStatuses(input);
    const de = statuses.find((s) => s.specialty === "decision_engine")!;
    expect(de.summary.toLowerCase()).not.toContain("thinking:");
    expect(de.currentTask.length).toBeGreaterThan(0);
    expect(de.title).toBe("Decision Engineer");
  });

  it("kill switch escalates the control center agent", () => {
    const statuses = buildAgentStatuses(buildInput(true));
    const cc = statuses.find((s) => s.specialty === "control_center")!;
    expect(cc.state).toBe("escalated");
    expect(cc.warning).toBeDefined();
  });

  it("hard block pushes the decision engineer to blocked state", () => {
    const statuses = buildAgentStatuses(buildInput(true));
    const de = statuses.find((s) => s.specialty === "decision_engine")!;
    expect(de.state).toBe("blocked");
  });

  it("agent groups cover every agent exactly once", () => {
    const statuses = buildAgentStatuses(buildInput());
    const groups = groupAgents(statuses);
    const flat = groups.flatMap((g) => g.agents.map((a) => a.name));
    expect(flat.sort()).toEqual(statuses.map((s) => s.name).sort());
  });
});
