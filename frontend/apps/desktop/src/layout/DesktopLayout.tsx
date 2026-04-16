import { useWorkstation } from "../state/WorkstationContext";
import { DesktopWorkbench } from "./DesktopWorkbench";
import { ControlCenter } from "./ControlCenter";

export function DesktopLayout() {
  const {
    selected,
    killSwitch,
    setKillSwitch,
    quorumEnabled,
    setQuorumEnabled,
    workspaceMode,
    setWorkspaceMode,
  } = useWorkstation();

  return (
    <div className="workstation">
      <header className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1>Nextrade AI</h1>
          <div className="mode-switch">
            <button
              className={`mode-btn ${workspaceMode === "desk" ? "active" : ""}`}
              onClick={() => setWorkspaceMode("desk")}
            >
              Desk
            </button>
            <button
              className={`mode-btn ${workspaceMode === "control_center" ? "active" : ""}`}
              onClick={() => setWorkspaceMode("control_center")}
            >
              Control Center
            </button>
          </div>
        </div>
        <div className="status">
          <span className={`pill ${killSwitch ? "off" : "on"}`}>
            Kill Switch: {killSwitch ? "ENGAGED" : "OFF"}
          </span>
          <span className="pill">Quorum: {quorumEnabled ? "ON" : "OFF"}</span>
          <span className="pill">Selected: {selected.candidate.instrument.symbol}</span>
          <button className="btn" onClick={() => setQuorumEnabled(!quorumEnabled)}>
            Toggle Quorum
          </button>
          <button
            className={`btn ${killSwitch ? "danger" : ""}`}
            onClick={() => setKillSwitch(!killSwitch)}
          >
            {killSwitch ? "Disarm" : "Arm Kill Switch"}
          </button>
        </div>
      </header>

      {workspaceMode === "desk" ? <DesktopWorkbench /> : <ControlCenter />}

      <footer className="statusbar">
        <span>Execution path: Nextrade AI → TradersPost → Tradovate</span>
        <span>
          {selected.state === "hard_blocked"
            ? `Hard block: ${selected.hardBlock.reason}`
            : `State: ${selected.state}  |  Final: ${selected.sizing.finalContracts} contracts  |  Adj ${selected.adjustedScore.toFixed(2)}`}
        </span>
      </footer>
    </div>
  );
}
