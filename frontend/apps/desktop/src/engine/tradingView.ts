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
//
// The free TradingView embed does not render CME / NYMEX / COMEX futures
// (it shows "Symbol only available on TradingView"). We use the TVC index
// / commodity proxy that correlates closely with each micro future and is
// rendered for free embeds. The `PROXY_DISCLOSURE` flag is exposed so the
// UI can surface that the chart is a proxy, not the actual futures feed.
export type ChartFeedMode = "proxy" | "futures";

// Default proxies are index / commodity CFDs that price at (or very
// near) the same level as the underlying futures, so entry / stop /
// TP overlays from the decision engine line up with the chart scale.
// Capital.com index CFDs render reliably on the free TradingView
// widget embed; ETF equivalents are retained as alternates in case
// the primary symbol is blocked in a particular account.
const PROXY_SYMBOL_MAP: Record<string, { symbol: string; proxyLabel: string }> = {
  MES: { symbol: "CAPITALCOM:US500", proxyLabel: "S&P 500 CFD (US500) — matches MES price scale" },
  MNQ: { symbol: "CAPITALCOM:US100", proxyLabel: "Nasdaq 100 CFD (US100) — matches MNQ price scale" },
  MYM: { symbol: "CAPITALCOM:US30", proxyLabel: "Dow Jones CFD (US30) — matches MYM price scale" },
  M2K: { symbol: "CAPITALCOM:US2000", proxyLabel: "Russell 2000 CFD (US2000) — matches M2K price scale" },
  MCL: { symbol: "TVC:USOIL", proxyLabel: "WTI Crude CFD (USOIL) — matches MCL price scale" },
  MGC: { symbol: "OANDA:XAUUSD", proxyLabel: "Gold spot (XAU/USD) — matches MGC price scale" },
};

const FUTURES_SYMBOL_MAP: Record<string, string> = {
  MES: "CME_MINI:MES1!",
  MNQ: "CME_MINI:MNQ1!",
  MYM: "CBOT_MINI:MYM1!",
  M2K: "CME_MINI:M2K1!",
  MCL: "NYMEX:MCL1!",
  MGC: "COMEX:MGC1!",
};

export function tradingViewSymbol(
  instrument: Instrument,
  mode: ChartFeedMode = "proxy",
): string {
  if (mode === "futures") {
    return FUTURES_SYMBOL_MAP[instrument.symbol] ?? instrument.symbol;
  }
  return PROXY_SYMBOL_MAP[instrument.symbol]?.symbol ?? instrument.symbol;
}

export function tradingViewProxyLabel(instrument: Instrument): string | undefined {
  return PROXY_SYMBOL_MAP[instrument.symbol]?.proxyLabel;
}

// Ordered alternate-symbol list per instrument, used by the chart
// fallback when the primary symbol cannot render.
const ALTERNATES: Record<string, string[]> = {
  MES: ["CAPITALCOM:US500", "FX_IDC:SPXUSD", "TVC:SPX", "AMEX:SPY"],
  MNQ: ["CAPITALCOM:US100", "FX_IDC:NDXUSD", "TVC:NDX", "NASDAQ:QQQ"],
  MYM: ["CAPITALCOM:US30", "TVC:DJI", "AMEX:DIA"],
  M2K: ["CAPITALCOM:US2000", "TVC:RUT", "AMEX:IWM"],
  MCL: ["TVC:USOIL", "CAPITALCOM:OIL_CRUDE", "AMEX:USO", "NYMEX:CL1!"],
  MGC: ["OANDA:XAUUSD", "TVC:GOLD", "CAPITALCOM:GOLD", "AMEX:GLD", "COMEX:GC1!"],
};

export function tradingViewAlternates(
  instrument: Instrument,
  current: string,
): string[] {
  const list = ALTERNATES[instrument.symbol] ?? [];
  return list.filter((s) => s !== current);
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
