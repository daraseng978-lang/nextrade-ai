import type { SelectedSignal } from "./types";

// Strategy-level hysteresis.
//
// Within the same regime, multiple strategies compete for "best available".
// Tiny score wiggle (e.g., 0.64 → 0.66 → 0.64) can flip the top pick each
// poll — which the trader perceives as "100 signals." This filter holds
// the currently-leading strategy UNTIL a challenger both (a) beats the
// leader by a margin AND (b) holds the lead for N consecutive polls.
//
// The filter operates on the SelectedSignal, swapping the candidate.strategy
// and candidate side if hysteresis is active. regime hysteresis runs
// upstream; this one is strategy-only.

import type { PlaybookCandidate, RegimeId, Side, StrategyId } from "./types";

export interface StrategyHistoryEntry {
  leader: { strategy: StrategyId; side: Side; regime: RegimeId; score: number };
  challenger: { strategy: StrategyId; side: Side; regime: RegimeId; score: number } | null;
  challengerCount: number;
}

export interface StrategyHysteresisState {
  bySymbol: Record<string, StrategyHistoryEntry>;
}

export const STRATEGY_SCORE_MARGIN = 0.05; // challenger must beat leader by >= 5% raw score
export const STRATEGY_HYSTERESIS_THRESHOLD = 2;

export function emptyStrategyHysteresisState(): StrategyHysteresisState {
  return { bySymbol: {} };
}

// Picks the effective best candidate among runnerUps + current best using
// strategy hysteresis. Returns the possibly-swapped best plus updated state.
export function stabilizeStrategy(
  state: StrategyHysteresisState,
  symbol: string,
  current: { candidate: PlaybookCandidate; runnerUps: PlaybookCandidate[] },
  margin: number = STRATEGY_SCORE_MARGIN,
  threshold: number = STRATEGY_HYSTERESIS_THRESHOLD,
): { best: PlaybookCandidate; runnerUps: PlaybookCandidate[]; nextState: StrategyHysteresisState } {
  const nextState: StrategyHysteresisState = { bySymbol: { ...state.bySymbol } };
  const history = nextState.bySymbol[symbol];
  const incoming = current.candidate;
  const incomingKey = { strategy: incoming.strategy, side: incoming.side, regime: incoming.regime, score: incoming.rawScore };

  // First time we see this symbol OR regime changed — accept the new
  // leader immediately. Strategy hysteresis only operates WITHIN the
  // same regime.
  if (!history || history.leader.regime !== incoming.regime) {
    nextState.bySymbol[symbol] = { leader: incomingKey, challenger: null, challengerCount: 0 };
    return { best: incoming, runnerUps: current.runnerUps, nextState };
  }

  // Same leader still wins — nothing to do.
  if (incoming.strategy === history.leader.strategy && incoming.side === history.leader.side) {
    nextState.bySymbol[symbol] = {
      leader: { ...history.leader, score: incoming.rawScore },
      challenger: null,
      challengerCount: 0,
    };
    return { best: incoming, runnerUps: current.runnerUps, nextState };
  }

  // A different strategy came in on top. Is it beating the prior leader by margin?
  const beatsByMargin = incoming.rawScore >= history.leader.score + margin;

  if (!beatsByMargin) {
    // Doesn't beat by margin — stick with the prior leader. Find it in
    // current runnerUps or fall back.
    const priorLeader = current.runnerUps.find(
      c => c.strategy === history.leader.strategy && c.side === history.leader.side,
    );
    if (!priorLeader) {
      // Prior leader no longer in the ranked list; accept the incoming.
      nextState.bySymbol[symbol] = { leader: incomingKey, challenger: null, challengerCount: 0 };
      return { best: incoming, runnerUps: current.runnerUps, nextState };
    }
    // Swap: prior leader becomes best, incoming drops into runnerUps.
    const newRunnerUps = [incoming, ...current.runnerUps.filter(c => c !== priorLeader)].slice(0, current.runnerUps.length);
    nextState.bySymbol[symbol] = {
      leader: { ...history.leader, score: priorLeader.rawScore },
      challenger: null,
      challengerCount: 0,
    };
    return { best: priorLeader, runnerUps: newRunnerUps, nextState };
  }

  // Incoming beats by margin. Does it match the existing challenger?
  const matchesChallenger =
    history.challenger &&
    history.challenger.strategy === incoming.strategy &&
    history.challenger.side === incoming.side;

  if (matchesChallenger) {
    const nextCount = history.challengerCount + 1;
    if (nextCount >= threshold) {
      // Promote challenger → leader.
      nextState.bySymbol[symbol] = { leader: incomingKey, challenger: null, challengerCount: 0 };
      return { best: incoming, runnerUps: current.runnerUps, nextState };
    }
    // Still pending — stick with prior leader if present in runnerUps.
    const priorLeader = current.runnerUps.find(
      c => c.strategy === history.leader.strategy && c.side === history.leader.side,
    );
    if (priorLeader) {
      const newRunnerUps = [incoming, ...current.runnerUps.filter(c => c !== priorLeader)].slice(0, current.runnerUps.length);
      nextState.bySymbol[symbol] = {
        leader: { ...history.leader, score: priorLeader.rawScore },
        challenger: incomingKey,
        challengerCount: nextCount,
      };
      return { best: priorLeader, runnerUps: newRunnerUps, nextState };
    }
    nextState.bySymbol[symbol] = { leader: incomingKey, challenger: null, challengerCount: 0 };
    return { best: incoming, runnerUps: current.runnerUps, nextState };
  }

  // New challenger — start counter.
  const priorLeader = current.runnerUps.find(
    c => c.strategy === history.leader.strategy && c.side === history.leader.side,
  );
  if (priorLeader) {
    const newRunnerUps = [incoming, ...current.runnerUps.filter(c => c !== priorLeader)].slice(0, current.runnerUps.length);
    nextState.bySymbol[symbol] = {
      leader: { ...history.leader, score: priorLeader.rawScore },
      challenger: incomingKey,
      challengerCount: 1,
    };
    return { best: priorLeader, runnerUps: newRunnerUps, nextState };
  }
  nextState.bySymbol[symbol] = { leader: incomingKey, challenger: null, challengerCount: 0 };
  return { best: incoming, runnerUps: current.runnerUps, nextState };
}

// Helper used by WorkstationContext to rebuild a SelectedSignal with a
// swapped best candidate.
export function applyStrategyStabilization(
  signal: SelectedSignal,
  best: PlaybookCandidate,
  runnerUps: PlaybookCandidate[],
): SelectedSignal {
  if (best === signal.candidate) return signal;
  return { ...signal, candidate: best, runnerUps };
}
