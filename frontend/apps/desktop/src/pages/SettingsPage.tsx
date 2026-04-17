import { useState } from "react";
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
    dispatchConfig,
    setDispatchConfig,
    lastDispatchResult,
    testDispatch,
    telegramConfig,
    setTelegramConfig,
    lastTelegramResult,
    testTelegram,
  } = useWorkstation();
  const [testing, setTesting] = useState(false);
  const [testingTg, setTestingTg] = useState(false);

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
              active={
                providerConfig.kind === "rest" &&
                providerConfig.restUrl === "http://localhost:3001/market/contexts"
              }
              onClick={() => setProviderConfig({
                ...providerConfig,
                kind: "rest",
                restUrl: "http://localhost:3001/market/contexts",
              })}
              label="Alpaca (local shim)"
              sub="backend/alpaca-feed · ETF → futures"
            />
            <ProviderButton
              active={
                providerConfig.kind === "rest" &&
                providerConfig.restUrl !== "http://localhost:3001/market/contexts"
              }
              onClick={() => setProviderConfig({ ...providerConfig, kind: "rest", restUrl: "" })}
              label="Custom REST"
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
          <h2>TradersPost Dispatch</h2>
          <small>
            Forward sent orders to TradersPost via the backend proxy
            (webhook URL stays server-side). When disabled, "Send"
            and Auto Pilot still log to the journal but no real order
            leaves the app.
          </small>

          <div style={{ marginTop: 10 }}>
            <button
              className={`btn ${dispatchConfig.enabled ? "danger" : ""}`}
              onClick={() => {
                if (!dispatchConfig.enabled) {
                  const ok = confirm(
                    "Enable LIVE TradersPost dispatch?\n\n" +
                    "Once enabled, every approved + sent trade (manual or Auto Pilot) " +
                    "is POSTed to your TradersPost webhook and may execute against " +
                    "your connected broker.\n\n" +
                    "Make sure you have:\n" +
                    "  · Set TRADERSPOST_WEBHOOK_URL in backend/alpaca-feed/.env\n" +
                    "  · Restarted the backend\n" +
                    "  · Verified the webhook with the Test button below first\n\n" +
                    "Continue?"
                  );
                  if (!ok) return;
                }
                setDispatchConfig({ ...dispatchConfig, enabled: !dispatchConfig.enabled });
              }}
            >
              {dispatchConfig.enabled ? "Disable Live Dispatch" : "Enable Live Dispatch"}
            </button>
            <small style={{ marginLeft: 12 }}>
              State:{" "}
              <strong style={{ color: dispatchConfig.enabled ? "var(--danger)" : "var(--muted)" }}>
                {dispatchConfig.enabled ? "LIVE" : "OFF (mock)"}
              </strong>
            </small>
          </div>

          <table className="kv" style={{ marginTop: 10 }}>
            <tbody>
              <tr>
                <td className="k">Backend dispatch endpoint</td>
                <td>
                  <input
                    type="url"
                    placeholder="http://localhost:3001/dispatch/traderspost"
                    value={dispatchConfig.endpoint}
                    onChange={(e) =>
                      setDispatchConfig({ ...dispatchConfig, endpoint: e.target.value })
                    }
                    className="exec-block" style={{ width: 420 }}
                  />
                </td>
              </tr>
              <tr>
                <td className="k">Webhook URL</td>
                <td>
                  <small>
                    Set on the backend in <code>backend/alpaca-feed/.env</code> as{" "}
                    <code>TRADERSPOST_WEBHOOK_URL</code>. Never sent to the browser.
                  </small>
                </td>
              </tr>
              <tr>
                <td className="k">Last dispatch</td>
                <td>
                  {lastDispatchResult ? (
                    <small style={{ color: lastDispatchResult.ok ? "var(--accent)" : "var(--danger)" }}>
                      {lastDispatchResult.ok ? "✓" : "✗"} {lastDispatchResult.message}
                      {lastDispatchResult.status > 0 && <> · HTTP {lastDispatchResult.status}</>}
                      {lastDispatchResult.forwardedTo && (
                        <> · → {lastDispatchResult.forwardedTo}</>
                      )}
                    </small>
                  ) : (
                    <small style={{ color: "var(--muted)" }}>none yet</small>
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: 10 }}>
            <button
              className="btn"
              disabled={testing}
              onClick={async () => {
                setTesting(true);
                try { await testDispatch(); } finally { setTesting(false); }
              }}
            >
              {testing ? "Sending…" : "Test dispatch (current signal)"}
            </button>
            <small style={{ marginLeft: 10, color: "var(--muted)" }}>
              POSTs the currently selected signal's TradersPost payload to the backend.
              Disabled mode returns mock success without forwarding.
            </small>
          </div>
        </section>

        <section className="panel">
          <h2>Telegram Notifications</h2>
          <small>
            Push four categories of events to your Telegram chat: daily
            pre-market brief, new signal selected, approval stages, and
            trade sent. Bot token + chat id stay server-side.
          </small>

          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className={`btn ${telegramConfig.enabled ? "primary" : ""}`}
              onClick={() => setTelegramConfig({ ...telegramConfig, enabled: !telegramConfig.enabled })}
            >
              {telegramConfig.enabled ? "Disable Telegram" : "Enable Telegram"}
            </button>
            <small>
              State:{" "}
              <strong style={{ color: telegramConfig.enabled ? "var(--accent)" : "var(--muted)" }}>
                {telegramConfig.enabled ? "ON" : "OFF"}
              </strong>
            </small>
          </div>

          <table className="kv" style={{ marginTop: 10 }}>
            <tbody>
              <tr>
                <td className="k">Backend endpoint</td>
                <td>
                  <input
                    type="url"
                    placeholder="http://localhost:3001/dispatch/telegram"
                    value={telegramConfig.endpoint}
                    onChange={(e) =>
                      setTelegramConfig({ ...telegramConfig, endpoint: e.target.value })
                    }
                    className="exec-block" style={{ width: 420 }}
                  />
                </td>
              </tr>
              <tr>
                <td className="k">Bot token / Chat ID</td>
                <td>
                  <small>
                    Set on the backend in <code>backend/alpaca-feed/.env</code>:{" "}
                    <code>TELEGRAM_BOT_TOKEN</code> + <code>TELEGRAM_CHAT_ID</code>.
                    Get a bot from <strong>@BotFather</strong> on Telegram.
                  </small>
                </td>
              </tr>
              <tr>
                <td className="k">Triggers</td>
                <td>
                  <label className="tg-trigger">
                    <input
                      type="checkbox"
                      checked={telegramConfig.triggers.brief}
                      onChange={(e) =>
                        setTelegramConfig({
                          ...telegramConfig,
                          triggers: { ...telegramConfig.triggers, brief: e.target.checked },
                        })
                      }
                    />
                    Daily brief
                  </label>
                  <label className="tg-trigger">
                    <input
                      type="checkbox"
                      checked={telegramConfig.triggers.signal}
                      onChange={(e) =>
                        setTelegramConfig({
                          ...telegramConfig,
                          triggers: { ...telegramConfig.triggers, signal: e.target.checked },
                        })
                      }
                    />
                    New signal
                  </label>
                  <label className="tg-trigger">
                    <input
                      type="checkbox"
                      checked={telegramConfig.triggers.approval}
                      onChange={(e) =>
                        setTelegramConfig({
                          ...telegramConfig,
                          triggers: { ...telegramConfig.triggers, approval: e.target.checked },
                        })
                      }
                    />
                    Approval
                  </label>
                  <label className="tg-trigger">
                    <input
                      type="checkbox"
                      checked={telegramConfig.triggers.sent}
                      onChange={(e) =>
                        setTelegramConfig({
                          ...telegramConfig,
                          triggers: { ...telegramConfig.triggers, sent: e.target.checked },
                        })
                      }
                    />
                    Trade sent
                  </label>
                </td>
              </tr>
              <tr>
                <td className="k">Last message</td>
                <td>
                  {lastTelegramResult ? (
                    <small style={{ color: lastTelegramResult.ok ? "var(--accent)" : "var(--danger)" }}>
                      {lastTelegramResult.ok ? "✓" : "✗"} {lastTelegramResult.message}
                      {lastTelegramResult.status > 0 && <> · HTTP {lastTelegramResult.status}</>}
                      {lastTelegramResult.messageId && <> · id {lastTelegramResult.messageId}</>}
                    </small>
                  ) : (
                    <small style={{ color: "var(--muted)" }}>none yet</small>
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: 10 }}>
            <button
              className="btn"
              disabled={testingTg || !telegramConfig.enabled}
              onClick={async () => {
                setTestingTg(true);
                try { await testTelegram(); } finally { setTestingTg(false); }
              }}
            >
              {testingTg ? "Sending…" : "Test message"}
            </button>
            <small style={{ marginLeft: 10, color: "var(--muted)" }}>
              Sends "🧪 Nextrade AI · test message · [time]" to your chat.
            </small>
          </div>
        </section>

        <section className="panel">
          <h2>Integrations</h2>
          <table className="kv">
            <tbody>
              <tr>
                <td className="k">TradersPost</td>
                <td>
                  {dispatchConfig.enabled
                    ? <strong style={{ color: "var(--danger)" }}>LIVE dispatch enabled</strong>
                    : "mock · disabled (configure in TradersPost Dispatch above)"}
                </td>
              </tr>
              <tr>
                <td className="k">Telegram</td>
                <td>
                  {telegramConfig.enabled
                    ? <>
                        <strong style={{ color: "var(--accent)" }}>ON</strong> ·{" "}
                        {Object.entries(telegramConfig.triggers).filter(([, v]) => v).map(([k]) => k).join(", ")}
                      </>
                    : "disabled"}
                </td>
              </tr>
              <tr><td className="k">Tradovate</td><td>mock · ready (routed via TradersPost)</td></tr>
              <tr>
                <td className="k">Market data feed</td>
                <td>
                  <strong>{providerKindLabel(providerConfig.kind, providerConfig.restUrl)}</strong> ·{" "}
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

function providerKindLabel(kind: MarketDataProviderKind, url?: string): string {
  if (kind === "mock") return "Mock (deterministic)";
  if (kind === "live_mock") return "Live Mock (ticking)";
  if (url === "http://localhost:3001/market/contexts") return "Alpaca (local shim)";
  return "REST endpoint";
}
