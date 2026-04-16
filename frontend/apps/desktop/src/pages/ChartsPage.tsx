import { MarketScannerPanel } from "../panels/MarketScannerPanel";
import { ChartWorkspace } from "../panels/ChartWorkspace";

// Charts = visual market analysis. No execution, no agent board, no
// repeated control center blocks.
export function ChartsPage() {
  return (
    <div className="page-grid charts-grid">
      <aside className="column left"><MarketScannerPanel /></aside>
      <main className="column wide">
        <ChartWorkspace />
      </main>
    </div>
  );
}
