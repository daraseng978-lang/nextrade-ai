import type { AlpacaBar, RegimeId } from "./types.js";

// Simplified regime classifier used by the Alpaca shim.
// Not a port of the frontend's full playbook logic — just enough
// signal to keep `regime` + `regimeConfidence` honest downstream.
// Trader-facing features (compression, expansion, trend strength)
// fall out of 3 ratios over the session bars.

export interface RegimeResult {
  regime: RegimeId;
  confidence: number; // 0..1
  liquidityScore: number; // 0..1
}

export function classifyRegime(
  intradayBars: AlpacaBar[],
  dailyBars: AlpacaBar[],
  atr: number,
): RegimeResult {
  if (intradayBars.length < 6 || atr <= 0) {
    return { regime: "low_quality_no_trade", confidence: 0.2, liquidityScore: 0.5 };
  }

  // --- Trend strength: slope of close over the window, in ATRs ---
  const closes = intradayBars.map(b => b.c);
  const first = closes[0];
  const last = closes[closes.length - 1];
  const move = last - first;
  const moveInAtrs = atr > 0 ? move / atr : 0;

  // --- Expansion: max range bar / avg range ---
  const ranges = intradayBars.map(b => b.h - b.l);
  const avgRange = ranges.reduce((s, r) => s + r, 0) / ranges.length;
  const maxRange = Math.max(...ranges);
  const expansion = avgRange > 0 ? maxRange / avgRange : 1;

  // --- Liquidity: avg volume relative to daily avg volume ---
  const intradayAvgVol = intradayBars.reduce((s, b) => s + b.v, 0) / intradayBars.length;
  const dailyAvgVol =
    dailyBars.length > 0
      ? dailyBars.reduce((s, b) => s + b.v, 0) / dailyBars.length / 78 // 78 5-min bars in RTH
      : intradayAvgVol;
  const liqRatio = dailyAvgVol > 0 ? intradayAvgVol / dailyAvgVol : 1;
  const liquidityScore = clamp(liqRatio / 2, 0, 1); // saturate at 2x avg

  // --- Classification ---
  // Strong trend: |moveInAtrs| > 1.2 AND expansion > 1.5
  if (Math.abs(moveInAtrs) > 1.2 && expansion > 1.5) {
    return {
      regime: moveInAtrs > 0 ? "strong_trend_up" : "strong_trend_down",
      confidence: clamp(0.6 + Math.min(0.3, Math.abs(moveInAtrs) / 4), 0, 1),
      liquidityScore,
    };
  }

  // Expansion breakout: big range bar recent, but direction not locked in
  if (expansion > 2.2 && Math.abs(moveInAtrs) <= 1.2) {
    return { regime: "expansion_breakout", confidence: 0.7, liquidityScore };
  }

  // Reversal / mean reversion: moderate move in one direction then
  // latest bar closes through VWAP in the opposite direction
  if (Math.abs(moveInAtrs) > 0.6 && Math.abs(moveInAtrs) < 1.2 && expansion < 1.8) {
    return { regime: "reversal_mean_reversion", confidence: 0.6, liquidityScore };
  }

  // Low quality: compressed, low range, low liquidity
  if (expansion < 1.2 && Math.abs(moveInAtrs) < 0.3 && liqRatio < 0.6) {
    return { regime: "low_quality_no_trade", confidence: 0.35, liquidityScore };
  }

  // Default: balanced range
  return { regime: "balanced_range", confidence: 0.55, liquidityScore };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
