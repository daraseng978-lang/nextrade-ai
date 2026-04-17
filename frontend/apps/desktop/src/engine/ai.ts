import type { InstrumentContext, SelectedSignal } from "./types";
import type { JournalEntry } from "./journal";
import type { CrossMarketSnapshot } from "./marketDataProvider";

// Frontend client for the backend's /ai/* endpoints. Base URL comes
// from the REST provider config — same origin we're already talking to
// for /market/contexts. Failures never throw; callers check .ok.

export interface AiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function baseUrl(restUrl: string | undefined): string | null {
  if (!restUrl) return null;
  try {
    const u = new URL(restUrl);
    return `${u.protocol}//${u.host}`;
  } catch { return null; }
}

async function post<T>(restUrl: string | undefined, path: string, body: unknown): Promise<AiResult<T>> {
  const base = baseUrl(restUrl);
  if (!base) return { ok: false, error: "No REST backend URL configured (Settings → Market Data)" };
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false) {
      return { ok: false, error: payload.error ?? `${res.status} ${res.statusText}` };
    }
    return { ok: true, data: payload as T };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

export async function aiStatus(restUrl: string | undefined): Promise<{ configured: boolean; model: string } | null> {
  const base = baseUrl(restUrl);
  if (!base) return null;
  try {
    const res = await fetch(`${base}/ai/status`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function aiTradeReasoning(
  restUrl: string | undefined,
  signal: SelectedSignal,
): Promise<AiResult<{ commentary: string }>> {
  return post(restUrl, "/ai/trade-reasoning", {
    selected: {
      symbol: signal.candidate.instrument.symbol,
      strategy: signal.candidate.strategy,
      strategyLabel: signal.candidate.strategy,
      side: signal.candidate.side,
      entry: signal.candidate.entry,
      stop: signal.candidate.stop,
      target: signal.candidate.target,
      rMultiple: signal.candidate.rMultiple,
      rawScore: signal.candidate.rawScore,
      regime: signal.candidate.regime,
      reasons: signal.candidate.reasons,
      scoreBreakdown: signal.candidate.scoreBreakdown,
    },
    runnerUps: signal.runnerUps.map(r => ({
      strategy: r.strategy,
      strategyLabel: r.strategy,
      rawScore: r.rawScore,
    })),
    context: {
      symbol: signal.context.instrument.symbol,
      regime: signal.context.regime,
      regimeConfidence: signal.context.regimeConfidence,
      liquidityScore: signal.context.liquidityScore,
      eventRisk: signal.context.eventRisk,
    },
  });
}

export async function aiJournalAnalysis(
  restUrl: string | undefined,
  journal: JournalEntry[],
): Promise<AiResult<{ analysis: string }>> {
  const payload = journal.map(e => ({
    strategy: e.strategy,
    strategyLabel: e.strategyLabel,
    symbol: e.symbol,
    side: e.side,
    outcomeR: e.outcomeR,
    status: e.status,
    regime: e.regime,
    timestamp: e.timestamp,
  }));
  return post(restUrl, "/ai/journal-analysis", { journal: payload });
}

export async function aiMorningBrief(
  restUrl: string | undefined,
  date: string,
  contexts: InstrumentContext[],
  crossMarket: CrossMarketSnapshot | null,
  highImpactEvents: Array<{ time: string; event: string; impact: string; forecast: string; previous: string }>,
): Promise<AiResult<{ narrative: string }>> {
  return post(restUrl, "/ai/morning-brief", {
    date,
    contexts: contexts.map(c => ({
      instrument: c.instrument,
      price: c.price,
      regime: c.regime,
      regimeConfidence: c.regimeConfidence,
      liquidityScore: c.liquidityScore,
    })),
    crossMarket,
    highImpactEvents,
  });
}
