import { useWorkstation } from "../state/WorkstationContext";
import type { MarketDataProviderKind } from "../engine/marketDataProvider";

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
    providerConfig,
    setProviderConfig,
    feedStatus,
    feedLastUpdate,
    feedLatencyMs,
    feedError,
    refreshFeed,
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
          <h2>Market Data Feed</h2>
          <small>
            Pluggable data source powering the decision engine. Every
            provider returns the same InstrumentContext[] shape — swap
            the mock for a broker adapter without touching Dex/Val/Rhea.
          </small>

          <div className="feed-provider-row">
            <ProviderButton
              active={providerConfig.kind === "mock"}
              onClick={() => setProviderConfig({ ...providerConfig, kind: "mock" })}
              label="Mock"
              sub="static · deterministic"
            />
            <ProviderButton
              active={providerConfig.kind === "live_mock"}
              onClick={() => setProviderConfig({ ...providerConfig, kind: "live_mock" })}
              label="Live Mock"
              sub="ticking prices · proves polling"
            />
            <ProviderButton
              active={providerConfig.kind === "rest"}
              onClick={() => setProviderConfig({ ...providerConfig, kind: "rest" })}
              label="REST Endpoint"
              sub="your own broker adapter"
            />
          </div>

          {providerConfig.kind === "rest" && (
            <table className="kv" style={{ marginTop: 10 }}>
              <tbody>
                <tr>
                  <td className="k">Endpoint URL</td>
                  <td>
                    <input
                      type="url"
                      placeholder="https://your-backend/market/contexts"
                      value={providerConfig.restUrl ?? ""}
                      onChange={(e) =>
                        setProviderConfig({ ...providerConfig, restUrl: e.target.value })
                      }
                      className="exec-block" style={{ width: 420 }}
                    />
                  </td>
                </tr>
                <tr>
                  <td className="k">API Key (optional)</td>
                  <td>
                    <input
                      type="password"
                      placeholder="Bearer token — sent as Authorization header"
                      value={providerConfig.apiKey ?? ""}
                      onChange={(e) =>
                        setProviderConfig({ ...providerConfig, apiKey: e.target.value })
                      }
                      className="exec-block" style={{ width: 300 }}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          <table className="kv" style={{ marginTop: 10 }}>
            <tbody>
              <tr>
                <td className="k">Poll interval (ms)</td>
                <td>
                  <input
                    type="number"
                    min={500}
                    step={500}
                    value={providerConfig.pollIntervalMs ?? 5000}
                    onChange={(e) =>
                      setProviderConfig({ ...providerConfig, pollIntervalMs: Number(e.target.value) })
                    }
                    className="exec-block" style={{ width: 140 }}
                  />
                </td>
              </tr>
              {providerConfig.kind === "live_mock" && (
                <tr>
                  <td className="k">Drift factor (±)</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step={0.0005}
                      value={providerConfig.driftFactor ?? 0.0008}
                      onChange={(e) =>
                        setProviderConfig({ ...providerConfig, driftFactor: Number(e.target.value) })
                      }
                      className="exec-block" style={{ width: 140 }}
                    />
                  </td>
                </tr>
              )}
              <tr>
                <td className="k">Status</td>
                <td>
                  <FeedStatusChip status={feedStatus} />
                  {feedLastUpdate && (
                    <small style={{ marginLeft: 8, color: "var(--muted)" }}>
                      last update {new Date(feedLastUpdate).toLocaleTimeString()}
                      {feedLatencyMs !== null && <> · {feedLatencyMs}ms</>}
                    </small>
                  )}
                </td>
              </tr>
              {feedError && (
                <tr>
                  <td className="k">Error</td>
                  <td style={{ color: "var(--danger)" }}>{feedError}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 10 }}>
            <button className="btn" onClick={refreshFeed}>Refresh now</button>
          </div>
        </section>

        <section className="panel">
          <h2>Integrations</h2>
          <table className="kv">
            <tbody>
              <tr><td className="k">TradersPost</td><td>mock · ready (no live API key)</td></tr>
              <tr><td className="k">Tradovate</td><td>mock · ready (routed via TradersPost)</td></tr>
              <tr>
                <td className="k">Market data feed</td>
                <td>
                  <strong>{providerKindLabel(providerConfig.kind)}</strong> ·{" "}
                  see <code>engine/marketDataProvider.ts</code>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function ProviderButton({
  active, onClick, label, sub,
}: { active: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button
      className={`provider-btn ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <div className="provider-btn-label">{label}</div>
      <div className="provider-btn-sub">{sub}</div>
    </button>
  );
}

function FeedStatusChip({ status }: { status: "idle" | "loading" | "live" | "error" }) {
  const cls =
    status === "live"    ? "live" :
    status === "loading" ? "loading" :
    status === "error"   ? "error" :
    "idle";
  const label =
    status === "live"    ? "LIVE" :
    status === "loading" ? "FETCHING…" :
    status === "error"   ? "ERROR" :
    "IDLE";
  return <span className={`feed-status ${cls}`}>{label}</span>;
}

function providerKindLabel(kind: MarketDataProviderKind): string {
  return kind === "mock" ? "Mock (deterministic)"
    : kind === "live_mock" ? "Live Mock (ticking)"
    : "REST endpoint";
}
