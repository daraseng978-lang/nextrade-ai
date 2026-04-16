import type {
  AgentSpecialty,
  AgentStatus,
  ExecutionState,
  PropFirmControl,
  SelectedSignal,
} from "./types";
import { STRATEGIES } from "./strategies";

// Agent supervisor: derives a safe operational summary of what each agent
// is currently doing, based on the selected signal + execution workflow
// state. We never expose raw chain-of-thought; we surface a short,
// human-readable operational line per agent.
export interface AgentRegistryEntry {
  name: string;
  title: string;     // short role label for compact chips
  avatar: string;    // emoji avatar for the bot card
  specialty: AgentSpecialty;
}

export const AGENT_REGISTRY: AgentRegistryEntry[] = [
  { name: "Archie",    title: "Architect",             avatar: "🏗️", specialty: "architecture" },
  { name: "Strat",     title: "Strategist",            avatar: "📚", specialty: "strategy_taxonomy" },
  { name: "Reggie",    title: "Researcher",            avatar: "🔬", specialty: "research" },
  { name: "Dex",       title: "Decision Engineer",     avatar: "🧠", specialty: "decision_engine" },
  { name: "Rhea",      title: "Risk Manager",          avatar: "⚖️", specialty: "risk_sizing" },
  { name: "Val",       title: "Validation Analyst",    avatar: "🛡️", specialty: "validation" },
  { name: "Pine",      title: "Pine Engineer",         avatar: "🌲", specialty: "pine_generation" },
  { name: "Exa",       title: "Execution Engineer",    avatar: "📤", specialty: "execution_routing" },
  { name: "Prospr",    title: "Prop-Firm Controller",  avatar: "🔐", specialty: "prop_firm_gating" },
  { name: "Chartie",   title: "Chart Systems",         avatar: "📈", specialty: "chart_display" },
  { name: "Sup",       title: "Agent Supervisor",      avatar: "👁️", specialty: "agent_supervisor" },
  { name: "Ctrl",      title: "Control Center",        avatar: "🎛️", specialty: "control_center" },
  { name: "Jourdan",   title: "Journal Analyst",       avatar: "📓", specialty: "journal" },
  { name: "Qadi",      title: "QA Director",           avatar: "🧪", specialty: "qa" },
];

export interface AgentContextInputs {
  signal: SelectedSignal;
  propFirm: PropFirmControl;
  executionState: ExecutionState;
  killSwitch: boolean;
  quorumEnabled: boolean;
  journalCount: number;
}

