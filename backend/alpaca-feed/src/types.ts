// Subset of the frontend InstrumentContext shape. Kept in sync by hand.
// When the frontend InstrumentContext changes, update here too.

export type RegimeId =
  | "strong_trend_up"
  | "strong_trend_down"
  | "balanced_range"
  | "expansion_breakout"
  | "reversal_mean_reversion"
  | "low_quality_no_trade"
  | "event_driven_high_risk";

export interface Instrument {
  symbol: string;
  name: string;
  tickSize: number;
  tickValue: number;
  pointValue: number;
  session: "RTH" | "ETH";
  category: "equity_future" | "energy_future" | "metal_future" | "crypto_future";
}

export interface InstrumentContext {
  instrument: Instrument;
  price: number;
  atr: number;
  vwap: number;
  openingRange: { high: number; low: number };
  priorHigh: number;
  priorLow: number;
  regime: RegimeId;
  regimeConfidence: number;
  liquidityScore: number;
  eventRisk: number;
  spread: number;
  // Quality-layer optional fields. Backend computes crude POC/VAH/VAL
  // from intraday bars and passes the tail of bars so the frontend can
  // run price-action-trigger logic without refetching raw bars.
  poc?: number;
  vah?: number;
  val?: number;
  recentBars?: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>;
  avgBarVolume?: number;
  vwapSlope?: number;
  footprintAvailable?: boolean;
  deltaLastBar?: number;
  cumulativeDelta?: number;
  // Sanity-check flags — true when priorH/L was swapped in for garbage
  // input (e.g. stale IEX daily aggregates).
  priorLevelsStale?: boolean;
  priorLevelsSource?: "alpaca_iex" | "yahoo" | "atr_fallback";
}

export interface AlpacaBar {
  t: string;  // ISO timestamp
  o: number;  // open
  h: number;  // high
  l: number;  // low
  c: number;  // close
  v: number;  // volume
  n?: number; // trade count
  vw?: number;// VWAP from feed
}

export interface AlpacaLatestQuote {
  ap: number; // ask price
  bp: number; // bid price
  as: number; // ask size
  bs: number; // bid size
  t: string;  // timestamp
}
