import type { Instrument } from "./types.js";

// Each futures instrument in the app is backed by a liquid ETF that
// tracks the same underlying. We fetch the ETF quote on Alpaca, then
// scale it into "futures price space" so the decision engine's
// entry/stop/target math stays in the contract's native price units.
//
// The `multiplier` is roughly the ratio (futures level) / (ETF price)
// at the time of writing. ETFs drift vs. futures over time due to
// dividends, roll, and tracking error — if the mapping feels off,
// rerun the calibration step (README) or bump the multiplier here.

export interface SymbolMapping {
  futures: Instrument;
  etf: string;             // Alpaca symbol to fetch
  multiplier: number;      // futures_price ≈ etf_price * multiplier
  yahooSymbol: string;     // Yahoo Finance symbol (ES=F, NQ=F, …)
  twelveDataSymbol: string;   // Twelve Data symbol to fetch (futures root or ETF proxy)
  twelveDataNeedsScale?: boolean; // true when twelveDataSymbol is an ETF — scale bars by multiplier before caching
}

export const SYMBOL_MAPPINGS: SymbolMapping[] = [
  {
    futures: {
      symbol: "MES", name: "Micro E-mini S&P 500",
      tickSize: 0.25, tickValue: 1.25, pointValue: 5,
      session: "RTH", category: "equity_future",
    },
    etf: "SPY",
    multiplier: 10.0, // SPY ≈ S&P / 10; MES tracks S&P × 1
    yahooSymbol: "ES=F",
    twelveDataSymbol: "ES",
  },
  {
    futures: {
      symbol: "MNQ", name: "Micro E-mini Nasdaq-100",
      tickSize: 0.25, tickValue: 0.5, pointValue: 2,
      session: "RTH", category: "equity_future",
    },
    etf: "QQQ",
    multiplier: 50.0, // QQQ ≈ Nasdaq / 40; MNQ tracks Nasdaq × 1
    yahooSymbol: "NQ=F",
    twelveDataSymbol: "QQQ", twelveDataNeedsScale: true,
  },
  {
    futures: {
      symbol: "MYM", name: "Micro E-mini Dow",
      tickSize: 1.0, tickValue: 0.5, pointValue: 0.5,
      session: "RTH", category: "equity_future",
    },
    etf: "DIA",
    multiplier: 100.0, // DIA ≈ Dow / 100
    yahooSymbol: "YM=F",
    twelveDataSymbol: "DIA", twelveDataNeedsScale: true,
  },
  {
    futures: {
      symbol: "M2K", name: "Micro E-mini Russell 2000",
      tickSize: 0.1, tickValue: 0.5, pointValue: 5,
      session: "RTH", category: "equity_future",
    },
    etf: "IWM",
    multiplier: 10.0,
    yahooSymbol: "RTY=F",
    twelveDataSymbol: "IWM", twelveDataNeedsScale: true,
  },
  {
    futures: {
      symbol: "MCL", name: "Micro WTI Crude",
      tickSize: 0.01, tickValue: 1.0, pointValue: 100,
      session: "ETH", category: "energy_future",
    },
    etf: "USO",
    multiplier: 0.85, // USO tracks WTI but with contango decay; tune as needed
    yahooSymbol: "CL=F",
    twelveDataSymbol: "CL",
  },
  {
    futures: {
      symbol: "MGC", name: "Micro Gold",
      tickSize: 0.1, tickValue: 1.0, pointValue: 10,
      session: "ETH", category: "metal_future",
    },
    etf: "GLD",
    multiplier: 11.0, // GLD ≈ gold_price / 10 per share; small tracking offset
    yahooSymbol: "GC=F",
    twelveDataSymbol: "GC",
  },
];

// Utility to scale an ETF-space price into futures-space
export function scale(etfPrice: number, multiplier: number): number {
  return parseFloat((etfPrice * multiplier).toFixed(4));
}
