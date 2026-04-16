import { useMemo } from "react";
import { useWorkstation } from "../state/WorkstationContext";
import {
  DEFAULT_QUAD_TIMEFRAMES,
  TIMEFRAMES,
  tradingViewEmbedUrl,
  tradingViewSymbol,
} from "../engine/tradingView";
import type { TimeframeId } from "../engine/types";
import { STRATEGIES } from "../engine/strategies";

// Multi-timeframe TradingView display. Third-party iframe is sandboxed,
// so trade levels are rendered as a clearly-labelled legend overlay per
// chart rather than drawn inside the iframe.
export function ChartWorkspace() {
  const {
    selected,
    chartViewMode,
    setChartViewMode,
    focusTimeframe,
    setFocusTimeframe,
    chartTimeframes,
    setChartTimeframes,
  } = useWorkstation();

  const symbol = tradingViewSymbol(selected.candidate.instrument);
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
          <small style={{ marginLeft: 8, color: "var(--muted)" }}>
            {header.strategy} · {header.regime}
          </small>
        </div>
        <div className="chart-header-actions">
          <span className={`tab ${chartViewMode === "quad" ? "active" : ""}`}
            onClick={() => setChartViewMode("quad")}>Quad</span>
          <span className={`tab ${chartViewMode === "focus" ? "active" : ""}`}
            onClick={() => setChartViewMode("focus")}>Focus</span>
          {chartViewMode === "quad" && (
            <button
              className="btn"
              onClick={() => setChartTimeframes(DEFAULT_QUAD_TIMEFRAMES)}
              style={{ marginLeft: 8 }}
            >
              Reset timeframes
            </button>
          )}
          {chartViewMode === "focus" && (
            <select
              value={focusTimeframe}
              onChange={(e) => setFocusTimeframe(e.target.value as TimeframeId)}
              className="tf-select"
            >
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
          <strong>{selected.candidate.side.toUpperCase()}</strong>. Level overlays
          source:{" "}
          {tradableOverlay
            ? "selected trade"
            : "hidden (watch-only / blocked)"}
          .
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
  const { selected } = useWorkstation();
  const frameId = `tv-${symbol.replace(/[^A-Z0-9]/gi, "_")}-${timeframe}`;
  const url = tradingViewEmbedUrl(symbol, timeframe, frameId);
  const tfMeta = TIMEFRAMES.find((t) => t.id === timeframe)!;

  return (
    <div className="chart-cell">
      <div className="chart-cell-head">
        <strong>{tfMeta.label}</strong>
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
      <div className="chart-frame-wrap">
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
      </div>
    </div>
  );
}
