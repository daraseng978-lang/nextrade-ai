import type { InstrumentContext } from "./types";
import { mockContexts } from "./mockData";

// Pluggable market data provider.
// Every provider returns the same InstrumentContext[] shape so the
// decision engine doesn't care where the data came from.

export type MarketDataProviderKind = "mock" | "live_mock" | "rest";

export interface MarketDataProviderConfig {
  kind: MarketDataProviderKind;
  restUrl?: string;        // required for kind === "rest"
  pollIntervalMs?: number; // default 5000
  driftFactor?: number;    // live_mock price drift per poll, default 0.0008
  apiKey?: string;         // optional auth header for REST
}

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
  regimeBias: "risk_on" | "risk_off" | "neutral";
  summary: string;
}

export interface FeedSnapshot {
  contexts: InstrumentContext[];
  receivedAt: string;      // ISO timestamp the payload was received
  latencyMs: number;       // how long the fetch took
  providerKind: MarketDataProviderKind;
  crossMarket?: CrossMarketSnapshot | null;
}

export interface MarketDataProvider {
  kind: MarketDataProviderKind;
  label: string;
  describe: string;        // one-liner shown in settings
  /** Fetch one snapshot. Live providers may be async; mock is instant. */
  snapshot(): Promise<FeedSnapshot>;
}

export const DEFAULT_POLL_INTERVAL_MS = 5000;
export const DEFAULT_DRIFT_FACTOR = 0.0008;

// ---------------------------------------------------------------------------
// Deterministic static mock — always returns the same baseline contexts.
// Keeps tests and offline dev reproducible.
// ---------------------------------------------------------------------------
function makeMockProvider(): MarketDataProvider {
  return {
    kind: "mock",
    label: "Mock (deterministic)",
    describe: "Static snapshot from engine/mockData.ts · no network · fully deterministic.",
    async snapshot() {
      const started = Date.now();
      const contexts = mockContexts();
      return {
        contexts,
        receivedAt: new Date().toISOString(),
        latencyMs: Math.max(1, Date.now() - started),
        providerKind: "mock",
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Ticking live-mock — each call drifts the baseline prices by a small
// random amount. Proves the polling loop is wired end-to-end without
// requiring a real backend.
// ---------------------------------------------------------------------------
function makeLiveMockProvider(drift: number): MarketDataProvider {
  return {
    kind: "live_mock",
    label: "Live mock (ticking)",
    describe: `Simulates a live feed with ±${(drift * 100).toFixed(2)}% random drift per poll. Use to prove end-to-end wiring without a real broker.`,
    async snapshot() {
      const started = Date.now();
      const base = mockContexts();
      const now = Date.now();
      const contexts: InstrumentContext[] = base.map((ctx, idx) => {
        const rng = pseudoRandom(now, idx);
        const delta = (rng - 0.5) * 2 * drift;
        const nextPrice = ctx.price * (1 + delta);
        return {
          ...ctx,
          price: parseFloat(nextPrice.toFixed(Math.abs(ctx.instrument.tickSize) < 1 ? 4 : 2)),
        };
      });
      // Light async delay to simulate network (10–40ms)
      await new Promise((r) => setTimeout(r, 10 + (now % 30)));
      return {
        contexts,
        receivedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        providerKind: "live_mock",
      };
    },
  };
}

function pseudoRandom(seed1: number, seed2: number): number {
  const t = (seed1 * 9301 + seed2 * 49297) % 233280;
  return t / 233280;
}

// ---------------------------------------------------------------------------
// REST provider — expects an endpoint returning JSON in one of two shapes:
//   a) { contexts: InstrumentContext[] }
//   b) InstrumentContext[]
// Users plug in their own broker adapter behind this URL.
// ---------------------------------------------------------------------------
function makeRestProvider(url: string, apiKey?: string): MarketDataProvider {
  return {
    kind: "rest",
    label: "REST endpoint",
    describe: `Fetches snapshots from ${url || "(not configured)"}. Expects JSON with shape { contexts: InstrumentContext[] } or InstrumentContext[].`,
    async snapshot() {
      if (!url) throw new Error("REST provider: no URL configured");
      const started = Date.now();
      const headers: Record<string, string> = { "Accept": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`REST provider: ${res.status} ${res.statusText}`);
      }
      const payload = await res.json();
      const contexts: InstrumentContext[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.contexts)
          ? payload.contexts
          : null;
      if (!contexts) {
        throw new Error("REST provider: payload is not an InstrumentContext[] or { contexts }");
      }
      validateContexts(contexts);
      const crossMarket: CrossMarketSnapshot | null =
        payload && !Array.isArray(payload) && payload.crossMarket ? payload.crossMarket : null;
      return {
        contexts,
        receivedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        providerKind: "rest",
        crossMarket,
      };
    },
  };
}

// Minimal shape validation so a malformed payload fails fast with a clear
// error instead of propagating NaNs into the decision engine.
function validateContexts(contexts: unknown[]): asserts contexts is InstrumentContext[] {
  if (!Array.isArray(contexts) || contexts.length === 0) {
    throw new Error("REST provider: empty contexts array");
  }
  for (const [i, raw] of contexts.entries()) {
    const ctx = raw as Partial<InstrumentContext>;
    if (!ctx.instrument?.symbol)   throw new Error(`REST provider: contexts[${i}] missing instrument.symbol`);
    if (typeof ctx.price  !== "number" || !isFinite(ctx.price))  throw new Error(`REST provider: contexts[${i}] missing numeric price`);
    if (typeof ctx.atr    !== "number" || !isFinite(ctx.atr))    throw new Error(`REST provider: contexts[${i}] missing numeric atr`);
    if (!ctx.regime) throw new Error(`REST provider: contexts[${i}] missing regime`);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function buildMarketDataProvider(config: MarketDataProviderConfig): MarketDataProvider {
  switch (config.kind) {
    case "mock":      return makeMockProvider();
    case "live_mock": return makeLiveMockProvider(config.driftFactor ?? DEFAULT_DRIFT_FACTOR);
    case "rest":      return makeRestProvider(config.restUrl ?? "", config.apiKey);
  }
}

export const DEFAULT_PROVIDER_CONFIG: MarketDataProviderConfig = {
  kind: "mock",
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  driftFactor: DEFAULT_DRIFT_FACTOR,
};
