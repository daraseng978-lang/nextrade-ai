import type { AlpacaBar } from "./types.js";

// Yahoo Finance chart API — free, keyless, ~15 min delayed. Mirrors the
// pattern SignalForge's python `fetch_yahoo()` uses. We hit
//   https://query1.finance.yahoo.com/v8/finance/chart/<symbol>
// and parse `chart.result[0].{timestamp, indicators.quote[0]}` into our
// AlpacaBar shape so the rest of the pipeline (ATR, VWAP, regime,
// opening range) is provider-agnostic.

const YAHOO_HOST = "https://query1.finance.yahoo.com/v8/finance/chart";

// Yahoo's anti-scrape heuristics get friendlier with a browser UA.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// Yahoo 429s aggressively if we burst. Serialize with a small gap.
const MIN_REQUEST_GAP_MS = 350;
let nextAllowedAt = 0;

async function pace(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextAllowedAt - now);
  nextAllowedAt = Math.max(now, nextAllowedAt) + MIN_REQUEST_GAP_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

interface YahooChartResponse {
  chart: {
    result?: Array<{
      meta: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        symbol: string;
      };
      timestamp?: number[];
      indicators: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
}

export interface YahooQuote {
  symbol: string;
  price: number;
  previousClose: number;
}

export interface YahooBundle {
  symbol: string;
  intraday: AlpacaBar[];
  daily: AlpacaBar[];
  quote: YahooQuote | null;
}

async function fetchChart(
  symbol: string,
  interval: string,
  range: string,
  retries = 2,
): Promise<YahooChartResponse> {
  const url =
    `${YAHOO_HOST}/${encodeURIComponent(symbol)}` +
    `?interval=${encodeURIComponent(interval)}` +
    `&range=${encodeURIComponent(range)}` +
    `&includePrePost=false`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await pace();
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.status === 429) {
      if (attempt >= retries) {
        throw new Error(`Yahoo 429 rate-limited after ${retries + 1} attempts for ${symbol}`);
      }
      // Exponential backoff on 429 — 1.5s, 4.5s
      const backoff = 1500 * Math.pow(3, attempt);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Yahoo ${res.status} ${res.statusText} for ${symbol}: ${body.slice(0, 200)}`);
    }
    return res.json() as Promise<YahooChartResponse>;
  }
  throw new Error(`Yahoo fetch exhausted retries for ${symbol}`);
}

function parseBars(resp: YahooChartResponse): AlpacaBar[] {
  const r = resp.chart.result?.[0];
  if (!r || !r.timestamp || !r.indicators.quote?.[0]) return [];
  const q = r.indicators.quote[0];
  const out: AlpacaBar[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({
      t: new Date(r.timestamp[i] * 1000).toISOString(),
      o, h, l, c,
      v: v ?? 0,
    });
  }
  return out;
}

function parseQuote(resp: YahooChartResponse): YahooQuote | null {
  const r = resp.chart.result?.[0];
  if (!r) return null;
  const price = r.meta.regularMarketPrice ?? 0;
  const previousClose = r.meta.chartPreviousClose ?? r.meta.previousClose ?? 0;
  return { symbol: r.meta.symbol, price, previousClose };
}

// Single-call fetch: one chart request carries bars + meta-derived quote.
export async function fetchYahooIntradayBars(symbol: string): Promise<AlpacaBar[]> {
  const resp = await fetchChart(symbol, "5m", "1d");
  return parseBars(resp);
}

export async function fetchYahooDailyBars(symbol: string): Promise<AlpacaBar[]> {
  const resp = await fetchChart(symbol, "1d", "10d");
  return parseBars(resp);
}

export async function fetchYahooQuote(symbol: string): Promise<YahooQuote | null> {
  const resp = await fetchChart(symbol, "1d", "5d");
  return parseQuote(resp);
}

// Combined fetch: pulls intraday + daily (quote derived from daily meta).
// Two chart calls per symbol instead of three. All requests serialize
// through pace() at the module level so N symbols = N×2 paced calls,
// keeping us under Yahoo's free-tier burst threshold.
export async function fetchYahooBundle(symbol: string): Promise<YahooBundle> {
  const [intradayResp, dailyResp] = [
    await fetchChart(symbol, "5m", "1d"),
    await fetchChart(symbol, "1d", "10d"),
  ];
  return {
    symbol,
    intraday: parseBars(intradayResp),
    daily: parseBars(dailyResp),
    quote: parseQuote(dailyResp),
  };
}
