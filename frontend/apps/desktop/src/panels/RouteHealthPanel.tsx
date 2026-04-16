import { useWorkstation } from "../state/WorkstationContext";
import type { RouteStatus } from "../engine/types";

// TradersPost / Tradovate connection state. Mock today; surfaces honest
// "mock · ready" labels. Kill switch flips both routes to degraded.
export function RouteHealthPanel() {
  const { routeHealth } = useWorkstation();
  return (
    <section className="panel">
      <h2>Route Health</h2>
      <small>Execution route to Tradovate via TradersPost.</small>
      <div style={{ marginTop: 10 }}>
        <RouteRow label="TradersPost" {...routeHealth.tradersPost} />
        <RouteRow label="Tradovate" {...routeHealth.tradovate} />
      </div>
    </section>
  );
}

function RouteRow({
  label,
  status,
  lastCheck,
  note,
}: {
  label: string;
  status: RouteStatus;
  lastCheck: string;
  note: string;
}) {
  const cls =
    status === "ok" ? "best" :
    status === "degraded" ? "reduced" :
    "block";
  return (
    <div className="route-row">
      <div>
        <strong>{label}</strong>
        <div><small>{note}</small></div>
      </div>
      <div style={{ textAlign: "right" }}>
        <span className={`badge ${cls}`}>{status}</span>
        <div><small>{new Date(lastCheck).toLocaleTimeString()}</small></div>
      </div>
    </div>
  );
}
