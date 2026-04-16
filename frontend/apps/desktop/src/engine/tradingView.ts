import type {
  ChartContext,
  Instrument,
  SelectedSignal,
  TimeframeId,
  TimeframeMeta,
} from "./types";

// Map our instruments to TradingView symbols for embed use.
// Note: TradingView iframe is a sandboxed third-party widget — we cannot
// draw levels inside it from our domain. The UI renders level overlays as
// a legend card alongside each chart, sourced from the same ChartContext.
const SYMBOL_MAP: Record<string, string> = {
  MES: "CME_MINI:MES1!",
  MNQ: "CME_MINI:MNQ1!",
  MYM: "CBOT_MINI:MYM1!",
  M2K: "CME_MINI:M2K1!",
  MCL: "NYMEX:MCL1!",
  MGC: "COMEX:MGC1!",
};

export function tradingViewSymbol(instrument: Instrument): string {
  return SYMBOL_MAP[instrument.symbol] ?? instrument.symbol;
}

export const TIMEFRAMES: TimeframeMeta[] = [
  { id: "1", label: "1m" },
  { id: "5", label: "5m" },
  { id: "15", label: "15m" },
  { id: "60", label: "1h" },
  { id: "240", label: "4h" },
  { id: "D", label: "1D" },
];

export const DEFAULT_QUAD_TIMEFRAMES: TimeframeId[] = ["1", "5", "15", "60"];

export function buildChartContext(
  signal: SelectedSignal,
  timeframes: TimeframeId[] = DEFAULT_QUAD_TIMEFRAMES,
): ChartContext {
  const c = signal.candidate;
  return {
    instrument: c.instrument,
    strategy: c.strategy,
    regime: c.regime,
    side: c.side,
    entry: c.entry,
    stop: c.stop,
    tp1: c.tp1,
    tp2: c.tp2,
    tradingViewSymbol: tradingViewSymbol(c.instrument),
    timeframes,
  };
}

// Build the embed URL for a TradingView chart widget.
export function tradingViewEmbedUrl(
  symbol: string,
  interval: TimeframeId,
  frameId: string,
): string {
  const params = new URLSearchParams({
    frameElementId: frameId,
    symbol,
    interval,
    hidesidetoolbar: "1",
    symboledit: "0",
    saveimage: "0",
    toolbarbg: "0b0f15",
    theme: "dark",
    style: "1",
    timezone: "Etc/UTC",
    locale: "en",
    withdateranges: "1",
    studies: "[]",
    utm_source: "nextrade",
    utm_medium: "widget",
  });
  return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
}
