import type { RegimeId, StrategyId } from "./types";

export const REGIMES: { id: RegimeId; label: string; description: string }[] = [
  {
    id: "strong_trend_up",
    label: "Strong Trend Up",
    description: "Directional up auction, buyers in control, higher highs.",
  },
  {
    id: "strong_trend_down",
    label: "Strong Trend Down",
    description: "Directional down auction, sellers in control, lower lows.",
  },
  {
    id: "balanced_range",
    label: "Balanced Range",
    description: "Two-way rotation inside a value area, no initiative.",
  },
  {
    id: "expansion_breakout",
    label: "Expansion Breakout",
    description: "Range break with follow-through and volatility expansion.",
  },
  {
    id: "reversal_mean_reversion",
    label: "Reversal / Mean Reversion",
    description: "Failed continuation, probe-and-reclaim, extreme stretch.",
  },
  {
    id: "low_quality_no_trade",
    label: "Low Quality / No Trade",
    description: "Thin tape, ambiguous structure, low edge.",
  },
  {
    id: "event_driven_high_risk",
    label: "Event Driven / High Risk",
    description: "Scheduled macro event window — stand aside unless event mode.",
  },
];

export const REGIME_STRATEGY_MAP: Record<RegimeId, StrategyId[]> = {
  strong_trend_up: [
    "trend_pullback_continuation",
    "opening_range_breakout",
    "breakout_continuation",
    "expansion_breakout",
  ],
  strong_trend_down: [
    "trend_pullback_continuation",
    "opening_range_breakout",
    "breakout_continuation",
    "expansion_breakout",
  ],
  balanced_range: [
    "balanced_auction_rotation",
    "balanced_range",
    "vwap_reclaim_mean_reversion",
    "liquidity_sweep_and_reclaim",
  ],
  expansion_breakout: [
    "expansion_breakout",
    "opening_range_breakout",
    "breakout_continuation",
    "trend_pullback_continuation",
  ],
  reversal_mean_reversion: [
    "vwap_reclaim_mean_reversion",
    "counter_trend_fade_failed_breakout",
    "liquidity_sweep_and_reclaim",
    "reversal_mean_reversion",
  ],
  low_quality_no_trade: ["low_quality_no_trade"],
  event_driven_high_risk: ["event_driven_high_risk"],
};
