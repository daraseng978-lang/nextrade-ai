import { useWorkstation } from "../state/WorkstationContext";
import type { EventKind } from "../engine/types";

const KIND_ICON: Record<EventKind, string> = {
  instrument_selected: "🎯",
  approved: "✅",
  sent: "📤",
  kill_switch_armed: "🛑",
  kill_switch_disarmed: "🔓",
  quorum_toggled: "⚖️",
  hard_block_triggered: "🚫",
  chart_unavailable: "📉",
  chart_retried: "🔄",
};

export function AuditTrailPanel() {
  const { events } = useWorkstation();
  return (
    <section className="panel">
      <h2>Audit Trail</h2>
      <small>Recent operator + system events.</small>
      {events.length === 0 ? (
        <div style={{ marginTop: 8 }}><small>No events yet.</small></div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", maxHeight: 220, overflow: "auto" }}>
          {events.slice(0, 50).map((e) => (
            <li key={e.id} style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
              <small>
                <span style={{ marginRight: 6 }}>{KIND_ICON[e.kind] ?? "•"}</span>
                <span style={{ color: "var(--muted)" }}>{new Date(e.timestamp).toLocaleTimeString()}</span>
                {" · "}
                {e.detail}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
