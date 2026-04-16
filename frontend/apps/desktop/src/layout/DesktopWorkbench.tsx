import { MarketScannerPanel } from "../panels/MarketScannerPanel";
import { DecisionPanel } from "../panels/DecisionPanel";
import { ValidationPanel } from "../panels/ValidationPanel";
import { PineStudioPanel } from "../panels/PineStudioPanel";
import { ExecutionPanel } from "../panels/ExecutionPanel";
import { QuorumPanel } from "../panels/QuorumPanel";
import { ControlCenterPanel } from "../panels/ControlCenterPanel";
import { JournalPanel } from "../panels/JournalPanel";
import { useWorkstation } from "../state/WorkstationContext";

// Three-column workstation: left scanner, center decision + execution,
// right strategy/tools (validation, Pine, control center, journal).
export function DesktopWorkbench() {
  const { quorumEnabled } = useWorkstation();
  return (
    <div className="workbench">
      <aside className="column left">
        <MarketScannerPanel />
      </aside>
      <main className="column">
        <DecisionPanel />
        <ExecutionPanel />
        {quorumEnabled && <QuorumPanel />}
      </main>
      <aside className="column right">
        <ValidationPanel />
        <PineStudioPanel />
        <ControlCenterPanel />
        <JournalPanel />
      </aside>
    </div>
  );
}
