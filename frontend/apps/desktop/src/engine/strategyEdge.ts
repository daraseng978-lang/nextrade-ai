import type { StrategyId } from "./types";
import type { JournalEntry } from "./journal";
import { STRATEGIES, strategyExpectancy } from "./strategies";

// Bayesian pseudo-count — the realized edge has to accumulate SHRINK_K trades
// before it earns equal weight with the Capital Lab preset. Prevents a 3/5 hot
// streak from overwriting a 44% preset and blowing up sizing.
const SHRINK_K = 10;

export interface RealizedEdge {
  winRate: number;
  expectancy: number;
  n: number;
}

export interface BlendedEdge {
  preset: { winRate: number; expectancy: number };
  realized: RealizedEdge | null;
  blended: { winRate: number; expectancy: number };
  edgeScore: number; // 0..1, normalized for the decision score
}

export function realizedStrategyEdge(
  id: StrategyId,
  journal: JournalEntry[],
): RealizedEdge | null {
  const closed = journal.filter(
    (e) =>
      e.strategy === id &&
      (e.status === "win" || e.status === "loss" || e.status === "breakeven"),
  );
  if (closed.length === 0) return null;

  const wins = closed.filter((e) => e.status === "win").length;
  const losses = closed.filter((e) => e.status === "loss").length;
  const nonBe = wins + losses;
  const winRate = nonBe > 0 ? wins / nonBe : 0;

  const totalR = closed.reduce((s, e) => s + (e.outcomeR ?? 0), 0);
  const expectancy = totalR / closed.length;

  return { winRate, expectancy, n: closed.length };
}

// Blend the Capital Lab preset with realized journal results using
// beta-binomial-style shrinkage. With n=0 trades the blended edge equals the
// preset; with n=SHRINK_K it's 50/50; beyond that the realized data dominates.
export function blendedEdgeForStrategy(
  id: StrategyId,
  journal: JournalEntry[],
): BlendedEdge {
  const meta = STRATEGIES[id];
  const preset = {
    winRate: meta.edge.winRate,
    expectancy: strategyExpectancy(id),
  };

  const realized = realizedStrategyEdge(id, journal);
  const n = realized?.n ?? 0;
  const wPrior = SHRINK_K / (n + SHRINK_K);
  const wData = n / (n + SHRINK_K);

  const blended = realized
    ? {
        winRate: wPrior * preset.winRate + wData * realized.winRate,
        expectancy: wPrior * preset.expectancy + wData * realized.expectancy,
      }
    : { ...preset };

  const edgeScore = Math.max(0, Math.min(1, (blended.expectancy + 0.5) / 1.5));

  return { preset, realized, blended, edgeScore };
}
