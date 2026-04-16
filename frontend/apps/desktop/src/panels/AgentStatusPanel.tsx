import { useMemo } from "react";
import { useWorkstation } from "../state/WorkstationContext";
import { buildAgentStatuses, groupAgents } from "../engine/agents";
import type { AgentState, AgentStatus } from "../engine/types";

export function AgentStatusPanel() {
  const {
    selected,
    propFirm,
    executionState,
    killSwitch,
    quorumEnabled,
    journal,
  } = useWorkstation();

  const agents = useMemo(
    () =>
      buildAgentStatuses({
        signal: selected,
        propFirm,
        executionState,
        killSwitch,
        quorumEnabled,
        journalCount: journal.length,
      }),
    [selected, propFirm, executionState, killSwitch, quorumEnabled, journal.length],
  );

  const groups = useMemo(() => groupAgents(agents), [agents]);
  const needsApproval = agents.filter((a) => a.needsUserApproval);
  const warnings = agents.filter((a) => a.warning);

  return (
    <section className="panel agent-panel">
      <h2>AI Agent Status</h2>
      <small>
        Operational summary of each agent · state · last update. Never
        surfaces hidden reasoning verbatim.
      </small>
      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        {needsApproval.length > 0 && (
          <span className="badge reduced">
            Needs approval: {needsApproval.map((a) => a.title).join(", ")}
          </span>
        )}
        {warnings.length > 0 && (
          <span className="badge block">
            Warnings: {warnings.length}
          </span>
        )}
      </div>
      {groups.map((group) => (
        <div key={group.title} style={{ marginTop: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.1 }}>
            {group.title}
          </div>
          {group.agents.map((a) => (
            <AgentRow key={a.name} agent={a} />
          ))}
        </div>
      ))}
    </section>
  );
}

function AgentRow({ agent }: { agent: AgentStatus }) {
  return (
    <div className="agent-row">
      <div className="agent-row-main">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="agent-avatar" aria-hidden>{agent.avatar}</span>
          <div>
            <strong>{agent.name}</strong>
            <span className="agent-specialty"> · {agent.title}</span>
          </div>
        </div>
        <StateChip state={agent.state} />
      </div>
      <div className="agent-task"><small>Task: {agent.currentTask}</small></div>
      <div className="agent-summary"><small>{agent.summary}</small></div>
      <div className="agent-meta">
        <small>
          {agent.confidence !== undefined && <>Confidence {agent.confidence.toFixed(2)} · </>}
          {agent.needsUserApproval ? "Needs approval · " : ""}
          {new Date(agent.lastUpdate).toLocaleTimeString()}
        </small>
        {agent.warning && (
          <small style={{ color: "var(--danger)" }}> ⚠ {agent.warning}</small>
        )}
      </div>
    </div>
  );
}

function StateChip({ state }: { state: AgentState }) {
  const cls =
    state === "running" ? "best" :
    state === "completed" ? "watch" :
    state === "waiting" ? "reduced" :
    state === "blocked" || state === "escalated" ? "block" :
    "stand";
  return <span className={`badge ${cls}`}>{state}</span>;
}
