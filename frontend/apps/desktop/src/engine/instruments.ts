import type { Instrument } from "./types";

export const INSTRUMENTS: Instrument[] = [
  {
    symbol: "MES",
    name: "Micro E-mini S&P 500",
    tickSize: 0.25,
    tickValue: 1.25,
    pointValue: 5,
    session: "RTH",
    category: "equity_future",
  },
  {
    symbol: "MNQ",
    name: "Micro E-mini Nasdaq-100",
    tickSize: 0.25,
    tickValue: 0.5,
    pointValue: 2,
    session: "RTH",
    category: "equity_future",
  },
  {
    symbol: "MYM",
    name: "Micro E-mini Dow",
    tickSize: 1.0,
    tickValue: 0.5,
    pointValue: 0.5,
    session: "RTH",
    category: "equity_future",
  },
  {
    symbol: "M2K",
    name: "Micro E-mini Russell 2000",
    tickSize: 0.1,
    tickValue: 0.5,
    pointValue: 5,
    session: "RTH",
    category: "equity_future",
  },
  {
    symbol: "MCL",
    name: "Micro WTI Crude Oil",
    tickSize: 0.01,
    tickValue: 1.0,
    pointValue: 100,
    session: "ETH",
    category: "energy_future",
  },
  {
    symbol: "MGC",
    name: "Micro Gold",
    tickSize: 0.1,
    tickValue: 1.0,
    pointValue: 10,
    session: "ETH",
    category: "metal_future",
  },
];

export const byId = (symbol: string): Instrument =>
  INSTRUMENTS.find((i) => i.symbol === symbol) ?? INSTRUMENTS[0];
