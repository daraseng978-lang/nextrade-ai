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
          {journal.slice(0, 6).map((j) => (
            <li key={j.id + j.timestamp} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{j.symbol} · {j.side}</strong>
                <small>{new Date(j.timestamp).toLocaleTimeString()}</small>
              </div>
              <small>
                {j.strategy} · {j.regime} · {j.contracts} ctx · adj {j.adjustedScore.toFixed(2)}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
