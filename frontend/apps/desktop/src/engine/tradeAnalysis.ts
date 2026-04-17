import type { JournalEntry } from "./journal";

// Derive a concise human-readable "why this won/lost" line from the
// structured journal fields. Used by RecentTradesPanel to surface
// feedback without needing the user to hand-write a summary.
//
// Precedence: manual mindsetAfter/notes > deviation info > emotion
// tags > score/confidence heuristic.

export interface TradeAnalysis {
  outcomeWord: "WIN" | "LOSS" | "BREAKEVEN" | "OPEN" | "SKIPPED";
  summary: string;
  signal: "positive" | "negative" | "neutral";
  factors: string[];   // structured tags useful for downstream training
}

export function analyzeTrade(entry: JournalEntry): TradeAnalysis {
  const outcomeWord: TradeAnalysis["outcomeWord"] =
    entry.status === "win"       ? "WIN" :
    entry.status === "loss"      ? "LOSS" :
    entry.status === "breakeven" ? "BREAKEVEN" :
    entry.status === "skipped"   ? "SKIPPED" :
    "OPEN";

  const signal: TradeAnalysis["signal"] =
    entry.status === "win" ? "positive" :
    entry.status === "loss" ? "negative" :
    "neutral";

  const factors: string[] = [];

  // 1. Discipline factor
  if (entry.followedPlan === true) factors.push("followed_plan");
  else if (entry.followedPlan === false) factors.push("deviated_from_plan");

  // 2. Emotional factors
  const emotions = entry.emotions ?? [];
  const helpful = emotions.filter(e =>
    ["disciplined", "focused", "confident"].includes(e),
  );
  const harmful = emotions.filter(e =>
    ["hesitant", "impulsive", "fearful", "greedy", "frustrated"].includes(e),
  );
  if (helpful.length > 0) factors.push(`positive_emotions:${helpful.join(",")}`);
  if (harmful.length > 0) factors.push(`negative_emotions:${harmful.join(",")}`);

  // 3. Conviction factor (from entry-time scores)
  if (entry.adjustedScore >= 0.65) factors.push("high_conviction_entry");
  else if (entry.adjustedScore < 0.45) factors.push("low_conviction_entry");

  // 4. Regime alignment
  factors.push(`regime:${entry.regime}`);
  factors.push(`strategy:${entry.strategy}`);

  // 5. Build a summary sentence (manual notes take precedence)
  const manualNote = (entry.mindsetAfter?.trim() || entry.notes?.trim() || "");

  let summary: string;
  if (manualNote) {
    summary = manualNote.length > 160 ? manualNote.slice(0, 157) + "…" : manualNote;
  } else if (entry.status === "open") {
    summary = `In-flight ${entry.strategyLabel} on ${entry.regime}. Waiting for outcome.`;
  } else if (entry.status === "skipped") {
    summary = `Skipped. ${entry.deviationNotes ?? "Setup was there but not taken."}`;
  } else if (entry.status === "win") {
    const reasons: string[] = [];
    if (entry.followedPlan) reasons.push("stayed in the plan");
    if (helpful.length > 0) reasons.push(`felt ${helpful[0]}`);
    if (entry.adjustedScore >= 0.65) reasons.push(`high-conviction setup (adj ${entry.adjustedScore.toFixed(2)})`);
    if (reasons.length === 0) reasons.push(`${entry.strategyLabel} worked out in ${entry.regime}`);
    summary = `Won ${entry.outcomeR?.toFixed(2) ?? "?"}R because ${reasons.join(", ")}.`;
  } else if (entry.status === "loss") {
    const reasons: string[] = [];
    if (entry.followedPlan === false) {
      reasons.push(`deviated from plan${entry.deviationNotes ? ` — ${entry.deviationNotes}` : ""}`);
    }
    if (harmful.length > 0) reasons.push(`felt ${harmful[0]}`);
    if (entry.adjustedScore < 0.45) reasons.push(`low-conviction entry (adj ${entry.adjustedScore.toFixed(2)})`);
    if (reasons.length === 0) reasons.push(`${entry.strategyLabel} didn't play out in ${entry.regime}`);
    summary = `Lost ${Math.abs(entry.outcomeR ?? 0).toFixed(2)}R because ${reasons.join(", ")}.`;
  } else {
    summary = `Breakeven. ${entry.strategyLabel} churned without conviction.`;
  }

  return { outcomeWord, summary, signal, factors };
}
