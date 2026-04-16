import { INSTRUMENTS } from "./instruments";
import type { InstrumentContext, RegimeId } from "./types";

// Deterministic mock scanner feed — seeded per symbol so the decision engine
// produces stable, reviewable output across reloads.
export function mockContexts(): InstrumentContext[] {
  return INSTRUMENTS.map((inst, idx) => {
    const seed = idx + 1;
    const basePrice =
      inst.symbol === "MES" ? 5123.5 :
      inst.symbol === "MNQ" ? 17894.0 :
      inst.symbol === "MYM" ? 38120 :
      inst.symbol === "M2K" ? 2034.8 :
      inst.symbol === "MCL" ? 78.92 :
      2340.4;

    const atr = basePrice * 0.004 + seed * 0.3;
    const regime: RegimeId =
      idx === 0 ? "strong_trend_up" :
      idx === 1 ? "expansion_breakout" :
      idx === 2 ? "balanced_range" :
      idx === 3 ? "reversal_mean_reversion" :
      idx === 4 ? "strong_trend_down" :
      "low_quality_no_trade";

    return {
      instrument: inst,
      price: basePrice,
      atr,
      vwap: basePrice - atr * 0.2,
      openingRange: { high: basePrice + atr * 0.8, low: basePrice - atr * 0.6 },
      priorHigh: basePrice + atr * 1.4,
      priorLow: basePrice - atr * 1.3,
      regime,
      regimeConfidence:
        regime === "low_quality_no_trade" ? 0.25 :
        regime === "reversal_mean_reversion" ? 0.6 :
        regime === "balanced_range" ? 0.55 :
        regime === "expansion_breakout" ? 0.72 :
        0.78,
      liquidityScore:
        inst.category === "equity_future" ? 0.9 :
        inst.category === "metal_future" ? 0.75 :
        0.7,
      eventRisk: idx === 4 ? 0.35 : 0.15,
      spread: inst.tickSize,
    };
  });
}
