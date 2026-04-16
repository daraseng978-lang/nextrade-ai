import { useWorkstation } from "../state/WorkstationContext";
import { entryStateLabel } from "../engine/propFirm";
import { STRATEGIES } from "../engine/strategies";
import { AgentStatusPanel } from "../panels/AgentStatusPanel";
import { PropFirmEntryPanel } from "../panels/PropFirmEntryPanel";
import { ApprovalQueuePanel } from "../panels/ApprovalQueuePanel";
import { RouteHealthPanel } from "../panels/RouteHealthPanel";
import { AuditTrailPanel } from "../panels/AuditTrailPanel";

// Control Center = supervision. No hero card, no Pine, no chart
// workspace, no large execution composer. Show: system mode, kill
// switch, quorum, approval queue, route health, agents, prop-firm
// readiness, audit trail.
export function ControlCenterPage() {
  const { selected, propFirm, killSwitch, quorumEnabled, journal } = useWorkstation();
  const sym = selected.candidate.instrument.symbol;
  const strategy = STRATEGIES[selected.candidate.strategy].label;

  return (
    <div className="cc-root">
      <div className="cc-top">
        <Stat label="System mode">{killSwitch ? "RESTRICTED" : "OPERATIONAL"}</Stat>
        <Stat label="Kill switch" warn={killSwitch}>{killSwitch ? "ENGAGED" : "OFF"}</Stat>
        <Stat label="Quorum">{quorumEnabled ? "ON" : "OFF"}</Stat>
        <Stat label="Prop-firm state">{entryStateLabel(propFirm.entryState)}</Stat>
        <Stat label="Selected">{sym} · {strategy}</Stat>
        <Stat label="Journal">{journal.length} sent</Stat>
      </div>

      <div className="cc-body">
        <aside className="cc-left">
          <ApprovalQueuePanel />
          <AgentStatusPanel />
        </aside>
        <main className="cc-center">
          <PropFirmEntryPanel />
          <AuditTrailPanel />
        </main>
        <aside className="cc-right">
          <RouteHealthPanel />
        </aside>
      </div>
    </div>
  );
}

function Stat({
  label,
  warn,
  children,
}: {
  label: string;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`cc-stat ${warn ? "warn" : ""}`}>
      <div className="cc-stat-label">{label}</div>
      <div className="cc-stat-value">{children}</div>
    </div>
  );
}
