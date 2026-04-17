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

async function fetchChart(
  symbol: string,
  interval: string,
  range: string,
): Promise<YahooChartResponse> {
  const url =
    `${YAHOO_HOST}/${encodeURIComponent(symbol)}` +
    `?interval=${encodeURIComponent(interval)}` +
    `&range=${encodeURIComponent(range)}` +
    `&includePrePost=false`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Yahoo ${res.status} ${res.statusText} for ${symbol}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<YahooChartResponse>;
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

// 5-minute intraday bars for the current session (~2 hours).
export async function fetchYahooIntradayBars(symbol: string): Promise<AlpacaBar[]> {
  const resp = await fetchChart(symbol, "5m", "1d");
  return parseBars(resp);
}

// Daily bars — 10 days gets us prior-H/L plus a cushion for gaps/holidays.
export async function fetchYahooDailyBars(symbol: string): Promise<AlpacaBar[]> {
  const resp = await fetchChart(symbol, "1d", "10d");
  return parseBars(resp);
}

// Latest price + prior close from the chart meta block. Avoids a second
// API hit for quote data.
export async function fetchYahooQuote(symbol: string): Promise<YahooQuote | null> {
  const resp = await fetchChart(symbol, "1d", "5d");
  const r = resp.chart.result?.[0];
  if (!r) return null;
  const price = r.meta.regularMarketPrice ?? 0;
  const previousClose = r.meta.chartPreviousClose ?? r.meta.previousClose ?? 0;
  return { symbol: r.meta.symbol, price, previousClose };
}
