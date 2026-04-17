import type { SelectedSignal } from "./types";
import type { PreMarketBrief } from "./preMarketChecklist";
import { STRATEGIES } from "./strategies";

// Produce a day-specific Pine v5 strategy implementation anchored to the
// selected playbook, instrument, and session levels. No random strategies.
export function generatePineScript(signal: SelectedSignal, brief?: PreMarketBrief): string {
  const meta = STRATEGIES[signal.candidate.strategy];
  const { candidate, context } = signal;
  const sideLabel = candidate.side === "long" ? "long" : "short";
  const stopDist = Number(candidate.stopDistance.toFixed(4));
  const targetR = Number(meta.defaultTargetR.toFixed(2));
  const tick = context.instrument.tickSize;

  const briefLevel = brief?.technicalLevels.find(
    (tl) => tl.symbol === context.instrument.symbol,
  );
  const overnight = brief?.overnightSummary.find(
    (o) => o.symbol === context.instrument.symbol,
  );
  const events = brief?.economicCalendar ?? [];
  const readiness = brief?.mentalReadiness;

  const reggieBlock = brief
    ? `\n// ---- Reggie pre-market brief (${brief.date}) ----
// Readiness: ${readiness?.sessionReadiness.toUpperCase() ?? "unknown"} · max trades: ${readiness?.suggestedMaxTrades ?? "—"}
// Overnight bias: ${overnight?.sessionBias ?? "—"} · gap: ${overnight?.gapType.replace("_", " ") ?? "—"} ${overnight?.gapSize.toFixed(2) ?? ""} pts
// Regime support: ${overnight?.regimeSupport ? "YES" : "NO"}
// Events today: ${events.length === 0 ? "none" : events.map(e => `${e.time} ${e.event} [${e.impact}]`).join(" | ")}
// Notes: ${readiness?.notes.join(" | ") ?? "—"}\n`
    : "";

  const overnightLines = briefLevel
    ? `\n// ---- Overnight reference levels (Reggie) ----
onH = ${briefLevel.overnightHigh.toFixed(4)}
onL = ${briefLevel.overnightLow.toFixed(4)}\n`
    : "";

  const keyLevelPlots = briefLevel
    ? `\n// ---- Key levels (Reggie · ${briefLevel.keyLevels.length} levels) ----\n` +
      briefLevel.keyLevels
        .map((lvl) => {
          const col =
            lvl.type === "resistance" ? "color.new(color.red, 60)" :
            lvl.type === "support"    ? "color.new(color.green, 60)" :
            "color.new(color.yellow, 40)";
          return `hline(${lvl.price.toFixed(4)}, title="${lvl.label}", color=${col}, linestyle=hline.style_dashed)`;
        })
        .join("\n") + "\n"
    : "";

  return `//@version=5
// Nextrade AI — generated for ${context.instrument.symbol}
// Playbook: ${meta.label} (${meta.family})
// Regime: ${signal.context.regime}
// Generated: ${signal.timestamp}
${reggieBlock}strategy("Nextrade_${context.instrument.symbol}_${candidate.strategy}", overlay=true,
         calc_on_every_tick=false, pyramiding=0, process_orders_on_close=true,
         default_qty_type=strategy.fixed, default_qty_value=${signal.sizing.finalContracts})

// ---- Context levels (locked from session) ----
orHigh = ${context.openingRange.high}
orLow  = ${context.openingRange.low}
pdH    = ${context.priorHigh}
pdL    = ${context.priorLow}
vwapP  = ${context.vwap}
atrP   = ${context.atr}
${overnightLines}
// ---- Signal parameters ----
entryPrice  = ${candidate.entry}
stopPrice   = ${candidate.stop}
targetPrice = ${candidate.target}
stopDist    = ${stopDist}
targetR     = ${targetR}

// ---- Entry trigger: ${meta.entryDescription.replace(/"/g, '\\"')} ----
longTrigger  = ${buildTrigger(signal, "long")}
shortTrigger = ${buildTrigger(signal, "short")}

if (${sideLabel === "long" ? "longTrigger" : "shortTrigger"})
    strategy.entry("${candidate.strategy}_${sideLabel}", ${sideLabel === "long" ? "strategy.long" : "strategy.short"})
    strategy.exit("exit", from_entry="${candidate.strategy}_${sideLabel}", stop=stopPrice, limit=targetPrice)

// ---- Invalidation: ${meta.invalidation.replace(/"/g, '\\"')} ----
plot(entryPrice, title="Entry", color=color.new(color.teal, 0))
plot(stopPrice,  title="Stop",  color=color.new(color.red, 0))
plot(targetPrice,title="Target",color=color.new(color.lime, 0))
${keyLevelPlots}
// ---- Alerts ----
alertcondition(${sideLabel === "long" ? "longTrigger" : "shortTrigger"},
  title="NEXTRADE_${context.instrument.symbol}_${candidate.strategy}_${sideLabel.toUpperCase()}",
  message='${buildAlertPayload(signal)}')
// Minimum tick: ${tick}
`;
}

function buildTrigger(signal: SelectedSignal, side: "long" | "short"): string {
  const { candidate, context } = signal;
  const up = side === "long";
  switch (candidate.strategy) {
    case "opening_range_breakout":
      return up
        ? "close > orHigh and close[1] <= orHigh"
        : "close < orLow and close[1] >= orLow";
    case "expansion_breakout":
      return up
        ? "close > pdH and (high - low) > 1.4 * atrP"
        : "close < pdL and (high - low) > 1.4 * atrP";
    case "breakout_continuation":
      return up
        ? "low <= pdH and close > pdH and close[1] > pdH"
        : "high >= pdL and close < pdL and close[1] < pdL";
    case "trend_pullback_continuation":
      return up
        ? "low <= vwapP and close > vwapP"
        : "high >= vwapP and close < vwapP";
    case "vwap_reclaim_mean_reversion":
      return up
        ? `close > vwapP and close[1] < vwapP`
        : `close < vwapP and close[1] > vwapP`;
    case "balanced_auction_rotation":
    case "balanced_range":
      return up
        ? "close > pdL and close[1] <= pdL"
        : "close < pdH and close[1] >= pdH";
    case "counter_trend_fade_failed_breakout":
      return up
        ? "high > pdH and close < pdH"
        : "low < pdL and close > pdL";
    case "liquidity_sweep_and_reclaim":
      return up
        ? "low < pdL and close > pdL"
        : "high > pdH and close < pdH";
    case "reversal_mean_reversion":
      return up
        ? `close > ${context.price} and close > close[1] and close[1] < close[2]`
        : `close < ${context.price} and close < close[1] and close[1] > close[2]`;
    default:
      return "false";
  }
}

export function buildAlertPayload(signal: SelectedSignal): string {
  const { candidate, sizing } = signal;
  return JSON.stringify({
    ticker: candidate.instrument.symbol,
    action: candidate.side === "long" ? "buy" : "sell",
    orderType: "limit",
    price: candidate.entry,
    quantity: sizing.finalContracts,
    stopLoss: { type: "stop", stopPrice: candidate.stop },
    takeProfit: { limitPrice: candidate.target },
    strategy: candidate.strategy,
    regime: candidate.regime,
    signalId: signal.id,
  });
}
