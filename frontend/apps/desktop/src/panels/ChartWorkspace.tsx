import { useMemo } from "react";
import { useWorkstation } from "../state/WorkstationContext";
import {
  DEFAULT_QUAD_TIMEFRAMES,
  TIMEFRAMES,
  tradingViewAlternates,
  tradingViewEmbedUrl,
  tradingViewProxyLabel,
  tradingViewSymbol,
} from "../engine/tradingView";
import type { TimeframeId } from "../engine/types";
import { STRATEGIES } from "../engine/strategies";

// Multi-timeframe TradingView display. Third-party iframe is sandboxed,
// so trade levels are rendered as a clearly-labelled legend overlay per
// chart, and per-cell fallback UI handles unavailable symbols cleanly.
export function ChartWorkspace() {
  const {
    selected,
    chartViewMode,
    setChartViewMode,
    focusTimeframe,
    setFocusTimeframe,
    chartTimeframes,
    setChartTimeframes,
    chartFeedMode,
    setChartFeedMode,
  } = useWorkstation();

  const symbol = tradingViewSymbol(selected.candidate.instrument, chartFeedMode);
  const proxyLabel =
    chartFeedMode === "proxy"
      ? tradingViewProxyLabel(selected.candidate.instrument)
      : undefined;
  const tradableOverlay =
    selected.state !== "hard_blocked" &&
    selected.state !== "stand_aside" &&
    selected.candidate.side !== "flat";

  const timeframes = chartViewMode === "quad" ? chartTimeframes : [focusTimeframe];

  const setQuadTf = (index: number, tf: TimeframeId) => {
    const copy = [...chartTimeframes];
    copy[index] = tf;
    setChartTimeframes(copy);
  };

  const header = useMemo(
    () => ({
      strategy: STRATEGIES[selected.candidate.strategy].label,
      regime: selected.context.regime,
    }),
    [selected],
  );

  return (
    <section className="chart-workspace">
      <div className="chart-header">
        <div>
          <strong>{symbol}</strong>
          {proxyLabel && (
            <small style={{ marginLeft: 8, color: "var(--warn)" }}>{proxyLabel}</small>
          )}
          <small style={{ marginLeft: 8, color: "var(--muted)" }}>
            {header.strategy} · {header.regime}
          </small>
        </div>
        <div className="chart-header-actions">
          <span className={`tab ${chartFeedMode === "proxy" ? "active" : ""}`}
            onClick={() => setChartFeedMode("proxy")}
            title="Free TradingView embed — index / commodity proxy">Proxy</span>
          <span className={`tab ${chartFeedMode === "futures" ? "active" : ""}`}
            onClick={() => setChartFeedMode("futures")}
            title="CME futures symbol — gated inside the embed iframe">Futures</span>
          <span style={{ width: 10 }} />
          <span className={`tab ${chartViewMode === "quad" ? "active" : ""}`}
            onClick={() => setChartViewMode("quad")}>Quad</span>
          <span className={`tab ${chartViewMode === "focus" ? "active" : ""}`}
            onClick={() => setChartViewMode("focus")}>Focus</span>
          {chartViewMode === "quad" && (
            <button className="btn" onClick={() => setChartTimeframes(DEFAULT_QUAD_TIMEFRAMES)}
              style={{ marginLeft: 8 }}>Reset timeframes</button>
          )}
          {chartViewMode === "focus" && (
            <select value={focusTimeframe}
              onChange={(e) => setFocusTimeframe(e.target.value as TimeframeId)}
              className="tf-select">
              {TIMEFRAMES.map((tf) => (
                <option key={tf.id} value={tf.id}>{tf.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className={`chart-grid ${chartViewMode}`}>
        {timeframes.map((tf, idx) => (
          <ChartCell
            key={`${symbol}-${tf}-${idx}`}
            symbol={symbol}
            timeframe={tf}
            overlayVisible={tradableOverlay}
            onTimeframeChange={
              chartViewMode === "quad" ? (next) => setQuadTf(idx, next) : undefined
            }
          />
        ))}
      </div>
      <div className="chart-linked">
        <small>
          🔗 Linked mode — instrument <strong>{symbol}</strong> · side{" "}
          <strong>{selected.candidate.side.toUpperCase()}</strong> · feed{" "}
          <strong>{chartFeedMode === "proxy" ? "proxy" : "futures"}</strong>.
          Level overlays source:{" "}
          {tradableOverlay ? "selected trade" : "hidden (watch-only / blocked)"}
          .
          {chartFeedMode === "futures" && (
            <> Futures mode shows the real CME / NYMEX / COMEX symbol;
            the free embed gates this data even for paid accounts.</>
          )}
        </small>
      </div>
    </section>
  );
}

function ChartCell({
  symbol,
  timeframe,
  overlayVisible,
  onTimeframeChange,
}: {
  symbol: string;
  timeframe: TimeframeId;
  overlayVisible: boolean;
  onTimeframeChange?: (tf: TimeframeId) => void;
}) {
  const {
    selected,
    chartUnavailable,
    markChartUnavailable,
    clearChartUnavailable,
    chartFeedMode,
    setChartFeedMode,
  } = useWorkstation();

  const cellKey = `${selected.candidate.instrument.symbol}:${timeframe}`;
  // Futures mode is always implicitly unavailable — the free embed
  // iframe gates CME / NYMEX / COMEX data regardless of account type.
  // Render the controlled fallback instead of loading a broken iframe.
  const manuallyMarked = chartUnavailable[cellKey] === symbol;
  const implicitlyUnavailable = chartFeedMode === "futures";
  const isUnavailable = manuallyMarked || implicitlyUnavailable;
  const tfMeta = TIMEFRAMES.find((t) => t.id === timeframe)!;
  const frameId = `tv-${symbol.replace(/[^A-Z0-9]/gi, "_")}-${timeframe}`;
  const url = tradingViewEmbedUrl(symbol, timeframe, frameId);
  const alternates = tradingViewAlternates(selected.candidate.instrument, symbol);

  return (
    <div className="chart-cell">
      <div className="chart-cell-head">
        <strong>{tfMeta.label}</strong>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {!isUnavailable && (
            <button
              className="btn"
              onClick={() => markChartUnavailable(cellKey, symbol)}
              title="Mark this cell as unavailable to show the controlled fallback"
              style={{ padding: "2px 8px", fontSize: 10 }}
            >
              Mark unavailable
            </button>
          )}
          {onTimeframeChange && (
            <select
              value={timeframe}
              onChange={(e) => onTimeframeChange(e.target.value as TimeframeId)}
              className="tf-select"
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf.id} value={tf.id}>{tf.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="chart-frame-wrap">
        {isUnavailable ? (
          <ChartFallback
            attemptedSymbol={symbol}
            alternates={alternates}
            reason={
              implicitlyUnavailable
                ? "Futures mode uses CME / NYMEX / COMEX symbols. The free TradingView embed gates this data even for Premium accounts."
                : undefined
            }
            onRetry={
              manuallyMarked ? () => clearChartUnavailable(cellKey) : undefined
            }
            onSwitchToProxy={
              implicitlyUnavailable ? () => setChartFeedMode("proxy") : undefined
            }
          />
        ) : (
          <>
            <iframe
              id={frameId}
              title={`TradingView ${symbol} ${timeframe}`}
              src={url}
              allowTransparency
              allowFullScreen
              loading="lazy"
              className="chart-frame"
            />
            {overlayVisible && (
              <div className="chart-legend" aria-label="selected-trade-levels">
                <div><span className="dot entry" /> Entry {selected.candidate.entry.toFixed(2)}</div>
                <div><span className="dot stop" /> Stop {selected.candidate.stop.toFixed(2)}</div>
                <div><span className="dot tp1" /> TP1 {selected.candidate.tp1.toFixed(2)}</div>
                <div><span className="dot tp2" /> TP2 {selected.candidate.tp2.toFixed(2)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ChartFallback({
  attemptedSymbol,
  alternates,
  reason,
  onRetry,
  onSwitchToProxy,
}: {
  attemptedSymbol: string;
  alternates: string[];
  reason?: string;
  onRetry?: () => void;
  onSwitchToProxy?: () => void;
}) {
  return (
    <div className="chart-fallback">
      <div className="chart-fallback-title">Chart unavailable for current symbol mapping</div>
      {reason && (
        <div className="chart-fallback-detail" style={{ maxWidth: 420 }}>
          <small style={{ color: "var(--warn)" }}>{reason}</small>
        </div>
      )}
      <div className="chart-fallback-detail">
        <small>Attempted symbol: <code>{attemptedSymbol}</code></small>
      </div>
      {alternates.length > 0 && (
        <div className="chart-fallback-detail">
          <small>
            Alternate supported symbols:{" "}
            {alternates.map((s, i) => (
              <span key={s}>
                <code>{s}</code>
                {i < alternates.length - 1 ? ", " : ""}
              </span>
            ))}
          </small>
        </div>
      )}
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        {onSwitchToProxy && (
          <button className="btn primary" onClick={onSwitchToProxy}>
            Switch to Proxy
          </button>
        )}
        {onRetry && <button className="btn" onClick={onRetry}>Retry</button>}
      </div>
    </div>
  );
}
