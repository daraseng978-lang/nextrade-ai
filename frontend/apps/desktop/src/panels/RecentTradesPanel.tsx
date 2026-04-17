import { useMemo } from "react";
import { useWorkstation } from "../state/WorkstationContext";
import { analyzeTrade } from "../engine/tradeAnalysis";

// Surfaces the last few trades with a compact win/loss · strategy · why
// summary so the trader (and eventually a model) has an immediate
// feedback loop visible on the Desk. Prefers closed trades; falls
// back to most recent sends when none are closed.
export function RecentTradesPanel() {
  const { journal, setPage } = useWorkstation();

  const recent = useMemo(() => {
    const closed = journal.filter(j => j.status !== "open");
    const base = closed.length >= 3 ? closed : journal;
    return base.slice(0, 3);
  }, [journal]);

  return (
    <section className="panel recent-trades">
      <div className="recent-trades-head">
        <h2>Recent Trades</h2>
        <button
          className="recent-trades-link"
          onClick={() => setPage("journal")}
        >
          Open journal →
        </button>
      </div>
      <small>
        Last {recent.length || 3} · win/loss · strategy · why · training
        feedback
      </small>

      {recent.length === 0 ? (
        <div className="recent-trades-empty">
          <small>
            No trades logged yet. Approve and send a signal — the last few
            will appear here for fast post-trade review.
          </small>
        </div>
      ) : (
        <div className="recent-trades-list">
          {recent.map((entry) => {
            const a = analyzeTrade(entry);
            const toneClass =
              a.signal === "positive" ? "win" :
              a.signal === "negative" ? "loss" :
              entry.status === "open" ? "open" :
              "be";
            return (
              <div key={entry.id} className={`recent-trade ${toneClass}`}>
                <div className="recent-trade-head">
                  <span className={`recent-trade-badge ${toneClass}`}>
                    {a.outcomeWord}
                  </span>
                  <span className="recent-trade-sym">{entry.symbol}</span>
                  <span className={`recent-trade-side ${entry.side}`}>
                    {entry.side.toUpperCase()}
                  </span>
                  <span className="recent-trade-r">
                    {entry.outcomeR !== undefined
                      ? `${entry.outcomeR >= 0 ? "+" : ""}${entry.outcomeR.toFixed(2)}R`
                      : "—"}
                  </span>
                </div>
                <div className="recent-trade-meta">
                  <span>{entry.strategyLabel}</span>
                  <span className="dot">·</span>
                  <span>{entry.regime}</span>
                  <span className="dot">·</span>
                  <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="recent-trade-why">{a.summary}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
