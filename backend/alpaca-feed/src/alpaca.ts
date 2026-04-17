import type { AlpacaBar, AlpacaLatestQuote } from "./types.js";

const DATA_HOST = "https://data.alpaca.markets/v2";

export interface AlpacaConfig {
  keyId: string;
  secretKey: string;
  feed: "iex" | "sip";
}

function headers(cfg: AlpacaConfig): HeadersInit {
  return {
    "APCA-API-KEY-ID": cfg.keyId,
    "APCA-API-SECRET-KEY": cfg.secretKey,
    "Accept": "application/json",
  };
}

async function fetchJson<T>(url: string, cfg: AlpacaConfig): Promise<T> {
  const res = await fetch(url, { headers: headers(cfg) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Alpaca ${res.status} ${res.statusText} for ${url}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// Latest quote (bid/ask).
export async function fetchLatestQuote(
  cfg: AlpacaConfig,
  symbol: string,
): Promise<AlpacaLatestQuote | null> {
  const url = `${DATA_HOST}/stocks/${encodeURIComponent(symbol)}/quotes/latest?feed=${cfg.feed}`;
  const payload = await fetchJson<{ quote?: AlpacaLatestQuote }>(url, cfg);
  return payload.quote ?? null;
}

// Intraday bars — default last ~2 hours of 5Min bars during RTH.
export async function fetchIntradayBars(
  cfg: AlpacaConfig,
  symbol: string,
  timeframe: string = "5Min",
  limit: number = 24,
): Promise<AlpacaBar[]> {
  const url =
    `${DATA_HOST}/stocks/${encodeURIComponent(symbol)}/bars` +
    `?timeframe=${encodeURIComponent(timeframe)}` +
    `&limit=${limit}` +
    `&feed=${cfg.feed}` +
    `&adjustment=raw`;
  const payload = await fetchJson<{ bars?: AlpacaBar[] }>(url, cfg);
  return payload.bars ?? [];
}

// Daily bars — last ~15 calendar days windowed back from yesterday so
// we catch at least 5 trading days' worth of prior-H/L + liquidity
// baseline. The explicit `start` + `end` params are friendlier than
// `limit` alone on the free IEX tier, which sometimes returns an empty
// array when only `limit` is specified.
export async function fetchDailyBars(
  cfg: AlpacaConfig,
  symbol: string,
  limit: number = 10,
): Promise<AlpacaBar[]> {
  const end = new Date();
  // Shift end one day back to make sure we only ask for completed sessions.
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 20); // 20 calendar days ≈ 14 trading
  const url =
    `${DATA_HOST}/stocks/${encodeURIComponent(symbol)}/bars` +
    `?timeframe=1Day` +
    `&start=${encodeURIComponent(start.toISOString())}` +
    `&end=${encodeURIComponent(end.toISOString())}` +
    `&limit=${limit}` +
    `&feed=${cfg.feed}` +
    `&adjustment=raw`;
  const payload = await fetchJson<{ bars?: AlpacaBar[] }>(url, cfg);
  return payload.bars ?? [];
}
