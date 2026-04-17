import { describe, it, expect, afterEach, vi } from "vitest";
import { sendTelegramMessage } from "../telegram.js";

describe("sendTelegramMessage", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => { (globalThis as { fetch: typeof fetch }).fetch = origFetch; });

  const cfg = { botToken: "123:abc", chatId: "42" };

  it("throws when bot token is missing", async () => {
    await expect(sendTelegramMessage("hi", { botToken: "", chatId: "42" }))
      .rejects.toThrow(/not configured/);
  });

  it("throws when chat id is missing", async () => {
    await expect(sendTelegramMessage("hi", { botToken: "123:abc", chatId: "" }))
      .rejects.toThrow(/not configured/);
  });

  it("throws on empty text", async () => {
    await expect(sendTelegramMessage("", cfg)).rejects.toThrow(/empty/);
  });

  it("POSTs to the sendMessage URL with chat id + text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ ok: true, result: { message_id: 777 } }),
    });
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as typeof fetch;

    const result = await sendTelegramMessage("hello", cfg);
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe(777);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe("42");
    expect(body.text).toBe("hello");
    expect(body.disable_web_page_preview).toBe(true);
  });

  it("propagates API error description", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ ok: false, description: "chat not found" }),
    });
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as typeof fetch;

    const result = await sendTelegramMessage("x", cfg);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.body).toBe("chat not found");
  });

  it("truncates very long messages to stay within Telegram's 4096 limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ ok: true, result: { message_id: 1 } }),
    });
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as typeof fetch;

    const long = "x".repeat(5000);
    await sendTelegramMessage(long, cfg);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.text.length).toBeLessThanOrEqual(4096);
    expect(body.text.endsWith("[truncated]")).toBe(true);
  });
});
