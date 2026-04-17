import { useWorkstation } from "../state/WorkstationContext";

export function JournalPanel() {
  const { journal } = useWorkstation();
  return (
    <section className="panel">
      <h2>Journal · Last sent</h2>
      {journal.length === 0 ? (
        <small>No signals logged yet. Approve and send from the execution panel.</small>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {journal.slice(0, 6).map((j) => {
            const r = j.outcomeR;
            const rColor =
              r === undefined ? "var(--muted)" :
              r > 0 ? "var(--accent)" :
              r < 0 ? "var(--danger)" : "var(--muted)";
            return (
              <li key={j.id + j.timestamp} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{j.symbol} · {j.side}</strong>
                  <small>{new Date(j.timestamp).toLocaleTimeString()}</small>
                </div>
                <small>
                  {j.strategyLabel} · {j.regime} · {j.contracts}ct · adj {j.adjustedScore.toFixed(2)}
                  {r !== undefined && (
                    <> · <span style={{ color: rColor }}>{r >= 0 ? "+" : ""}{r.toFixed(2)}R</span></>
                  )}
                </small>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
