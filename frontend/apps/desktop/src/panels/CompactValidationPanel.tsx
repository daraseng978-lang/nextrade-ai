import { useWorkstation } from "../state/WorkstationContext";

// Compact validation summary intended for the Desk page. The full
// matrix lives in ValidationPanel and is shown elsewhere.
export function CompactValidationPanel() {
  const { selected } = useWorkstation();
  const { adjustedScore, sizing, validation } = selected;
  const raw = selected.candidate.rawScore;
  return (
    <section className="panel">
      <h2>Validation · Compact</h2>
      <table className="kv">
        <tbody>
          <tr><td className="k">Raw / Adjusted</td><td>{raw.toFixed(2)} → <strong>{adjustedScore.toFixed(2)}</strong></td></tr>
          <tr><td className="k">Quality cap</td><td>{sizing.qualityCap}</td></tr>
          <tr><td className="k">Final contracts</td><td><strong>{sizing.finalContracts}</strong></td></tr>
          <tr><td className="k">Drawdown / Payout</td><td>{validation.drawdownRisk.toFixed(2)} / {validation.payoutStability.toFixed(2)}</td></tr>
        </tbody>
      </table>
      {validation.commentary.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <small>{validation.commentary[0]}</small>
        </div>
      )}
    </section>
  );
}
