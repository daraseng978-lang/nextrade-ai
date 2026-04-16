// Shared engine types. All downstream panels consume these.

export type RegimeId =
  | "strong_trend_up"
  | "strong_trend_down"
  | "balanced_range"
  | "expansion_breakout"
  | "reversal_mean_reversion"
  | "low_quality_no_trade"
  | "event_driven_high_risk";

export type StrategyId =
  | "opening_range_breakout"
  | "expansion_breakout"
  | "breakout_continuation"
  | "trend_pullback_continuation"
  | "balanced_auction_rotation"
  | "balanced_range"
  | "vwap_reclaim_mean_reversion"
  | "counter_trend_fade_failed_breakout"
  | "liquidity_sweep_and_reclaim"
  | "reversal_mean_reversion"
  | "low_quality_no_trade"
  | "event_driven_high_risk";

export type Side = "long" | "short" | "flat";

export type TradeState =
  | "best_available"
  | "reduced_size"
  | "watch_only"
  | "stand_aside"
  | "hard_blocked";

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
  regimeConfidence: number; // 0..1
  liquidityScore: number;   // 0..1
  eventRisk: number;        // 0..1
  spread: number;
}

export interface StrategyMeta {
  id: StrategyId;
  label: string;
  family: "trend" | "breakout" | "range" | "reversal" | "passive";
  description: string;
  entryDescription: string;
  invalidation: string;
  defaultStopAtrMult: number;
  defaultTargetR: number;
}

export interface PlaybookCandidate {
  strategy: StrategyId;
  instrument: Instrument;
  regime: RegimeId;
  side: Side;
  entry: number;
  stop: number;
  target: number;
  stopDistance: number;
  rMultiple: number;
  rawScore: number;       // 0..1
  reasons: string[];
}

export interface ValidationProfile {
  drawdownRisk: number;      // 0..1 (higher = worse)
  payoutStability: number;   // 0..1 (higher = better)
  accountPressure: number;   // 0..1 (higher = worse)
  consistencyPenalty: number; // 0..1 (higher = worse)
  commentary: string[];
}

export interface SizingResult {
  riskContracts: number;
  qualityCap: number;
  finalContracts: number;
  perContractRisk: number;
  accountRiskDollars: number;
  notes: string[];
}

export interface HardBlock {
  active: boolean;
  reason?:
    | "major_event_lockout"
    | "kill_switch"
    | "invalid_data"
    | "extreme_volatility";
  detail?: string;
}

export interface SelectedSignal {
  id: string;
  timestamp: string;
  candidate: PlaybookCandidate;
  context: InstrumentContext;
  validation: ValidationProfile;
  adjustedScore: number;     // 0..1
  sizing: SizingResult;
  state: TradeState;
  hardBlock: HardBlock;
  runnerUps: PlaybookCandidate[];
}

export interface AccountRiskConfig {
  accountEquity: number;
  riskPerTradePct: number;   // e.g. 0.005 = 0.5%
  maxDailyLossPct: number;
  consistencyTargetPct: number;
}

export interface ExecutionOutputs {
  telegram: string;
  keyValue: string;
  json: string;
  tradersPost: TradersPostDispatch;
  state: "draft" | "approved" | "sent" | "watch_only";
}

export interface TradersPostDispatch {
  ticker: string;
  action: "buy" | "sell";
  orderType: "market" | "limit";
  quantity: number;
  price?: number;
  stopLoss: { type: "stop"; stopPrice: number };
  takeProfit: { limitPrice: number };
  sentiment: "bullish" | "bearish";
  strategy: StrategyId;
}
