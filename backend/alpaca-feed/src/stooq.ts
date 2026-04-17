import type { AlpacaBar } from "./types.js";

// Stooq.com — free, keyless, covers all major futures natively.
// Returns CSV with real futures prices; no ETF proxy or scaling needed.
// URL format: https://stooq.com/q/d/l/?s=ES.F&i=d  (daily, oldest-first)

const HOST = "https://stooq.com/q/d/l";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const MIN_REQUEST_GAP_MS = 200;
let nextAllowedAt = 0;

async function pace(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextAllowedAt - now);
  nextAllowedAt = Math.max(now, nextAllowedAt) + MIN_REQUEST_GAP_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export async function fetchStooqDailyBars(
  symbol: string,
  limit: number = 10,
): Promise<AlpacaBar[]> {
  await pace();
  const url = `${HOST}/?s=${encodeURIComponent(symbol)}&i=d`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/csv,text/plain,*/*" },
  });
  if (!res.ok) throw new Error(`Stooq ${res.status} for ${symbol}`);
  const text = await res.text();
  return parseCsv(text, symbol, limit);
}

function parseCsv(csv: string, symbol: string, limit: number): AlpacaBar[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) throw new Error(`Stooq: empty response for ${symbol}`);
  if (
    csv.toLowerCase().includes("no data") ||
    !lines[0].toLowerCase().includes("date")
  ) {
    throw new Error(`Stooq: no data for ${symbol}`);
  }
  const bars: AlpacaBar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 5) continue;
    const [date, open, high, low, close, volume] = parts;
    const o = parseFloat(open);
    const h = parseFloat(high);
    const l = parseFloat(low);
    const c = parseFloat(close);
    if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) continue;
    bars.push({
      t: new Date(date.trim() + "T00:00:00Z").toISOString(),
      o, h, l, c,
      v: volume ? parseFloat(volume) || 0 : 0,
    });
  }
  if (bars.length === 0) throw new Error(`Stooq: could not parse bars for ${symbol}`);
  // Stooq returns oldest-first; take the last `limit` bars
  return bars.slice(-limit);
}
