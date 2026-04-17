import type { InstrumentContext, RegimeId } from "./types";

// Regime hysteresis — stabilize the classifier output so it doesn't
// flip on marginal inputs (e.g. bars.length crossing the 6-bar minimum
// repeatedly, expansion ratio just under/over threshold).
//
// Rule: a new regime must be reported for N consecutive polls before
// we swap the "effective" regime used by the decision engine. If
// hysteresis is OFF for a symbol (new symbol / first poll), we accept
// whatever the classifier says.
//
// Consequence: the UI shows the STABLE regime, not the raw one. The
// flickers live in internal state and don't reach the trader.

export interface RegimeHistoryEntry {
  stable: RegimeId;
  pending: RegimeId | null;
  pendingCount: number;
}

export interface HysteresisState {
  bySymbol: Record<string, RegimeHistoryEntry>;
}

export const DEFAULT_HYSTERESIS_THRESHOLD = 2;

// Pure function — takes current state + next raw contexts, returns
// stabilized contexts + updated state.
export function stabilizeContexts(
  state: HysteresisState,
  rawContexts: InstrumentContext[],
  threshold: number = DEFAULT_HYSTERESIS_THRESHOLD,
): { contexts: InstrumentContext[]; nextState: HysteresisState } {
  const nextState: HysteresisState = { bySymbol: { ...state.bySymbol } };
  const contexts = rawContexts.map(ctx => {
    const symbol = ctx.instrument.symbol;
    const raw = ctx.regime;
    const history = nextState.bySymbol[symbol];

    // First time we see this symbol — accept whatever was reported.
    if (!history) {
      nextState.bySymbol[symbol] = { stable: raw, pending: null, pendingCount: 0 };
      return ctx;
    }

    // Classifier agrees with stable regime — reset any pending candidate.
    if (raw === history.stable) {
      nextState.bySymbol[symbol] = { stable: raw, pending: null, pendingCount: 0 };
      return ctx;
    }

    // A new regime showed up.
    if (raw === history.pending) {
      const nextCount = history.pendingCount + 1;
      if (nextCount >= threshold) {
        // Promote pending to stable.
        nextState.bySymbol[symbol] = { stable: raw, pending: null, pendingCount: 0 };
        return ctx;
      }
      nextState.bySymbol[symbol] = { stable: history.stable, pending: raw, pendingCount: nextCount };
      return { ...ctx, regime: history.stable };
    }

    // New pending candidate — reset counter.
    nextState.bySymbol[symbol] = { stable: history.stable, pending: raw, pendingCount: 1 };
    return { ...ctx, regime: history.stable };
  });

  return { contexts, nextState };
}

export function emptyHysteresisState(): HysteresisState {
  return { bySymbol: {} };
}
