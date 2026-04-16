import { useWorkstation } from "../state/WorkstationContext";

// Future performance roll-up. For now this summarizes journal activity.
export function PerformancePanel() {
  const { journal } = useWorkstation();
  const byStrategy = new Map<string, number>();
  const byRegime = new Map<string, number>();
  for (const j of journal) {
    byStrategy.set(j.strategy, (byStrategy.get(j.strategy) ?? 0) + 1);
    byRegime.set(j.regime, (byRegime.get(j.regime) ?? 0) + 1);
  }
  return (
    <section className="panel">
      <h2>Performance · Summary</h2>
      <div className="row">
        <div>
          <small>Trades logged</small>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{journal.length}</div>
        </div>
        <div>
          <small>Unique strategies</small>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{byStrategy.size}</div>
        </div>
        <div>
          <small>Unique regimes</small>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{byRegime.size}</div>
        </div>
      </div>
    </section>
  );
}
