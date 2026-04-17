import Anthropic from "@anthropic-ai/sdk";
import type { InstrumentContext } from "./types.js";
import type { CrossMarketSnapshot } from "./crossMarket.js";
import type { EconomicEvent } from "./calendar.js";

// Three AI features: trade reasoning, journal analysis, morning brief.
// All routed through Claude Haiku 4.5 for cost+latency. Prompt caching
// applied to long system prompts so we only pay full input cost once
// per ~5 minutes per endpoint.

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;
export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
function getClient(): Anthropic {
  if (!aiConfigured()) {
    throw new Error("ANTHROPIC_API_KEY not set — AI features disabled");
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function firstText(resp: Anthropic.Message): string {
  const block = resp.content[0];
  return block && block.type === "text" ? block.text.trim() : "";
}

// --- Trade reasoning ----------------------------------------------------

export interface TradeReasoningInput {
  selected: {
    symbol: string;
    strategy: string;
    strategyLabel: string;
    side: string;
    entry: number;
    stop: number;
    target: number;
    rMultiple: number;
    rawScore: number;
    regime: string;
    reasons: string[];
    scoreBreakdown?: Record<string, number>;
  };
  runnerUps: Array<{ strategy: string; strategyLabel: string; rawScore: number }>;
  context: {
    symbol: string;
    regime: string;
    regimeConfidence: number;
    liquidityScore: number;
    eventRisk: number;
  };
}

const TRADE_REASONING_SYSTEM = `You are a futures trading desk analyst.
Given the output of an algorithmic decision engine, write 2-3 sentences explaining:
1. Why this specific setup was selected (regime fit, edge, score factors)
2. What the execution confirmation looks like
3. What invalidates the setup

Style: terse, direct, institutional. No hype, no hedging, no emojis.
Never recommend doing the opposite of what the engine selected. If the
engine chose stand-aside, explain why that's the right call.
Max 80 words.`;

export async function aiTradeReasoning(input: TradeReasoningInput): Promise<string> {
  const c = getClient();
  const payload = JSON.stringify(input, null, 2);
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 250,
    system: [{ type: "text", text: TRADE_REASONING_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Trade selection:\n${payload}` }],
  });
  return firstText(resp);
}

// --- Journal analysis ---------------------------------------------------

export interface JournalAnalysisEntry {
  strategy: string;
  strategyLabel: string;
  symbol: string;
  side: "long" | "short";
  outcomeR?: number;
  status?: "win" | "loss" | "breakeven" | "open";
  regime?: string;
  timestamp?: string;
}

const JOURNAL_ANALYSIS_SYSTEM = `You are a trading performance coach.
Given a journal of closed trades (with R-multiples and strategy labels),
find 3-5 concrete patterns. Each pattern must have:
- The pattern (one sentence)
- Statistical basis (numbers from the data)
- Recommended action (one sentence)

Rules:
- Only state patterns backed by the numbers. Do not invent.
- If the sample is too small for confidence (<10 closed trades per bucket),
  say so explicitly — don't extrapolate from 2-3 trades.
- No pep talk. No "keep up the good work." No psychology platitudes.
- Return as a numbered list. Max 300 words.`;

export async function aiJournalAnalysis(journal: JournalAnalysisEntry[]): Promise<string> {
  const c = getClient();
  const closed = journal.filter(e => e.status === "win" || e.status === "loss" || e.status === "breakeven");
  if (closed.length < 5) {
    return `Not enough closed trades yet (${closed.length}). Need at least 5 for a meaningful analysis, 30+ for reliable patterns.`;
  }
  const payload = JSON.stringify(closed.slice(-200), null, 2); // cap to last 200 for prompt size
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: [{ type: "text", text: JOURNAL_ANALYSIS_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Journal (${closed.length} closed trades):\n${payload}` }],
  });
  return firstText(resp);
}

// --- Morning brief narrative --------------------------------------------

export interface MorningBriefInput {
  date: string;
  contexts: Pick<InstrumentContext, "instrument" | "price" | "regime" | "regimeConfidence" | "liquidityScore">[];
  crossMarket: CrossMarketSnapshot | null;
  highImpactEvents: EconomicEvent[];
}

const MORNING_BRIEF_SYSTEM = `You are an institutional desk writing the
pre-market note for a small group of futures traders. The note must:

- Lead with a 1-sentence TL;DR stating the bias (risk-on, risk-off, or
  mixed) with the dominant driver.
- One paragraph on the cross-market read (VIX, DXY, 10y).
- One paragraph on event risk (calendar), if any high-impact events.
- One paragraph on playbook emphasis — which strategy family fits the
  regime (breakout, trend continuation, range rotation, mean reversion).
- Close with one sentence of "what changes our mind."

Style: institutional, confident, no hype, no emojis (use them sparingly
if at all). Under 180 words total.`;

export async function aiMorningBrief(input: MorningBriefInput): Promise<string> {
  const c = getClient();
  const payload = JSON.stringify(input, null, 2);
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: [{ type: "text", text: MORNING_BRIEF_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Pre-market data:\n${payload}` }],
  });
  return firstText(resp);
}
