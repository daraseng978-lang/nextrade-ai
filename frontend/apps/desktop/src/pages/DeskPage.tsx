import { MarketScannerPanel } from "../panels/MarketScannerPanel";
import { DecisionPanel } from "../panels/DecisionPanel";
import { ExecutionPanel } from "../panels/ExecutionPanel";
import { CompactValidationPanel } from "../panels/CompactValidationPanel";
import { useWorkstation } from "../state/WorkstationContext";
import { QuorumPanel } from "../panels/QuorumPanel";
import { AgentDock } from "../panels/AgentDock";
import { RecentTradesPanel } from "../panels/RecentTradesPanel";

// Desk = primary trading page. Best trade · why · what to do.
// Agent status shown as a compact bot dock at the bottom; the full
// agent board lives on Control Center.
export function DeskPage() {
  const { quorumEnabled } = useWorkstation();
  return (
    <div className="desk-layout">
      <div className="workbench">
        <aside className="column left"><MarketScannerPanel /></aside>
        <main className="column">
          <DecisionPanel />
          <ExecutionPanel />
          {quorumEnabled && <QuorumPanel />}
        </main>
        <aside className="column right">
          <CompactValidationPanel />
          <RecentTradesPanel />
        </aside>
      </div>
      <AgentDock />
    </div>
  );
}
