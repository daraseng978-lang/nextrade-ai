import { useWorkstation } from "../state/WorkstationContext";

// Settings = single source of truth for account / risk / supervision
// switches and chart feed defaults. No live trading workflow here.
export function SettingsPage() {
  const {
    account,
    setAccount,
    killSwitch,
    setKillSwitch,
    quorumEnabled,
    setQuorumEnabled,
    chartFeedMode,
    setChartFeedMode,
  } = useWorkstation();

  const update = (patch: Partial<typeof account>) =>
    setAccount({ ...account, ...patch });

  return (
    <div className="page-grid journal-grid">
      <main className="column wide">
        <section className="panel">
          <h2>Account & Risk</h2>
          <table className="kv">
            <tbody>
              <tr>
                <td className="k">Account equity ($)</td>
                <td>
                  <input
                    type="number"
                    value={account.accountEquity}
                    onChange={(e) => update({ accountEquity: Number(e.target.value) })}
                    className="exec-block" style={{ width: 160 }}
                  />
                </td>
              </tr>
              <tr>
                <td className="k">Risk per trade (%)</td>
                <td>
                  <input
                    type="number"
                    step="0.05"
                    value={(account.riskPerTradePct * 100).toFixed(2)}
                    onChange={(e) => update({ riskPerTradePct: Number(e.target.value) / 100 })}
                    className="exec-block" style={{ width: 100 }}
                  />
                </td>
              </tr>
              <tr>
                <td className="k">Max daily loss (%)</td>
                <td>
                  <input
                    type="number"
                    step="0.1"
                    value={(account.maxDailyLossPct * 100).toFixed(2)}
                    onChange={(e) => update({ maxDailyLossPct: Number(e.target.value) / 100 })}
                    className="exec-block" style={{ width: 100 }}
                  />
                </td>
              </tr>
              <tr>
                <td className="k">Consistency target (%)</td>
                <td>
                  <input
                    type="number"
                    step="1"
                    value={(account.consistencyTargetPct * 100).toFixed(0)}
                    onChange={(e) => update({ consistencyTargetPct: Number(e.target.value) / 100 })}
                    className="exec-block" style={{ width: 100 }}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="panel">
          <h2>Supervision</h2>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button
              className={`btn ${killSwitch ? "danger" : ""}`}
              onClick={() => setKillSwitch(!killSwitch)}
            >
              {killSwitch ? "Disarm Kill Switch" : "Arm Kill Switch"}
            </button>
            <button className="btn" onClick={() => setQuorumEnabled(!quorumEnabled)}>
              {quorumEnabled ? "Disable Quorum" : "Enable Quorum"}
            </button>
          </div>
          <div style={{ marginTop: 8 }}>
            <small>
              Kill switch: <strong>{killSwitch ? "ENGAGED" : "OFF"}</strong> ·{" "}
              Quorum: <strong>{quorumEnabled ? "ON" : "OFF"}</strong>
            </small>
          </div>
        </section>

        <section className="panel">
          <h2>Chart Feed</h2>
          <small>
            Default symbol mode for the Charts page. Proxy uses free
            indices / commodities; Futures uses CME / NYMEX / COMEX symbols
            which the embed iframe gates even for paid TradingView accounts.
          </small>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              className={`btn ${chartFeedMode === "proxy" ? "primary" : ""}`}
              onClick={() => setChartFeedMode("proxy")}
            >Proxy</button>
            <button
              className={`btn ${chartFeedMode === "futures" ? "primary" : ""}`}
              onClick={() => setChartFeedMode("futures")}
            >Futures</button>
          </div>
        </section>

        <section className="panel">
          <h2>Integrations</h2>
          <table className="kv">
            <tbody>
              <tr><td className="k">TradersPost</td><td>mock · ready (no live API key)</td></tr>
              <tr><td className="k">Tradovate</td><td>mock · ready (routed via TradersPost)</td></tr>
              <tr><td className="k">Market data feed</td><td>deterministic mock (see <code>engine/mockData.ts</code>)</td></tr>
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
