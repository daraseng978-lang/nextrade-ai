import { describe, it, expect, afterEach, vi } from "vitest";
import {
  buildMarketDataProvider,
  DEFAULT_PROVIDER_CONFIG,
} from "../engine/marketDataProvider";
import { mockContexts } from "../engine/mockData";

describe("mock provider", () => {
  it("returns a deterministic snapshot with non-empty contexts", async () => {
    const p = buildMarketDataProvider({ kind: "mock" });
    const a = await p.snapshot();
    const b = await p.snapshot();
    expect(a.contexts.length).toBeGreaterThan(0);
    expect(a.contexts[0].instrument.symbol).toBe(b.contexts[0].instrument.symbol);
    expect(a.contexts[0].price).toBe(b.contexts[0].price);
    expect(a.providerKind).toBe("mock");
  });

  it("stamps receivedAt as a valid ISO string and measures latency", async () => {
    const p = buildMarketDataProvider({ kind: "mock" });
    const snap = await p.snapshot();
    expect(new Date(snap.receivedAt).toString()).not.toBe("Invalid Date");
    expect(snap.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe("live mock provider", () => {
  it("keeps every drifted price within ±driftFactor of the mock baseline", async () => {
    const drift = 0.01; // 1%
    const baseline = mockContexts();
    const p = buildMarketDataProvider({ kind: "live_mock", driftFactor: drift });
    const snap = await p.snapshot();
    for (let i = 0; i < baseline.length; i++) {
      const base = baseline[i].price;
      const later = snap.contexts[i].price;
      const pct = Math.abs(later - base) / base;
      expect(pct).toBeLessThanOrEqual(drift + 1e-6);
    }
    expect(snap.providerKind).toBe("live_mock");
  });

  it("preserves instrument identity and regime across ticks", async () => {
    const p = buildMarketDataProvider({ kind: "live_mock", driftFactor: 0.005 });
    const a = await p.snapshot();
    const b = await p.snapshot();
    for (let i = 0; i < a.contexts.length; i++) {
      expect(b.contexts[i].instrument.symbol).toBe(a.contexts[i].instrument.symbol);
      expect(b.contexts[i].regime).toBe(a.contexts[i].regime);
    }
  });
});

describe("REST provider", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => { (globalThis as { fetch: typeof fetch }).fetch =origFetch; });

  it("throws a clear error when no URL is configured", async () => {
    const p = buildMarketDataProvider({ kind: "rest" });
    await expect(p.snapshot()).rejects.toThrow(/no URL configured/);
  });

  it("parses { contexts: [...] } shape", async () => {
    const mockResp = {
      ok: true, status: 200, statusText: "OK",
      json: async () => ({
        contexts: [
          {
            instrument: { symbol: "MES", name: "MES", tickSize: 0.25, tickValue: 1.25, pointValue: 5, session: "RTH", category: "equity_future" },
            price: 7000, atr: 10, vwap: 6995, openingRange: { high: 7010, low: 6990 },
            priorHigh: 7020, priorLow: 6980, regime: "balanced_range",
            regimeConfidence: 0.6, liquidityScore: 0.9, eventRisk: 0.1, spread: 0.25,
          },
        ],
      }),
    };
    (globalThis as { fetch: typeof fetch }).fetch =vi.fn().mockResolvedValue(mockResp) as typeof fetch;
    const p = buildMarketDataProvider({ kind: "rest", restUrl: "https://example.com/feed" });
    const snap = await p.snapshot();
    expect(snap.contexts).toHaveLength(1);
    expect(snap.contexts[0].instrument.symbol).toBe("MES");
    expect(snap.providerKind).toBe("rest");
  });

  it("parses a raw array shape", async () => {
    const mockResp = {
      ok: true, status: 200, statusText: "OK",
      json: async () => [
        {
          instrument: { symbol: "MNQ", name: "MNQ", tickSize: 0.25, tickValue: 0.5, pointValue: 2, session: "RTH", category: "equity_future" },
          price: 26400, atr: 30, vwap: 26390, openingRange: { high: 26420, low: 26380 },
          priorHigh: 26430, priorLow: 26370, regime: "expansion_breakout",
          regimeConfidence: 0.7, liquidityScore: 0.9, eventRisk: 0.15, spread: 0.25,
        },
      ],
    };
    (globalThis as { fetch: typeof fetch }).fetch =vi.fn().mockResolvedValue(mockResp) as typeof fetch;
    const p = buildMarketDataProvider({ kind: "rest", restUrl: "https://example.com/feed" });
    const snap = await p.snapshot();
    expect(snap.contexts[0].instrument.symbol).toBe("MNQ");
  });

  it("throws when HTTP status is not ok", async () => {
    const mockResp = { ok: false, status: 500, statusText: "Internal Server Error", json: async () => ({}) };
    (globalThis as { fetch: typeof fetch }).fetch =vi.fn().mockResolvedValue(mockResp) as typeof fetch;
    const p = buildMarketDataProvider({ kind: "rest", restUrl: "https://example.com/feed" });
    await expect(p.snapshot()).rejects.toThrow(/500/);
  });

  it("throws when payload is the wrong shape", async () => {
    const mockResp = { ok: true, status: 200, statusText: "OK", json: async () => ({ data: "nope" }) };
    (globalThis as { fetch: typeof fetch }).fetch =vi.fn().mockResolvedValue(mockResp) as typeof fetch;
    const p = buildMarketDataProvider({ kind: "rest", restUrl: "https://example.com/feed" });
    await expect(p.snapshot()).rejects.toThrow(/not an InstrumentContext/);
  });

  it("sends Authorization header when apiKey is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: "OK",
      json: async () => ({
        contexts: [
          {
            instrument: { symbol: "MES", name: "MES", tickSize: 0.25, tickValue: 1.25, pointValue: 5, session: "RTH", category: "equity_future" },
            price: 7000, atr: 10, vwap: 7000, openingRange: { high: 7010, low: 6990 },
            priorHigh: 7020, priorLow: 6980, regime: "balanced_range",
            regimeConfidence: 0.6, liquidityScore: 0.9, eventRisk: 0.1, spread: 0.25,
          },
        ],
      }),
    });
    (globalThis as { fetch: typeof fetch }).fetch =fetchMock as typeof fetch;
    const p = buildMarketDataProvider({ kind: "rest", restUrl: "https://example.com/feed", apiKey: "sk-123" });
    await p.snapshot();
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer sk-123");
  });
});

describe("DEFAULT_PROVIDER_CONFIG", () => {
  it("defaults to the mock provider", () => {
    expect(DEFAULT_PROVIDER_CONFIG.kind).toBe("mock");
    expect(DEFAULT_PROVIDER_CONFIG.pollIntervalMs).toBeGreaterThan(0);
  });
});