export function buildAgentStatuses(input: AgentContextInputs): AgentStatus[] {
  const { signal, propFirm, executionState, killSwitch, quorumEnabled, journalCount } = input;
  const now = new Date().toISOString();
  const sym = signal.candidate.instrument.symbol;
  const strategyLabel = STRATEGIES[signal.candidate.strategy].label;
  const hardBlocked = signal.hardBlock.active;

  const build = (
    entry: AgentRegistryEntry,
    fields: Omit<AgentStatus, "name" | "title" | "avatar" | "specialty" | "lastUpdate">,
  ): AgentStatus => ({
    name: entry.name,
    title: entry.title,
    avatar: entry.avatar,
    specialty: entry.specialty,
    lastUpdate: now,
    ...fields,
  });

  const statuses: AgentStatus[] = AGENT_REGISTRY.map((entry) => {
    switch (entry.specialty) {
      case "architecture":
        return build(entry, {
          state: "completed",
          currentTask: "Module / dependency contracts",
          summary: "Layout stable — no pending architecture changes.",
          needsUserApproval: false,
        });

      case "strategy_taxonomy":
        return build(entry, {
          state: "running",
          currentTask: `Map regime → playbook for ${sym}`,
          summary: `Active regime: ${signal.context.regime}. Candidate family: ${STRATEGIES[signal.candidate.strategy].family}.`,
          confidence: signal.context.regimeConfidence,
          needsUserApproval: false,
        });

      case "research":
        return build(entry, {
          state: "idle",
          currentTask: "Assumption notes + constraints",
          summary: "No new research tasks queued.",
          needsUserApproval: false,
        });

      case "decision_engine":
        return build(entry, {
          state: hardBlocked ? "blocked" : "completed",
          currentTask: hardBlocked ? "Awaiting hard-block clearance" : `Best candidate: ${strategyLabel}`,
          summary: hardBlocked
            ? `Hard block active (${signal.hardBlock.reason}). No candidate selected.`
            : `Selected ${signal.candidate.side.toUpperCase()} ${sym} · raw ${signal.candidate.rawScore.toFixed(2)} · adj ${signal.adjustedScore.toFixed(2)}.`,
          confidence: signal.adjustedScore,
          needsUserApproval: false,
          warning: hardBlocked ? signal.hardBlock.detail : undefined,
        });

      case "risk_sizing":
        return build(entry, {
          state: signal.sizing.finalContracts > 0 ? "completed" : "waiting",
          currentTask: "Apply quality-cap ladder + integer sizing",
          summary: `Final ${signal.sizing.finalContracts} ctx · risk-calc ${signal.sizing.riskContracts} · cap ${signal.sizing.qualityCap}.`,
          confidence: signal.adjustedScore,
          needsUserApproval: false,
        });

      case "validation":
        return build(entry, {
          state: "running",
          currentTask: "Adjust confidence vs. prop-firm factors",
          summary: `Adj ${signal.adjustedScore.toFixed(2)} (raw ${signal.candidate.rawScore.toFixed(2)}). Drawdown ${signal.validation.drawdownRisk.toFixed(2)}, payout ${signal.validation.payoutStability.toFixed(2)}.`,
          confidence: 1 - signal.validation.consistencyPenalty,
          needsUserApproval: false,
        });

      case "pine_generation":
        return build(entry, {
          state: hardBlocked || signal.candidate.side === "flat" ? "waiting" : "completed",
          currentTask: `Generate day-specific Pine for ${strategyLabel}`,
          summary: hardBlocked
            ? "Holding until a tradable candidate is selected."
            : `Pine anchored to ${sym} · OR levels + prior H/L + VWAP.`,
          needsUserApproval: false,
        });

      case "execution_routing":
        return build(entry, {
          state:
            executionState === "sent" ? "completed" :
            executionState === "approved" || executionState === "reduced_approved" ? "waiting" :
            "idle",
          currentTask: "Format Telegram / KEY=VALUE / JSON payloads",
          summary: `Execution state: ${executionState.replace("_", " ")}.`,
          needsUserApproval: executionState === "approved" || executionState === "reduced_approved",
        });

      case "prop_firm_gating":
        return build(entry, {
          state:
            propFirm.entryState === "blocked" ? "blocked" :
            propFirm.entryState === "watch_only" ? "waiting" :
            propFirm.entryState === "sent" ? "completed" :
            propFirm.routeReady ? "waiting" : "running",
          currentTask: "Gate entry against prop-firm compliance",
          summary:
            propFirm.entryState === "blocked"
              ? `Entry blocked: ${propFirm.blockReason ?? "compliance failure"}.`
              : `Entry state: ${propFirm.entryState.replace("_", " ")} · ${propFirm.finalContracts} ctx.`,
          needsUserApproval: propFirm.routeReady && executionState === "draft",
          warning: propFirm.compliance.blockers[0] ?? propFirm.compliance.cautions[0],
        });

      case "chart_display":
        return build(entry, {
          state: "running",
          currentTask: `Sync multi-timeframe chart for ${sym}`,
          summary: `Overlay: entry ${signal.candidate.entry.toFixed(2)} · stop ${signal.candidate.stop.toFixed(2)} · TP1 ${signal.candidate.tp1.toFixed(2)} · TP2 ${signal.candidate.tp2.toFixed(2)}.`,
          needsUserApproval: false,
        });

      case "agent_supervisor":
        return build(entry, {
          state: "running",
          currentTask: "Aggregate agent states",
          summary: `${AGENT_REGISTRY.length} agents monitored. Quorum ${quorumEnabled ? "on" : "off"}.`,
          needsUserApproval: false,
        });

      case "control_center":
        return build(entry, {
          state: killSwitch ? "escalated" : "running",
          currentTask: "Operational visibility + kill switch state",
          summary: killSwitch
            ? "Kill switch ENGAGED — routing disabled system-wide."
            : `All integrations nominal. Selected ${sym}.`,
          needsUserApproval: false,
          warning: killSwitch ? "Kill switch engaged" : undefined,
        });

      case "journal":
        return build(entry, {
          state: journalCount > 0 ? "completed" : "idle",
          currentTask: "Log sent executions + tie to playbook",
          summary: `${journalCount} execution${journalCount === 1 ? "" : "s"} logged.`,
          needsUserApproval: false,
        });

      case "qa":
        return build(entry, {
          state: "completed",
          currentTask: "Vitest matrix + typecheck",
          summary: "Matrix last seen green — regression guard clean.",
          needsUserApproval: false,
        });
    }
  });

  return statuses;
}

// Group agents by operational section as called out in the test plan.
export function groupAgents(statuses: AgentStatus[]): {
  title: string;
  agents: AgentStatus[];
}[] {
  const group = (title: string, specialties: AgentSpecialty[]) => ({
    title,
    agents: statuses.filter((s) => specialties.includes(s.specialty)),
  });
  return [
    group("Decision agents", ["decision_engine", "strategy_taxonomy", "research", "architecture"]),
    group("Validation / risk agents", ["risk_sizing", "validation"]),
    group("Pine / strategy agents", ["pine_generation"]),
    group("Execution agents", ["execution_routing", "prop_firm_gating"]),
    group("Control agents", ["control_center", "chart_display", "agent_supervisor"]),
    group("Journal / feedback agents", ["journal", "qa"]),
  ];
}
