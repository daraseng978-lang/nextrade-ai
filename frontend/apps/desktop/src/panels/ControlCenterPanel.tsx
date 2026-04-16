import { useWorkstation } from "../state/WorkstationContext";

export function ControlCenterPanel() {
  const { killSwitch, signals } = useWorkstation();
  const hardBlocked = Object.values(signals).filter((s) => s.hardBlock.active).length;
  const tradable = Object.values(signals).filter((s) => s.state === "best_available").length;
  const reduced = Object.values(signals).filter((s) => s.state === "reduced_size").length;
  return (
    <section className="panel">
      <h2>Control Center</h2>
      <table className="kv">
        <tbody>
          <tr>
            <td className="k">Kill switch</td>
            <td style={{ color: killSwitch ? "var(--danger)" : "var(--good)" }}>
              {killSwitch ? "ENGAGED" : "OFF"}
            </td>
          </tr>
          <tr><td className="k">Instruments monitored</td><td>{Object.keys(signals).length}</td></tr>
          <tr><td className="k">Best available</td><td>{tradable}</td></tr>
          <tr><td className="k">Reduced size</td><td>{reduced}</td></tr>
          <tr><td className="k">Hard blocked</td><td>{hardBlocked}</td></tr>
          <tr><td className="k">TradersPost link</td><td style={{ color: "var(--good)" }}>mock · ready</td></tr>
          <tr><td className="k">Tradovate link</td><td style={{ color: "var(--good)" }}>mock · ready</td></tr>
        </tbody>
      </table>
    </section>
  );
}
