import { useWorkstation } from "../state/WorkstationContext";
import { PerformancePanel } from "../panels/PerformancePanel";

export function JournalPage() {
  const { journal } = useWorkstation();
  return (
    <div className="page-grid journal-grid">
      <main className="column wide">
        <PerformancePanel />
        <section className="panel">
          <h2>Journal</h2>
          <small>All recorded sends from this session.</small>
          {journal.length === 0 ? (
            <div style={{ marginTop: 8 }}><small>No trades logged yet.</small></div>
          ) : (
            <table className="kv" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <td className="k">Time</td>
                  <td className="k">Symbol</td>
                  <td className="k">Side</td>
                  <td className="k">Strategy</td>
                  <td className="k">Regime</td>
                  <td className="k">Ctx</td>
                  <td className="k">Adj</td>
                </tr>
              </thead>
              <tbody>
                {journal.map((j) => (
                  <tr key={j.id + j.timestamp}>
                    <td>{new Date(j.timestamp).toLocaleTimeString()}</td>
                    <td>{j.symbol}</td>
                    <td>{j.side}</td>
                    <td>{j.strategy}</td>
                    <td>{j.regime}</td>
                    <td>{j.contracts}</td>
                    <td>{j.adjustedScore.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
