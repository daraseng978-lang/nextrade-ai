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
  // --- Quality-layer inputs (optional — degrades gracefully) -----------
  // Crude volume profile computed by the backend from intraday bars.
  // Real profile needs tick data; POC/VAH/VAL here are bar-level proxies.
  poc?: number;
  vah?: number;
  val?: number;
  // Recent OHLCV for price-action + volume trigger detection (latest last).
  recentBars?: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>;
  avgBarVolume?: number;
  // VWAP slope — positive = rising, negative = falling.
  vwapSlope?: number;
  // Footprint / order-flow fields — optional. If footprintAvailable is
  // false or missing, downstream logic degrades to reduced-mode.
  footprintAvailable?: boolean;
  deltaLastBar?: number;
  cumulativeDelta?: number;
  // Prior H/L provenance — when the feed can't produce reliable daily
  // bars (Alpaca IEX free tier returns ancient aggregates) the backend
  // swaps in ATR-based placeholders and flags them as stale here. The
  // decision engine can still produce signals; strategies that depend
  // on prior H/L downgrade confidence and show a warning.
  priorLevelsStale?: boolean;
  priorLevelsSource?: "alpaca_iex" | "yahoo" | "atr_fallback";
}

// ===== Quality layer types ==================================================

export type VwapPreference = "above" | "below" | "reclaim_above" | "reclaim_below" | "flat" | "any";
export type ProfileLocationTag =
  | "poc" | "vah" | "val"
  | "hvn" | "lvn"
  | "range_edge" | "value_edge"
  | "failed_auction_edge"
  | "random"
  | "unknown";
export type TriggerKind =
  | "breakout_close" | "retest_hold" | "rejection"
  | "reclaim" | "sweep_reclaim" | "structure_break";
export type FootprintSignal =
  | "absorption" | "exhaustion"
  | "imbalance_with" | "imbalance_against"
  | "delta_divergence" | "none";
export type StructureStopType =
  | "or_invalidation" | "retest_fail" | "sweep_extreme"
  | "range_opposite_edge" | "swing_structure"
  | "vwap_break" | "atr_only";

// Rating, -1..1. Positive supports the trade; 0 is neutral; negative opposes.
export type QualityRating = number;

export interface VwapExpectation {
  preference: VwapPreference;
  slopeMatters: boolean;
}
export interface ProfileExpectation {
  preferredLocations: ProfileLocationTag[];
  // true for range/reversal (location is the thesis); false for breakout/trend
  // where trigger quality carries the setup.
  requiresLocation: boolean;
}
export interface FootprintExpectation {
  preferredSignals: FootprintSignal[];
}

// Per-strategy metadata for the 4-tool quality model. Never universal;
// each strategy family weights these differently (see evaluateSetupQuality).
export interface StrategyQualityMeta {
  primaryTrigger: TriggerKind;
  vwap: VwapExpectation;
  profile: ProfileExpectation;
  footprint: FootprintExpectation;
  stopType: StructureStopType;
  firstStructureTargets: ProfileLocationTag[];
  abortConditions: string[];
}

export interface StrategyEdge {
  winRate: number;      // 0..1 — historical/expected win rate
  avgWinR: number;      // avg R multiple on winners
  avgLossR: number;     // avg R multiple on losers (usually 1.0 with hard stop)
  tradesPerDay: number; // typical trigger count per session
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
  edge: StrategyEdge;
  // Optional quality metadata — passive strategies omit it.
  quality?: StrategyQualityMeta;
}

export interface ScoreBreakdown {
  regime: number;      // regime fit contribution
  confidence: number;  // regime confidence contribution
  liquidity: number;   // liquidity contribution
  edge: number;        // Capital Lab + journal blended edge contribution
  side: number;        // side alignment contribution
  event: number;       // event-risk penalty (negative)
  crossMarket: number; // VIX/DXY risk-on/off adjustment (±, can be 0)
  trigger: number;     // Price Action + Volume trigger quality contribution
  location: number;    // Volume Profile location quality contribution
  footprint: number;   // Footprint bonus (only positive; absent = 0)
  total: number;       // clamped to [0..1]
  realizedN: number;   // number of closed journal trades feeding the edge
}

// Quality-layer result attached to every generated candidate so the UI
// can show operators WHY a setup was graded the way it was.
export interface SetupQuality {
  triggerQuality: QualityRating;      // -1..1 — price action + volume
  locationQuality: QualityRating;     // -1..1 — volume profile location
  vwapContext: {
    rating: QualityRating;            // -1..1 — alignment with preference
    alignment: "strong" | "mild" | "neutral" | "opposed";
    reason: string;
  };
  profileLocation: {
    tag: ProfileLocationTag;
    rating: QualityRating;
    reason: string;
  };
  footprintConfirmation: {
    available: boolean;
    signal: FootprintSignal;
    bonus: number;                    // 0..0.1 — positive-only bonus
    reason: string;
  };
  triggerReason: string;
}

export type RegimeBias = "risk_on" | "risk_off" | "neutral";

export interface CrossMarketTicker {
  symbol: string;
  price: number;
  previousClose: number;
  changePct: number;
}

export interface CrossMarketSnapshot {
  vix: CrossMarketTicker | null;
  dxy: CrossMarketTicker | null;
  tnx: CrossMarketTicker | null;
  regimeBias: RegimeBias;
  summary: string;
}

export interface PlaybookCandidate {
  strategy: StrategyId;
  instrument: Instrument;
  regime: RegimeId;
  side: Side;
  entry: number;
  stop: number;
  target: number; // equivalent to tp2
  tp1: number;    // partial scale-out (first structural target)
  tp2: number;    // full R target (same as `target`)
  stopDistance: number;
  rMultiple: number;
  rawScore: number;       // 0..1
  reasons: string[];
  scoreBreakdown?: ScoreBreakdown;
  // Quality-layer annotations — optional so legacy fixtures still type-check.
  quality?: SetupQuality;
  structureStopType?: StructureStopType;
  tp1StructureTag?: ProfileLocationTag | "vwap" | "or" | "prior_high" | "prior_low" | "none";
  abortConditions?: string[];
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
