import { useMemo } from "react";
import { useWorkstation } from "../state/WorkstationContext";
import { buildAgentStatuses } from "../engine/agents";
import type { AgentState, AgentStatus } from "../engine/types";

// Compact agent dock intended for the bottom of the Desk page.
// Shows every agent as a tiny bot card: avatar · name · title · state.
// Hover reveals the safe operational summary.
export function AgentDock() {
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

  const warnings = agents.filter((a) => a.warning || a.state === "escalated" || a.state === "blocked").length;
  const pending = agents.filter((a) => a.needsUserApproval).length;

  return (
    <section className="agent-dock">
      <div className="agent-dock-header">
        <strong>AI Agents</strong>
        <small style={{ color: "var(--muted)", marginLeft: 8 }}>
          {agents.length} total
          {pending > 0 && <> · {pending} need approval</>}
          {warnings > 0 && <> · {warnings} warning{warnings === 1 ? "" : "s"}</>}
        </small>
      </div>
      <div className="agent-dock-strip">
        {agents.map((a) => <BotChip key={a.specialty} agent={a} />)}
      </div>
    </section>
  );
}

function BotChip({ agent }: { agent: AgentStatus }) {
  const tone = stateTone(agent.state);
  const tooltip = `${agent.title} · ${agent.state}\n${agent.currentTask}\n${agent.summary}${agent.warning ? `\n⚠ ${agent.warning}` : ""}`;
  return (
    <div className={`bot-chip ${tone}`} title={tooltip}>
      <div className="bot-chip-avatar" aria-hidden>{agent.avatar}</div>
      <div className="bot-chip-body">
        <div className="bot-chip-name">
          <strong>{agent.name}</strong>
          <span className={`bot-chip-dot ${tone}`} />
        </div>
        <div className="bot-chip-title">{agent.title}</div>
      </div>
    </div>
  );
}

function stateTone(state: AgentState): string {
  switch (state) {
    case "running": return "ok";
    case "completed": return "done";
    case "waiting": return "wait";
    case "blocked":
    case "escalated": return "bad";
    case "idle":
    default: return "idle";
  }
}
