// Journal engine: expanded trade-log entry shape + performance metrics.
// Every essential component of a professional trading journal lives here:
// - Trade details (quantitative)
// - Strategy and rationale
// - Risk management
// - Psychological / emotional state
// - Visual documentation (chart URLs)
// - Performance metrics (computed)

import type { RegimeId, Side, StrategyId, TradeState } from "./types";

export type TradeStatus = "open" | "win" | "loss" | "breakeven" | "skipped";

export type EmotionTag =
  | "disciplined"
  | "focused"
  | "confident"
  | "hesitant"
  | "impulsive"
  | "fearful"
  | "greedy"
  | "frustrated";

export const EMOTION_TAGS: EmotionTag[] = [
  "disciplined", "focused", "confident",
  "hesitant", "impulsive", "fearful", "greedy", "frustrated",
];

export interface JournalEntry {
  id: string;
  timestamp: string;

  // --- Trade details (quantitative — auto populated at send) ---
  symbol: string;
  side: Side;
  contracts: number;
  entryPrice: number;
  stopPrice: number;
  tp1Price: number;
  tp2Price: number;
  stopDistance: number;
  rMultiple: number;
  perContractRisk: number;    // dollars risked per contract
  accountRiskDollars: number; // total risk on the trade
  notionalDollars: number;    // contracts × pointValue × entry

  // --- Strategy & rationale (auto populated) ---
  strategy: StrategyId;
  strategyLabel: string;
  regime: RegimeId;
  regimeConfidence: number;
  rawScore: number;
  adjustedScore: number;
  playbookReasons: string[];
  state: TradeState | string;

  // --- Outcome (manual — recorded after the trade closes) ---
  status: TradeStatus;
  exitPrice?: number;
  exitTime?: string;
  outcomeR?: number;        // realized R multiple (negative on losses)
  pnlDollars?: number;

  // --- Risk management discipline (manual) ---
  followedPlan?: boolean;
  deviationNotes?: string;

  // --- Psychological state (manual) ---
  mindsetBefore?: string;
  mindsetDuring?: string;
  mindsetAfter?: string;
  emotions?: EmotionTag[];

  // --- Visual documentation (manual) ---
  chartUrl?: string;          // external screenshot host
  tradingViewUrl?: string;    // TradingView chart deep link
  entryScreenshotUrl?: string;
  exitScreenshotUrl?: string;

  // --- Free-form lesson notes ---
  notes?: string;
}

// --------- Performance metrics ---------

export interface JournalMetrics {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  skipped: number;
  winRate: number;            // 0..1 over closed trades
  avgWinR: number;            // mean R of winning trades (positive)
  avgLossR: number;           // mean R of losing trades (negative)
  expectancyR: number;        // avg R per closed trade
  profitFactor: number;       // gross profit / gross loss (Infinity if no losses)
  totalR: number;
  totalPnl: number;
  maxDrawdownR: number;       // worst running-equity drawdown in R
  largestWinR: number;
  largestLossR: number;
  byStrategy: Record<string, { count: number; totalR: number; winRate: number }>;
  byRegime:   Record<string, { count: number; totalR: number; winRate: number }>;
}

const EMPTY_METRICS: JournalMetrics = {
  totalTrades: 0, openTrades: 0, closedTrades: 0,
  wins: 0, losses: 0, breakevens: 0, skipped: 0,
  winRate: 0, avgWinR: 0, avgLossR: 0,
  expectancyR: 0, profitFactor: 0,
  totalR: 0, totalPnl: 0,
  maxDrawdownR: 0, largestWinR: 0, largestLossR: 0,
  byStrategy: {}, byRegime: {},
};

export function buildJournalMetrics(entries: JournalEntry[]): JournalMetrics {
  if (entries.length === 0) return EMPTY_METRICS;

  const m: JournalMetrics = { ...EMPTY_METRICS, byStrategy: {}, byRegime: {} };
  m.totalTrades = entries.length;

  const closed: JournalEntry[] = [];
  for (const e of entries) {
    if (e.status === "open")       m.openTrades += 1;
    else if (e.status === "skipped") m.skipped += 1;
    else closed.push(e);
  }
  m.closedTrades = closed.length;

  if (closed.length === 0) return m;

  let grossProfit = 0;
  let grossLoss = 0;
  let runningR = 0;
  let peak = 0;
  let trough = 0;

  for (const e of closed) {
    const r = e.outcomeR ?? 0;
    const pnl = e.pnlDollars ?? 0;
    m.totalR += r;
    m.totalPnl += pnl;

    if (e.status === "win")        { m.wins += 1; grossProfit += Math.max(0, r); if (r > m.largestWinR)  m.largestWinR  = r; }
    else if (e.status === "loss")  { m.losses += 1; grossLoss += Math.abs(Math.min(0, r)); if (r < m.largestLossR) m.largestLossR = r; }
    else if (e.status === "breakeven") { m.breakevens += 1; }

    // rolling drawdown in R
    runningR += r;
    if (runningR > peak) { peak = runningR; trough = runningR; }
    if (runningR < trough) trough = runningR;
    const dd = peak - trough;
    if (dd > m.maxDrawdownR) m.maxDrawdownR = dd;

    // strategy / regime roll-ups
    const s = m.byStrategy[e.strategy] ?? { count: 0, totalR: 0, winRate: 0 };
    s.count += 1;
    s.totalR += r;
    s.winRate = (s.winRate * (s.count - 1) + (e.status === "win" ? 1 : 0)) / s.count;
    m.byStrategy[e.strategy] = s;

    const g = m.byRegime[e.regime] ?? { count: 0, totalR: 0, winRate: 0 };
    g.count += 1;
    g.totalR += r;
    g.winRate = (g.winRate * (g.count - 1) + (e.status === "win" ? 1 : 0)) / g.count;
    m.byRegime[e.regime] = g;
  }

  const nonBreakeven = m.wins + m.losses;
  m.winRate     = nonBreakeven > 0 ? m.wins / nonBreakeven : 0;
  m.avgWinR     = m.wins   > 0 ? grossProfit / m.wins   : 0;
  m.avgLossR    = m.losses > 0 ? -grossLoss  / m.losses : 0;
  m.expectancyR = closed.length > 0 ? m.totalR / closed.length : 0;
  m.profitFactor = grossLoss > 0 ? grossProfit / grossLoss
                   : grossProfit > 0 ? Infinity : 0;

  return m;
}

// Compute outcome R and P&L from exit price (helper for outcome entry).
export function computeOutcome(
  entry: JournalEntry,
  exitPrice: number,
  pointValue: number,
): { outcomeR: number; pnlDollars: number; status: TradeStatus } {
  const dir = entry.side === "long" ? 1 : entry.side === "short" ? -1 : 0;
  if (dir === 0 || entry.stopDistance === 0) {
    return { outcomeR: 0, pnlDollars: 0, status: "breakeven" };
  }
  const moveDollars = (exitPrice - entry.entryPrice) * dir * pointValue * entry.contracts;
  const rPerPoint = entry.stopDistance;
  const outcomeR = ((exitPrice - entry.entryPrice) * dir) / rPerPoint;
  const status: TradeStatus =
    outcomeR > 0.05  ? "win" :
    outcomeR < -0.05 ? "loss" :
    "breakeven";
  return { outcomeR: parseFloat(outcomeR.toFixed(3)), pnlDollars: parseFloat(moveDollars.toFixed(2)), status };
}
