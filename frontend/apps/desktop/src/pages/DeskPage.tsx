import { MarketScannerPanel } from "../panels/MarketScannerPanel";
import { DecisionPanel } from "../panels/DecisionPanel";
import { ExecutionPanel } from "../panels/ExecutionPanel";
import { CompactValidationPanel } from "../panels/CompactValidationPanel";
import { useWorkstation } from "../state/WorkstationContext";
import { QuorumPanel } from "../panels/QuorumPanel";

// Desk = primary trading page. Best trade · why · what to do.
// No agent board, no chart workspace, no audit trail.
export function DeskPage() {
  const { quorumEnabled } = useWorkstation();
  return (
    <div className="workbench">
      <aside className="column left"><MarketScannerPanel /></aside>
      <main className="column">
        <DecisionPanel />
        <ExecutionPanel />
        {quorumEnabled && <QuorumPanel />}
      </main>
      <aside className="column right">
        <CompactValidationPanel />
      </aside>
    </div>
  );
}
