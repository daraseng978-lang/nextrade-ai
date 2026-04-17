import type { AlpacaBar } from "./types.js";

// Twelve Data — free 800 req/day tier, has real futures symbols.
// We only use it for daily bars; intraday still comes from Alpaca
// (quotes are fine there — the IEX tier just has sparse daily bars).
//
// Symbol convention: Twelve Data uses plain futures roots (ES, NQ,
// YM, RTY, CL, GC) without the =F suffix. API reference:
//   https://api.twelvedata.com/time_series?symbol=NQ&interval=1day&apikey=XX

const HOST = "https://api.twelvedata.com";

interface TwelveDataResponse {
  meta?: { symbol: string; interval: string; currency: string; exchange: string };
  values?: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume?: string;
  }>;
  status?: "ok" | "error";
  code?: number;
  message?: string;
}

export async function fetchTwelveDataDailyBars(
  symbol: string,
  apiKey: string,
  outputsize: number = 10,
): Promise<AlpacaBar[]> {
  if (!apiKey) throw new Error("Twelve Data: no API key");
  const url =
    `${HOST}/time_series?symbol=${encodeURIComponent(symbol)}` +
    `&interval=1day` +
    `&outputsize=${outputsize}` +
    `&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Twelve Data ${res.status} ${res.statusText} for ${symbol}: ${body.slice(0, 200)}`);
  }
  const payload = (await res.json()) as TwelveDataResponse;
  if (payload.status === "error") {
    throw new Error(`Twelve Data error for ${symbol}: ${payload.message ?? "unknown"}`);
  }
  const values = payload.values ?? [];
  // Twelve Data returns newest-first — reverse so we match Alpaca's oldest-first.
  return values.slice().reverse().map(v => ({
    t: new Date(v.datetime).toISOString(),
    o: parseFloat(v.open),
    h: parseFloat(v.high),
    l: parseFloat(v.low),
    c: parseFloat(v.close),
    v: v.volume ? parseFloat(v.volume) : 0,
  })).filter(b => isFinite(b.o) && isFinite(b.h) && isFinite(b.l) && isFinite(b.c));
}
