import { useWorkstation } from "../state/WorkstationContext";
import { STRATEGIES } from "../engine/strategies";
import { PineStudioPanel } from "../panels/PineStudioPanel";
import { MarketScannerPanel } from "../panels/MarketScannerPanel";

// Pine Studio = strategy realization page. Selected trade context +
// generated Pine + reference notes for the active playbook.
export function PineStudioPage() {
  const { selected } = useWorkstation();
  const meta = STRATEGIES[selected.candidate.strategy];
  return (
    <div className="page-grid charts-grid">
      <aside className="column left"><MarketScannerPanel /></aside>
      <main className="column wide">
        <section className="panel">
          <h2>Selected Playbook Context</h2>
          <table className="kv">
            <tbody>
              <tr><td className="k">Instrument</td><td>{selected.candidate.instrument.symbol}</td></tr>
              <tr><td className="k">Side</td><td>{selected.candidate.side.toUpperCase()}</td></tr>
              <tr><td className="k">Strategy</td><td>{meta.label} ({meta.family})</td></tr>
              <tr><td className="k">Regime</td><td>{selected.context.regime}</td></tr>
              <tr><td className="k">Entry / Stop / TP1 / TP2</td>
                <td>
                  {selected.candidate.entry.toFixed(2)} ·{" "}
                  {selected.candidate.stop.toFixed(2)} ·{" "}
                  {selected.candidate.tp1.toFixed(2)} ·{" "}
                  {selected.candidate.tp2.toFixed(2)}
                </td>
              </tr>
              <tr><td className="k">Description</td><td>{meta.description}</td></tr>
              <tr><td className="k">Entry trigger</td><td>{meta.entryDescription}</td></tr>
              <tr><td className="k">Invalidation</td><td>{meta.invalidation}</td></tr>
            </tbody>
          </table>
        </section>
        <PineStudioPanel />
      </main>
    </div>
  );
}
