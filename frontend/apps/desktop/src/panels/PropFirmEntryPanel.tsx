import { useWorkstation } from "../state/WorkstationContext";
import { entryStateLabel } from "../engine/propFirm";
import type { PropFirmEntryState } from "../engine/types";

export function PropFirmEntryPanel() {
  const { selected, propFirm, executionState, approve, send } = useWorkstation();

  const canApprove = executionState === "draft" && propFirm.finalContracts > 0 && !selected.hardBlock.active;
  const canSend = executionState === "approved" || executionState === "reduced_approved";

  return (
    <section className="panel prop-panel">
      <h2>Prop-Firm Entry Control</h2>
      <small>
        Gating layer — every entry is explainable. Integer contracts only.
      </small>

      <div className="entry-state">
        <StateBadge state={propFirm.entryState} />
        <div style={{ marginLeft: 10 }}>
          <strong>{entryStateLabel(propFirm.entryState)}</strong>
          {propFirm.blockReason && (
            <div><small style={{ color: "var(--danger)" }}>Block reason: {propFirm.blockReason}</small></div>
          )}
        </div>
      </div>

      <table className="kv" style={{ marginTop: 10 }}>
        <tbody>
          <tr><td className="k">Raw score</td><td>{propFirm.rawScore.toFixed(3)}</td></tr>
          <tr><td className="k">Adjusted score</td><td>{propFirm.adjustedScore.toFixed(3)}</td></tr>
          <tr><td className="k">Risk-calc contracts</td><td>{propFirm.calculatedContracts}</td></tr>
          <tr><td className="k">Quality cap</td><td>{propFirm.qualityCap}</td></tr>
          <tr>
            <td className="k">Final contracts</td>
            <td>
              <strong>{propFirm.finalContracts}</strong>
              {propFirm.finalContracts !== Math.floor(propFirm.finalContracts) && (
                <span style={{ color: "var(--danger)" }}> ⚠ non-integer</span>
              )}
            </td>
          </tr>
          <tr><td className="k">Route ready</td><td>{propFirm.routeReady ? "YES" : "no"}</td></tr>
        </tbody>
      </table>

      <div style={{ marginTop: 12 }}>
        <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.1 }}>
          Compliance
        </div>
        <Meter label="Daily loss pressure" value={propFirm.compliance.dailyLossPressure} tone="warn" />
        <Meter label="Drawdown pressure" value={propFirm.compliance.drawdownPressure} tone="bad" />
        <Meter label="Consistency pressure" value={propFirm.compliance.consistencyPressure} tone="warn" />
        <Meter label="Evaluation caution" value={propFirm.compliance.evaluationCaution} tone="warn" />
        <Meter label="Payout stability" value={propFirm.compliance.payoutStability} tone="good" />
      </div>

      {(propFirm.compliance.blockers.length > 0 || propFirm.compliance.cautions.length > 0) && (
        <div style={{ marginTop: 10 }}>
          {propFirm.compliance.blockers.map((b, i) => (
            <div key={`b-${i}`} style={{ color: "var(--danger)" }}><small>🚫 {b}</small></div>
          ))}
          {propFirm.compliance.cautions.map((c, i) => (
            <div key={`c-${i}`} style={{ color: "var(--warn)" }}><small>⚠ {c}</small></div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={approve} disabled={!canApprove}>
          Approve
        </button>
        <button className="btn primary" onClick={send} disabled={!canSend}>
          Send to TradersPost
        </button>
        <span style={{ marginLeft: "auto" }}>
          <small>Execution: <strong>{executionState.replace("_", " ")}</strong></small>
        </span>
      </div>
    </section>
  );
}

function StateBadge({ state }: { state: PropFirmEntryState }) {
  const cls =
    state === "approved" ? "best" :
    state === "reduced_approved" ? "reduced" :
    state === "sent" ? "watch" :
    state === "blocked" ? "block" :
    state === "watch_only" ? "watch" :
    "stand";
  return <span className={`badge ${cls}`}>{state.replace("_", " ")}</span>;
}

function Meter({ label, value, tone }: { label: string; value: number; tone: "good" | "warn" | "bad" }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div style={{ marginTop: 6 }}>
      <div className="row">
        <small>{label}</small>
        <small>{value.toFixed(2)}</small>
      </div>
      <div className={`bar ${tone}`}><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
