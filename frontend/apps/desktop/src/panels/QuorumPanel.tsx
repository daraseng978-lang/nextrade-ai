import { useWorkstation } from "../state/WorkstationContext";

// Optional quorum confirmation layer. Non-blocking by default; surfaces
// multi-signal agreement (regime, strategy, validation, sizing).
export function QuorumPanel() {
  const { selected } = useWorkstation();
  const c = selected.candidate;
  const v = selected.validation;
  const checks: { label: string; ok: boolean }[] = [
    { label: "Regime alignment", ok: c.rawScore >= 0.35 },
    { label: "Validation payout ≥ 0.5", ok: v.payoutStability >= 0.5 },
    { label: "Drawdown risk ≤ 0.7", ok: v.drawdownRisk <= 0.7 },
    { label: "Account pressure ≤ 0.6", ok: v.accountPressure <= 0.6 },
    { label: "Final contracts > 0", ok: selected.sizing.finalContracts > 0 },
  ];
  const passed = checks.filter((c) => c.ok).length;
  return (
    <section className="panel">
      <h2>Quorum (optional)</h2>
      <small>
        Agreement: {passed}/{checks.length} checks
      </small>
      <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
        {checks.map((ch) => (
          <li key={ch.label} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{ch.label}</span>
            <span style={{ color: ch.ok ? "var(--good)" : "var(--danger)" }}>
              {ch.ok ? "PASS" : "HOLD"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
