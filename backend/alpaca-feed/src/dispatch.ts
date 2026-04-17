// TradersPost dispatch — forwards a normalized order payload to the
// user's TradersPost strategy webhook URL. Webhook URL stays
// server-side (env), never reaches the browser.

export interface TradersPostDispatchPayload {
  ticker: string;
  action: "buy" | "sell";
  orderType: "market" | "limit";
  quantity: number;
  price?: number;
  stopLoss: { type: "stop"; stopPrice: number };
  takeProfit: { limitPrice: number };
  sentiment: "bullish" | "bearish";
  strategy: string;
}

export interface DispatchResult {
  ok: boolean;
  status: number;
  body: string;
  forwardedTo: string;
}

export async function dispatchTradersPost(
  payload: TradersPostDispatchPayload,
  webhookUrl: string,
): Promise<DispatchResult> {
  if (!webhookUrl) {
    throw new Error("TradersPost webhook URL not configured (TRADERSPOST_WEBHOOK_URL)");
  }
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.text().catch(() => "");
  return {
    ok: res.ok,
    status: res.status,
    body: body.slice(0, 500),
    forwardedTo: redactWebhook(webhookUrl),
  };
}

// Redact the secret token portion of the webhook URL so it can be
// returned to the browser safely (browser sees the host but not the
// strategy/secret).
export function redactWebhook(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const masked = segments.map((s, i) =>
      i === segments.length - 1 && s.length > 3 ? `${s.slice(0, 3)}…` : s,
    );
    return `${u.origin}/${masked.join("/")}`;
  } catch {
    return "(invalid url)";
  }
}

// Lightweight payload validation so a bad caller fails fast with a
// useful 400 instead of TradersPost rejecting silently.
export function validatePayload(p: unknown): TradersPostDispatchPayload {
  const obj = p as Partial<TradersPostDispatchPayload>;
  if (!obj?.ticker)              throw new Error("payload.ticker required");
  if (obj.action !== "buy" && obj.action !== "sell") throw new Error("payload.action must be buy|sell");
  if (typeof obj.quantity !== "number" || obj.quantity <= 0) throw new Error("payload.quantity must be > 0");
  if (obj.orderType !== "market" && obj.orderType !== "limit") throw new Error("payload.orderType must be market|limit");
  if (!obj.stopLoss?.stopPrice)  throw new Error("payload.stopLoss.stopPrice required");
  if (!obj.takeProfit?.limitPrice) throw new Error("payload.takeProfit.limitPrice required");
  return obj as TradersPostDispatchPayload;
}
