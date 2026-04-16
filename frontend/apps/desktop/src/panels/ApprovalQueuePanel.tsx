import { useWorkstation } from "../state/WorkstationContext";
import { entryStateLabel } from "../engine/propFirm";

// Approval queue: surfaces signals waiting on operator action.
// Today only the selected signal can be approved (single-trade workflow);
// this panel exposes that decision plus history of recent sends.
export function ApprovalQueuePanel() {
  const { selected, propFirm, executionState, approve, send, journal } = useWorkstation();

  const c = selected.candidate;
  const canApprove = executionState === "draft" && propFirm.finalContracts > 0 && !selected.hardBlock.active;
  const canSend = executionState === "approved" || executionState === "reduced_approved";

  return (
    <section className="panel">
      <h2>Approval Queue</h2>
      <small>Operator gate · approve before routing.</small>

      <div className="approval-row">
        <div>
          <strong>{c.instrument.symbol} · {c.side.toUpperCase()}</strong>
          <div><small>{c.strategy} · {entryStateLabel(propFirm.entryState)} · {propFirm.finalContracts} ctx</small></div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn" onClick={approve} disabled={!canApprove}>Approve</button>
          <button className="btn primary" onClick={send} disabled={!canSend}>Send</button>
        </div>
      </div>

      <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.1 }}>
        Recent sends ({journal.length})
      </div>
      {journal.length === 0 ? (
        <small>No sends yet.</small>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {journal.slice(0, 5).map((j) => (
            <li key={j.id + j.timestamp} style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
              <small>
                {new Date(j.timestamp).toLocaleTimeString()} · {j.symbol} · {j.side} · {j.contracts} ctx · {j.strategy}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
