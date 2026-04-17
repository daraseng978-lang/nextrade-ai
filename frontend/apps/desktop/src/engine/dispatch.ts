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
