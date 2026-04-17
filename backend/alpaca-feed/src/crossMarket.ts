import { fetchYahooQuote } from "./yahoo.js";

// Cross-market context — VIX (fear), DXY (dollar), TNX (10y yields).
// SignalForge's python pulls these to colour every morning brief and to
// tilt the regime classifier toward risk-on / risk-off. We expose the
// same three tickers so the frontend can do the same.

export interface CrossMarketSnapshot {
  vix: CrossMarketTicker | null;
  dxy: CrossMarketTicker | null;
  tnx: CrossMarketTicker | null;
  regimeBias: "risk_on" | "risk_off" | "neutral";
  summary: string;
}

export interface CrossMarketTicker {
  symbol: string;
  price: number;
  previousClose: number;
  changePct: number;
}

async function fetchTicker(symbol: string): Promise<CrossMarketTicker | null> {
  try {
    const q = await fetchYahooQuote(symbol);
    if (!q || q.price <= 0 || q.previousClose <= 0) return null;
    const changePct = ((q.price - q.previousClose) / q.previousClose) * 100;
    return {
      symbol,
      price: parseFloat(q.price.toFixed(3)),
      previousClose: parseFloat(q.previousClose.toFixed(3)),
      changePct: parseFloat(changePct.toFixed(2)),
    };
  } catch (err) {
    console.warn(`[cross-market] ${symbol} failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// Pulls VIX, DXY, 10-year yield and derives a coarse risk-on/off bias.
// Rules (roughly matching SignalForge):
//   • VIX > 22 or rising > 6%       → leans risk-off
//   • VIX < 14 and SPX-proxy steady → leans risk-on
//   • DXY up > 0.6% with TNX up     → risk-off for equities
export async function fetchCrossMarketSnapshot(): Promise<CrossMarketSnapshot> {
  const [vix, dxy, tnx] = await Promise.all([
    fetchTicker("^VIX"),
    fetchTicker("DX-Y.NYB"),
    fetchTicker("^TNX"),
  ]);

  let offScore = 0;
  let onScore = 0;

  if (vix) {
    if (vix.price > 22 || vix.changePct > 6) offScore += 2;
    else if (vix.price < 14) onScore += 2;
    else if (vix.changePct > 3) offScore += 1;
    else if (vix.changePct < -3) onScore += 1;
  }
  if (dxy) {
    if (dxy.changePct > 0.6) offScore += 1;
    else if (dxy.changePct < -0.4) onScore += 1;
  }
  if (tnx) {
    if (tnx.changePct > 2) offScore += 1;
    else if (tnx.changePct < -2) onScore += 1;
  }

  const regimeBias: "risk_on" | "risk_off" | "neutral" =
    offScore - onScore >= 2 ? "risk_off" :
    onScore - offScore >= 2 ? "risk_on" :
    "neutral";

  const parts: string[] = [];
  if (vix) parts.push(`VIX ${vix.price.toFixed(1)} (${vix.changePct >= 0 ? "+" : ""}${vix.changePct.toFixed(1)}%)`);
  if (dxy) parts.push(`DXY ${dxy.price.toFixed(2)} (${dxy.changePct >= 0 ? "+" : ""}${dxy.changePct.toFixed(2)}%)`);
  if (tnx) parts.push(`10y ${(tnx.price / 10).toFixed(2)}% (${tnx.changePct >= 0 ? "+" : ""}${tnx.changePct.toFixed(2)}%)`);
  const summary = parts.length > 0 ? `${parts.join(" · ")} → ${regimeBias.replace("_", " ")}` : "cross-market data unavailable";

  return { vix, dxy, tnx, regimeBias, summary };
}
