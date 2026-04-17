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
  target: number; // equivalent to tp2
  tp1: number;    // partial scale-out (50% of full R target)
  tp2: number;    // full R target (same as `target`)
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

// --- Control Center additions ---

export type ExecutionState =
  | "draft"
  | "approved"
  | "reduced_approved"
  | "sent"
  | "blocked"
  | "watch_only";

export type AgentState =
  | "idle"
  | "running"
  | "waiting"
  | "blocked"
  | "completed"
  | "escalated";

export type AgentSpecialty =
  | "architecture"
  | "strategy_taxonomy"
  | "research"
  | "decision_engine"
  | "risk_sizing"
  | "validation"
  | "pine_generation"
  | "execution_routing"
  | "control_center"
  | "prop_firm_gating"
  | "chart_display"
  | "agent_supervisor"
  | "journal"
  | "qa";

export interface AgentStatus {
  name: string;              // cute nickname (e.g. "Dex")
  title: string;             // role title (e.g. "Decision Engineer")
  avatar: string;            // emoji avatar
  specialty: AgentSpecialty;
  state: AgentState;
  currentTask: string;
  summary: string;
  lastUpdate: string;
  confidence?: number;        // 0..1
  needsUserApproval: boolean;
  warning?: string;
}

export type PropFirmEntryState =
  | "draft"
  | "approved"
  | "reduced_approved"
  | "blocked"
  | "watch_only"
  | "sent";

export interface PropFirmCompliance {
  dailyLossPressure: number;     // 0..1
  drawdownPressure: number;      // 0..1
  consistencyPressure: number;   // 0..1
  evaluationCaution: number;     // 0..1
  payoutStability: number;       // 0..1
  passing: boolean;
  blockers: string[];
  cautions: string[];
}

export interface PropFirmControl {
  rawScore: number;
  adjustedScore: number;
  calculatedContracts: number;
  qualityCap: number;
  finalContracts: number;
  entryState: PropFirmEntryState;
  blockReason?: string;
  validationFactors: {
    drawdownRisk: number;
    payoutStability: number;
    accountPressure: number;
    consistencyPenalty: number;
  };
  compliance: PropFirmCompliance;
  routeReady: boolean;
}

export interface ChartContext {
  instrument: Instrument;
  strategy: StrategyId;
  regime: RegimeId;
  side: Side;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  tradingViewSymbol: string;
  timeframes: TimeframeId[];
}

export type TimeframeId = "1" | "5" | "15" | "60" | "240" | "D";

export interface TimeframeMeta {
  id: TimeframeId;
  label: string;
}

// --- Workstation page model ---

export type WorkstationPage =
  | "desk"
  | "charts"
  | "control_center"
  | "quick_trade"
  | "pine_studio"
  | "journal"
  | "capital_lab"
  | "settings";

export interface PageMeta {
  id: WorkstationPage;
  label: string;
  role: string;
}

// --- Operational events / audit trail ---

export type EventKind =
  | "instrument_selected"
  | "approved"
  | "sent"
  | "kill_switch_armed"
  | "kill_switch_disarmed"
  | "quorum_toggled"
  | "hard_block_triggered"
  | "chart_unavailable"
  | "chart_retried"
  | "auto_pilot_armed"
  | "auto_pilot_disarmed"
  | "auto_pilot_skipped"
  | "auto_pilot_executed"
  | "manual_trade_sent"
  | "manual_trade_failed";

export interface EventEntry {
  id: string;
  kind: EventKind;
  timestamp: string;
  symbol?: string;
  detail: string;
}

// --- Route health (TradersPost / Tradovate mock) ---

export type RouteStatus = "ok" | "degraded" | "down";

export interface RouteHealth {
  tradersPost: { status: RouteStatus; lastCheck: string; note: string };
  tradovate: { status: RouteStatus; lastCheck: string; note: string };
}
