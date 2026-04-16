import type { ExecutionOutputs, SelectedSignal, TradersPostDispatch } from "./types";

export function formatExecution(signal: SelectedSignal): ExecutionOutputs {
  const tradersPost = buildTradersPost(signal);
  const isWatch = signal.sizing.finalContracts === 0;
  return {
    telegram: buildTelegram(signal),
    keyValue: buildKeyValue(signal),
    json: JSON.stringify(tradersPost, null, 2),
    tradersPost,
    state: isWatch ? "watch_only" : "draft",
  };
}

function buildTelegram(signal: SelectedSignal): string {
  const c = signal.candidate;
  const s = signal.sizing;
  const header = signal.hardBlock.active
    ? `🚫 HARD BLOCK (${signal.hardBlock.reason})`
    : signal.state === "watch_only"
      ? "👀 Watch Only"
      : signal.state === "stand_aside"
        ? "⏸ Stand Aside"
        : signal.state === "reduced_size"
          ? "🟡 Reduced Size"
          : "🟢 Best Available";
  return [
    `${header} — ${c.instrument.symbol} ${c.side.toUpperCase()}`,
    `Strategy: ${c.strategy}  |  Regime: ${c.regime}`,
    `Entry ${round(c.entry)}  Stop ${round(c.stop)}  Target ${round(c.target)}`,
    `Contracts: ${s.finalContracts}  (risk ${s.riskContracts} / cap ${s.qualityCap})`,
    `Adj. Score: ${signal.adjustedScore.toFixed(2)}  Raw: ${c.rawScore.toFixed(2)}`,
    `Reasons: ${c.reasons.join("; ") || "—"}`,
    `SignalId: ${signal.id}`,
  ].join("\n");
}

function buildKeyValue(signal: SelectedSignal): string {
  const c = signal.candidate;
  const s = signal.sizing;
  return [
    `SIGNAL_ID=${signal.id}`,
    `SYMBOL=${c.instrument.symbol}`,
    `SIDE=${c.side}`,
    `STRATEGY=${c.strategy}`,
    `REGIME=${c.regime}`,
    `ENTRY=${round(c.entry)}`,
    `STOP=${round(c.stop)}`,
    `TARGET=${round(c.target)}`,
    `CONTRACTS=${s.finalContracts}`,
    `RISK_CONTRACTS=${s.riskContracts}`,
    `QUALITY_CAP=${s.qualityCap}`,
    `ADJ_SCORE=${signal.adjustedScore.toFixed(4)}`,
    `RAW_SCORE=${c.rawScore.toFixed(4)}`,
    `STATE=${signal.state}`,
    `HARD_BLOCK=${signal.hardBlock.active ? signal.hardBlock.reason : "none"}`,
  ].join("\n");
}

function buildTradersPost(signal: SelectedSignal): TradersPostDispatch {
  const c = signal.candidate;
  return {
    ticker: c.instrument.symbol,
    action: c.side === "long" ? "buy" : "sell",
    orderType: "limit",
    price: round(c.entry),
    quantity: signal.sizing.finalContracts,
    stopLoss: { type: "stop", stopPrice: round(c.stop) },
    takeProfit: { limitPrice: round(c.target) },
    sentiment: c.side === "long" ? "bullish" : "bearish",
    strategy: c.strategy,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
