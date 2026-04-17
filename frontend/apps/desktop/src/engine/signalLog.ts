import type { RegimeId, SelectedSignal, Side, StrategyId, TradeState } from "./types";

// Signal log — records every unique setup the decision engine produces
// so the trader can audit what the system "saw" without relying on
// Telegram history. Persists to localStorage, capped at 500 entries
// per symbol to stay under storage quotas.
//
// Entries are deduplicated by setupKey: the same symbol+strategy+regime
// +side combination is logged ONCE per session. Regime/strategy changes
// create new entries; pure timestamp changes do not.

export interface SignalLogEntry {
  id: string;                  // timestamp-based unique id
  timestamp: string;
  symbol: string;
  setupKey: string;
  strategy: StrategyId;
  regime: RegimeId;
  side: Side;
  rawScore: number;
  adjustedScore: number;
  triggerQuality: number;
  locationQuality: number;
  footprintBonus: number;
  state: TradeState;
  // Was this signal routed to an external channel (Telegram / TradersPost)?
  routed: { telegram: boolean; tradersPost: boolean };
  // Optional — the human-readable setup reasons at the moment of logging.
  reasons: string[];
}

export const SIGNAL_LOG_STORAGE_KEY = "nextrade.signalLog.v1";
export const MAX_SIGNALS_PER_SYMBOL = 500;

// Stable identity — same shape we use for Telegram/AI dedup.
export function signalSetupKey(signal: SelectedSignal): string {
  const c = signal.candidate;
  return `${c.instrument.symbol}-${c.strategy}-${c.regime}-${c.side}`;
}

export function loadSignalLog(): SignalLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SIGNAL_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function persistSignalLog(log: SignalLogEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIGNAL_LOG_STORAGE_KEY, JSON.stringify(log));
  } catch { /* quota — ignore */ }
}

// Appends an entry, evicts oldest when per-symbol limit is hit.
export function appendSignal(log: SignalLogEntry[], entry: SignalLogEntry): SignalLogEntry[] {
  const next = [entry, ...log];
  // Cap per-symbol count.
  const counts: Record<string, number> = {};
  const kept: SignalLogEntry[] = [];
  for (const e of next) {
    counts[e.symbol] = (counts[e.symbol] ?? 0) + 1;
    if (counts[e.symbol] <= MAX_SIGNALS_PER_SYMBOL) kept.push(e);
  }
  return kept;
}

// Builds an entry from the current SelectedSignal.
export function buildSignalEntry(
  signal: SelectedSignal,
  routed: { telegram: boolean; tradersPost: boolean } = { telegram: false, tradersPost: false },
): SignalLogEntry {
  const c = signal.candidate;
  return {
    id: `${c.instrument.symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: signal.timestamp,
    symbol: c.instrument.symbol,
    setupKey: signalSetupKey(signal),
    strategy: c.strategy,
    regime: c.regime,
    side: c.side,
    rawScore: c.rawScore,
    adjustedScore: signal.adjustedScore,
    triggerQuality: c.quality?.triggerQuality ?? 0,
    locationQuality: c.quality?.locationQuality ?? 0,
    footprintBonus: c.quality?.footprintConfirmation?.bonus ?? 0,
    state: signal.state,
    routed,
    reasons: c.reasons.slice(0, 6),
  };
}

// Aggregates — helpful for the "is this system over-signalling?" diagnosis.
export interface SignalLogSummary {
  total: number;
  bySymbol: Record<string, number>;
  byStrategy: Record<string, number>;
  byState: Record<string, number>;
  uniqueSetupsToday: number;
}

export function summarizeSignalLog(log: SignalLogEntry[], withinMs: number = 24 * 60 * 60 * 1000): SignalLogSummary {
  const cutoff = Date.now() - withinMs;
  const recent = log.filter(e => new Date(e.timestamp).getTime() >= cutoff);
  const bySymbol: Record<string, number> = {};
  const byStrategy: Record<string, number> = {};
  const byState: Record<string, number> = {};
  const setups = new Set<string>();
  for (const e of recent) {
    bySymbol[e.symbol] = (bySymbol[e.symbol] ?? 0) + 1;
    byStrategy[e.strategy] = (byStrategy[e.strategy] ?? 0) + 1;
    byState[e.state] = (byState[e.state] ?? 0) + 1;
    setups.add(e.setupKey);
  }
  return { total: recent.length, bySymbol, byStrategy, byState, uniqueSetupsToday: setups.size };
}
