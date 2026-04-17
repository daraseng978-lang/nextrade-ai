import { describe, it, expect, afterEach, vi } from "vitest";
import { dispatchTradersPost, redactWebhook, validatePayload, type TradersPostDispatchPayload } from "../dispatch.js";

const validPayload: TradersPostDispatchPayload = {
  ticker: "MES",
  action: "buy",
  orderType: "limit",
  quantity: 1,
  price: 7000,
  stopLoss: { type: "stop", stopPrice: 6990 },
  takeProfit: { limitPrice: 7020 },
  sentiment: "bullish",
  strategy: "opening_range_breakout",
};

describe("validatePayload", () => {
  it("accepts a well-formed payload", () => {
    expect(() => validatePayload(validPayload)).not.toThrow();
  });

  it("rejects missing ticker", () => {
    expect(() => validatePayload({ ...validPayload, ticker: "" })).toThrow(/ticker/);
  });

  it("rejects bad action", () => {
    expect(() => validatePayload({ ...validPayload, action: "hold" as never })).toThrow(/buy\|sell/);
  });

  it("rejects non-positive quantity", () => {
    expect(() => validatePayload({ ...validPayload, quantity: 0 })).toThrow(/quantity/);
  });

  it("rejects missing stop loss", () => {
    expect(() => validatePayload({ ...validPayload, stopLoss: undefined as never })).toThrow(/stopLoss/);
  });
});

describe("redactWebhook", () => {
  it("masks the trailing secret token", () => {
    const r = redactWebhook("https://webhooks.traderspost.io/trading/webhook/abc123/sk_live_verysecrettoken");
    expect(r).toContain("https://webhooks.traderspost.io/trading/webhook/abc123/");
    expect(r).not.toContain("sk_live_verysecrettoken");
    expect(r).toContain("sk_…");
  });

  it("returns a placeholder when given an invalid URL", () => {
    expect(redactWebhook("not a url")).toBe("(invalid url)");
  });
});

describe("dispatchTradersPost", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => { (globalThis as { fetch: typeof fetch }).fetch = origFetch; });

  it("throws when no webhook URL is configured", async () => {
    await expect(dispatchTradersPost(validPayload, "")).rejects.toThrow(/not configured/);
  });

  it("POSTs JSON to the webhook URL and returns the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => "{\"received\":true}",
    });
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as typeof fetch;

    const result = await dispatchTradersPost(validPayload, "https://webhooks.traderspost.io/trading/webhook/abc/secret");
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toContain("received");
    expect(result.forwardedTo).toContain("traderspost.io");
    expect(result.forwardedTo).not.toContain("secret");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("traderspost.io");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ ticker: "MES", action: "buy", quantity: 1 });
  });

  it("propagates non-2xx response status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 422,
      text: async () => "{\"error\":\"unknown ticker\"}",
    });
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as typeof fetch;
    const result = await dispatchTradersPost(validPayload, "https://webhooks.traderspost.io/trading/webhook/abc/secret");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
    expect(result.body).toContain("unknown ticker");
  });
});
