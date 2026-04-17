import type { TradersPostDispatch } from "./types";

// Frontend dispatch helper: POSTs the TradersPost-formatted order to a
// backend proxy that holds the actual webhook URL + secret. The
// browser never sees the webhook URL.

export interface DispatchConfig {
  enabled: boolean;
  endpoint: string;       // backend dispatch URL, e.g. http://localhost:3001/dispatch/traderspost
}

export interface DispatchResult {
  ok: boolean;
  status: number;
  message: string;
  forwardedTo?: string;
  body?: string;
}

export const DEFAULT_DISPATCH_CONFIG: DispatchConfig = {
  enabled: false,
  endpoint: "http://localhost:3001/dispatch/traderspost",
};

// Telegram dispatch — backend holds the bot token + chat id.
// Per-trigger toggles let the user pick what's noisy enough to be useful.

export interface TelegramConfig {
  enabled: boolean;
  endpoint: string;
  triggers: {
    brief: boolean;     // daily pre-market brief (once per session)
    signal: boolean;    // new selected signal (tradeable candidates only)
    approval: boolean;  // approval-needed + approval-given transitions
    sent: boolean;      // trade sent (manual or Auto Pilot)
  };
}

export const DEFAULT_TELEGRAM_CONFIG: TelegramConfig = {
  enabled: false,
  endpoint: "http://localhost:3001/dispatch/telegram",
  triggers: { brief: true, signal: false, approval: true, sent: true },
};

export interface TelegramDispatchResult {
  ok: boolean;
  status: number;
  message: string;
  messageId?: number;
}

export async function dispatchTelegram(
  text: string,
  config: TelegramConfig,
): Promise<TelegramDispatchResult> {
  if (!config.enabled) {
    return { ok: true, status: 0, message: "telegram disabled" };
  }
  if (!config.endpoint || !text) {
    return { ok: false, status: 0, message: "no endpoint or empty text" };
  }
  try {
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const json = await res.json().catch(() => ({}));
    return {
      ok: res.ok && json.ok !== false,
      status: res.status,
      message: res.ok ? (json.body ?? "sent") : (json.error ?? `HTTP ${res.status}`),
      messageId: json.messageId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, message: `telegram failed: ${msg}` };
  }
}

export async function dispatchToTradersPost(
  payload: TradersPostDispatch,
  config: DispatchConfig,
): Promise<DispatchResult> {
  if (!config.enabled) {
    return { ok: true, status: 0, message: "dispatch disabled (mock send)" };
  }
  if (!config.endpoint) {
    return { ok: false, status: 0, message: "no dispatch endpoint configured" };
  }
  try {
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    return {
      ok: res.ok && json.ok !== false,
      status: res.status,
      message: res.ok ? "dispatched" : (json.error ?? `HTTP ${res.status}`),
      forwardedTo: json.forwardedTo,
      body: json.body,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, message: `dispatch failed: ${msg}` };
  }
}
