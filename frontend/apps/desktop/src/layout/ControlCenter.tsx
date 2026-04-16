import { useWorkstation } from "../state/WorkstationContext";
import { AgentStatusPanel } from "../panels/AgentStatusPanel";
import { ChartWorkspace } from "../panels/ChartWorkspace";
import { PropFirmEntryPanel } from "../panels/PropFirmEntryPanel";
import { ValidationPanel } from "../panels/ValidationPanel";
import { JournalPanel } from "../panels/JournalPanel";
import { MarketScannerPanel } from "../panels/MarketScannerPanel";
import { STRATEGIES } from "../engine/strategies";
import { entryStateLabel } from "../engine/propFirm";

export function ControlCenter() {
  const { selected, propFirm, killSwitch, quorumEnabled, journal } = useWorkstation();
  const sym = selected.candidate.instrument.symbol;
  const strategy = STRATEGIES[selected.candidate.strategy].label;

  return (
    <div className="cc-root">
      {/* Top strip */}
      <div className="cc-top">
        <Stat label="System mode">{killSwitch ? "RESTRICTED" : "OPERATIONAL"}</Stat>
        <Stat label="Kill switch" warn={killSwitch}>{killSwitch ? "ENGAGED" : "OFF"}</Stat>
        <Stat label="Prop-firm state">{entryStateLabel(propFirm.entryState)}</Stat>
        <Stat label="Selected instrument">{sym}</Stat>
        <Stat label="Selected strategy">{strategy}</Stat>
        <Stat label="Quorum">{quorumEnabled ? "ON" : "OFF"}</Stat>
        <Stat label="Journal">{journal.length} sent</Stat>
      </div>

      {/* Main zones */}
      <div className="cc-body">
        <aside className="cc-left">
          <MarketScannerPanel />
          <AgentStatusPanel />
        </aside>
        <main className="cc-center">
          <ChartWorkspace />
          <ValidationPanel />
        </main>
        <aside className="cc-right">
          <PropFirmEntryPanel />
          <JournalPanel />
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
