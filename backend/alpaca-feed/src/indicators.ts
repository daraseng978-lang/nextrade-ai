import type { AlpacaBar } from "./types.js";

// ATR (simple average true range) over the supplied bars.
// Not Wilder-smoothed — sufficient for regime classification, not a
// replacement for your trading platform's ATR.
export function atrFromBars(bars: AlpacaBar[], period: number = 14): number {
  if (bars.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const p = bars[i - 1];
    const tr = Math.max(
      b.h - b.l,
      Math.abs(b.h - p.c),
      Math.abs(b.l - p.c),
    );
    trs.push(tr);
  }
  const sample = trs.slice(-period);
  return sample.reduce((s, x) => s + x, 0) / sample.length;
}

// Volume-weighted average price over the session. If bars already
// carry a `vw` field we prefer that (it's session-anchored from Alpaca).
export function vwapFromBars(bars: AlpacaBar[]): number {
  if (bars.length === 0) return 0;
  const last = bars[bars.length - 1];
  if (typeof last.vw === "number" && last.vw > 0) return last.vw;
  let vol = 0;
  let volPrice = 0;
  for (const b of bars) {
    const mid = (b.h + b.l + b.c) / 3;
    vol += b.v;
    volPrice += mid * b.v;
  }
  return vol > 0 ? volPrice / vol : last.c;
}

// Opening range (first N minutes of RTH). Given 1- or 5-min bars, we
// take the first `bucketBars` of the current session.
export function openingRangeFromBars(
  bars: AlpacaBar[],
  bucketBars: number = 3,
): { high: number; low: number } {
  if (bars.length === 0) return { high: 0, low: 0 };
  const sample = bars.slice(0, Math.min(bucketBars, bars.length));
  let high = -Infinity, low = Infinity;
  for (const b of sample) {
    if (b.h > high) high = b.h;
    if (b.l < low) low = b.l;
  }
  return {
    high: high === -Infinity ? bars[0].h : high,
    low:  low === Infinity ? bars[0].l : low,
  };
}

// Prior-day high / low from daily bars. Caller is responsible for
// passing daily-timeframe bars.
export function priorDayHighLow(dailyBars: AlpacaBar[]): { high: number; low: number } {
  if (dailyBars.length < 2) {
    const last = dailyBars[dailyBars.length - 1];
    return last ? { high: last.h, low: last.l } : { high: 0, low: 0 };
  }
  // bars are oldest-first in Alpaca payloads; "prior" = second-to-last
  const prior = dailyBars[dailyBars.length - 2];
  return { high: prior.h, low: prior.l };
}

// Bid/ask spread from a latest-quote payload.
export function spreadFromQuote(ap: number, bp: number): number {
  if (!isFinite(ap) || !isFinite(bp) || ap <= 0 || bp <= 0) return 0;
  return Math.max(0, ap - bp);
}
