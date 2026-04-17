import { useMemo } from "react";
import { useWorkstation } from "../state/WorkstationContext";
import { buildJournalMetrics } from "../engine/journal";

function fmtR(n: number): string {
  if (!isFinite(n)) return "∞";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "R";
}

function fmtPct(n: number): string { return `${(n * 100).toFixed(1)}%`; }

function fmtUSD(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function PerformancePanel() {
  const { journal } = useWorkstation();
  const m = useMemo(() => buildJournalMetrics(journal), [journal]);

  return (
    <section className="panel journal-metrics">
      <h2>Performance Metrics</h2>
      <small>
        Closed-trade aggregates · win rate, expectancy, profit factor, drawdown
      </small>

      <div className="metric-grid">
        <Metric k="Total Trades" v={`${m.totalTrades}`} sub={`${m.openTrades} open · ${m.closedTrades} closed`} />
        <Metric k="Win Rate"     v={fmtPct(m.winRate)} sub={`${m.wins}W / ${m.losses}L / ${m.breakevens}BE`} tone={m.winRate >= 0.5 ? "good" : m.winRate > 0 ? "warn" : undefined} />
        <Metric k="Expectancy"   v={fmtR(m.expectancyR)} sub="Avg R per closed trade" tone={m.expectancyR > 0 ? "good" : m.expectancyR < 0 ? "bad" : undefined} />
        <Metric k="Profit Factor" v={isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "∞"} sub="Gross profit / gross loss" tone={m.profitFactor >= 1.5 ? "good" : m.profitFactor >= 1 ? "warn" : m.profitFactor > 0 ? "bad" : undefined} />
        <Metric k="Avg Win"  v={fmtR(m.avgWinR)}  sub={`Largest ${fmtR(m.largestWinR)}`} tone="good" />
        <Metric k="Avg Loss" v={fmtR(m.avgLossR)} sub={`Largest ${fmtR(m.largestLossR)}`} tone="bad" />
        <Metric k="Total R"  v={fmtR(m.totalR)}   sub={fmtUSD(m.totalPnl)} tone={m.totalR > 0 ? "good" : m.totalR < 0 ? "bad" : undefined} />
        <Metric k="Max Drawdown" v={`-${m.maxDrawdownR.toFixed(2)}R`} sub="Worst running equity dip" tone={m.maxDrawdownR > 3 ? "bad" : m.maxDrawdownR > 1 ? "warn" : undefined} />
      </div>

      {Object.keys(m.byStrategy).length > 0 && (
        <>
          <div className="metric-breakdown-head">Breakdown by strategy</div>
          <table className="kv metric-breakdown">
            <thead>
              <tr>
                <td className="k">Strategy</td>
                <td className="k right">Count</td>
                <td className="k right">Win %</td>
                <td className="k right">Total R</td>
              </tr>
            </thead>
            <tbody>
              {Object.entries(m.byStrategy)
                .sort(([, a], [, b]) => b.totalR - a.totalR)
                .map(([strat, s]) => (
                  <tr key={strat}>
                    <td>{strat}</td>
                    <td className="right">{s.count}</td>
                    <td className="right">{fmtPct(s.winRate)}</td>
                    <td className="right" style={{ color: s.totalR > 0 ? "var(--accent)" : s.totalR < 0 ? "var(--danger)" : undefined }}>
                      {fmtR(s.totalR)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function Metric({
  k, v, sub, tone,
}: { k: string; v: string; sub?: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className={`metric-cell ${tone ?? ""}`}>
      <div className="metric-k">{k}</div>
      <div className="metric-v">{v}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}
