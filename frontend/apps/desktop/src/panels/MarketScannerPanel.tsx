import { useWorkstation } from "../state/WorkstationContext";
import { REGIMES } from "../engine/regimes";

export function MarketScannerPanel() {
  const { contexts, signals, selectedSymbol, setSelectedSymbol } = useWorkstation();
  return (
    <div>
      <div className="panel">
        <h2>Market Scanner</h2>
        <small>Instruments · regime · tradable state</small>
      </div>
      <div>
        {contexts.map((ctx) => {
          const sig = signals[ctx.instrument.symbol];
          const regimeLabel = REGIMES.find((r) => r.id === ctx.regime)?.label ?? ctx.regime;
          return (
            <div
              key={ctx.instrument.symbol}
              className={`scanner-row ${selectedSymbol === ctx.instrument.symbol ? "selected" : ""}`}
              onClick={() => setSelectedSymbol(ctx.instrument.symbol)}
            >
              <div>
                <div className="sym">{ctx.instrument.symbol}</div>
                <div className="name">{ctx.instrument.name}</div>
                <div className="regime">{regimeLabel}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="name">{ctx.price.toFixed(2)}</div>
                <small>conf {(ctx.regimeConfidence * 100).toFixed(0)}%</small>
              </div>
              <div>
                <StateBadge state={sig.state} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const cls =
    state === "best_available" ? "best" :
    state === "reduced_size" ? "reduced" :
    state === "watch_only" ? "watch" :
    state === "hard_blocked" ? "block" : "stand";
  const label =
    state === "best_available" ? "Tradable" :
    state === "reduced_size" ? "Reduced" :
    state === "watch_only" ? "Watch" :
    state === "hard_blocked" ? "Blocked" : "Stand aside";
  return <span className={`badge ${cls}`}>{label}</span>;
}
