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
  it("contains all required agents", () => {
    const names = AGENT_REGISTRY.map((a) => a.name);
    expect(names).toContain("Decision Engineer");
    expect(names).toContain("Risk Manager");
    expect(names).toContain("Validation Analyst");
    expect(names).toContain("Pine Engineer");
    expect(names).toContain("Execution Engineer");
    expect(names).toContain("Prop-Firm Execution Controller");
    expect(names).toContain("Chart Systems Engineer");
    expect(names).toContain("Agent State Supervisor");
    expect(names).toContain("Control Center Engineer");
    expect(names).toContain("Journal Analyst");
    expect(names).toContain("QA Director");
  });

  it("each agent has exactly one specialty", () => {
    const specialties = AGENT_REGISTRY.map((a) => a.specialty);
    expect(new Set(specialties).size).toBe(specialties.length);
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

  it("decision engineer summary references the selected strategy", () => {
    const input = buildInput();
    const statuses = buildAgentStatuses(input);
    const de = statuses.find((s) => s.name === "Decision Engineer")!;
    expect(de.summary.toLowerCase()).not.toContain("thinking:"); // no chain-of-thought leak
    expect(de.currentTask.length).toBeGreaterThan(0);
  });

  it("kill switch escalates the control center agent", () => {
    const statuses = buildAgentStatuses(buildInput(true));
    const cc = statuses.find((s) => s.name === "Control Center Engineer")!;
    expect(cc.state).toBe("escalated");
    expect(cc.warning).toBeDefined();
  });

  it("hard block pushes the decision engineer to blocked state", () => {
    const statuses = buildAgentStatuses(buildInput(true));
    const de = statuses.find((s) => s.name === "Decision Engineer")!;
    expect(de.state).toBe("blocked");
  });

  it("agent groups cover every agent exactly once", () => {
    const statuses = buildAgentStatuses(buildInput());
    const groups = groupAgents(statuses);
    const flat = groups.flatMap((g) => g.agents.map((a) => a.name));
    expect(flat.sort()).toEqual(statuses.map((s) => s.name).sort());
  });
});
