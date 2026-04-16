import { useWorkstation } from "../state/WorkstationContext";

export function ValidationPanel() {
  const { selected } = useWorkstation();
  const v = selected.validation;
  return (
    <div className="panel">
      <h2>Validation · Prop-Firm</h2>
      <div className="bars">
        <Bar label="Drawdown Risk" value={v.drawdownRisk} tone="bad" />
        <Bar label="Payout Stability" value={v.payoutStability} tone="good" />
        <Bar label="Account Pressure" value={v.accountPressure} tone="warn" />
        <Bar label="Consistency Penalty" value={v.consistencyPenalty} tone="bad" />
      </div>
      <table className="kv" style={{ marginTop: 10 }}>
        <tbody>
          <tr><td className="k">Raw score</td><td>{selected.candidate.rawScore.toFixed(3)}</td></tr>
          <tr><td className="k">Adjusted score</td><td>{selected.adjustedScore.toFixed(3)}</td></tr>
          <tr><td className="k">Quality cap</td><td>{selected.sizing.qualityCap}</td></tr>
          <tr><td className="k">Risk-calc contracts</td><td>{selected.sizing.riskContracts}</td></tr>
          <tr><td className="k">Final contracts</td><td>{selected.sizing.finalContracts}</td></tr>
          <tr><td className="k">Per-contract risk</td><td>${selected.sizing.perContractRisk.toFixed(2)}</td></tr>
          <tr><td className="k">Account risk budget</td><td>${selected.sizing.accountRiskDollars.toFixed(2)}</td></tr>
        </tbody>
      </table>
      <div style={{ marginTop: 10 }}>
        <small>
          {v.commentary.length === 0
            ? "Validation steady — no significant adjustments."
            : v.commentary.join("  ·  ")}
        </small>
      </div>
      {selected.sizing.notes.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <small>Sizing notes: {selected.sizing.notes.join("  ·  ")}</small>
        </div>
      )}
    </div>
  );
}

function Bar({ label, value, tone }: { label: string; value: number; tone: "good" | "warn" | "bad" }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="row">
        <small>{label}</small>
        <small>{value.toFixed(2)}</small>
      </div>
      <div className={`bar ${tone}`}><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
