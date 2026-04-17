import { useWorkstation } from "../state/WorkstationContext";
import { PAGES } from "../engine/pages";
import { DeskPage } from "../pages/DeskPage";
import { ChartsPage } from "../pages/ChartsPage";
import { ControlCenterPage } from "../pages/ControlCenterPage";
import { QuickTradePage } from "../pages/QuickTradePage";
import { PineStudioPage } from "../pages/PineStudioPage";
import { JournalPage } from "../pages/JournalPage";
import { CapitalLabPage } from "../pages/CapitalLabPage";
import { SettingsPage } from "../pages/SettingsPage";

export function DesktopLayout() {
  const { selected, killSwitch, page, setPage } = useWorkstation();

  const ActivePage =
    page === "desk" ? <DeskPage /> :
    page === "charts" ? <ChartsPage /> :
    page === "control_center" ? <ControlCenterPage /> :
    page === "quick_trade" ? <QuickTradePage /> :
    page === "pine_studio" ? <PineStudioPage /> :
    page === "journal" ? <JournalPage /> :
    page === "capital_lab" ? <CapitalLabPage /> :
    <SettingsPage />;

  const activeMeta = PAGES.find((p) => p.id === page)!;

  return (
    <div className="workstation">
      <header className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1>Nextrade AI</h1>
          <nav className="page-tabs">
            {PAGES.map((p) => (
              <button
                key={p.id}
                className={`page-tab ${page === p.id ? "active" : ""}`}
                onClick={() => setPage(p.id)}
              >
                {p.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="status">
          <span className={`pill ${killSwitch ? "off" : "on"}`}>
            Kill Switch: {killSwitch ? "ENGAGED" : "OFF"}
          </span>
          <span className="pill">Selected: {selected.candidate.instrument.symbol}</span>
        </div>
      </header>

      {ActivePage}

      <footer className="statusbar">
        <span>{activeMeta.role}</span>
        <span>
          {selected.state === "hard_blocked"
            ? `Hard block: ${selected.hardBlock.reason}`
            : `State: ${selected.state}  |  Final: ${selected.sizing.finalContracts} contracts  |  Adj ${selected.adjustedScore.toFixed(2)}`}
        </span>
      </footer>
    </div>
  );
}
