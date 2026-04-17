import type { AlpacaBar } from "./types.js";
import {
  IBApi,
  EventName,
  SecType,
  BarSizeSetting,
  WhatToShow,
} from "@stoqey/ib";
import type { Contract } from "@stoqey/ib";

// IB Gateway connection config — override via .env
const IBKR_HOST = process.env.IBKR_HOST ?? "127.0.0.1";
const IBKR_PORT = parseInt(process.env.IBKR_PORT ?? "4002", 10);
const CONNECT_TIMEOUT_MS = 10_000;
const DATA_TIMEOUT_MS = 20_000;

// Continuous front-month contracts for each futures root.
// CONTFUT gives the active contract without specifying an expiry date.
export const IBKR_CONTRACTS: Record<string, Contract> = {
  "ES.F": { symbol: "ES",  secType: SecType.CONTFUT, exchange: "CME",   currency: "USD" },
  "NQ.F": { symbol: "NQ",  secType: SecType.CONTFUT, exchange: "CME",   currency: "USD" },
  "YM.F": { symbol: "YM",  secType: SecType.CONTFUT, exchange: "ECBOT", currency: "USD" },
  "RTY.F":{ symbol: "RTY", secType: SecType.CONTFUT, exchange: "CME",   currency: "USD" },
  "CL.F": { symbol: "CL",  secType: SecType.CONTFUT, exchange: "NYMEX", currency: "USD" },
  "GC.F": { symbol: "GC",  secType: SecType.CONTFUT, exchange: "COMEX", currency: "USD" },
};

let _ib: IBApi | null = null;
let _connectPromise: Promise<IBApi> | null = null;
let _clientId = 200; // offset from 0 to avoid clash with manual TWS logins

function openConnection(): Promise<IBApi> {
  if (_ib) return Promise.resolve(_ib);
  if (_connectPromise) return _connectPromise;

  _connectPromise = new Promise<IBApi>((resolve, reject) => {
    const ib = new IBApi({ host: IBKR_HOST, port: IBKR_PORT });

    const timer = setTimeout(() => {
      _connectPromise = null;
      ib.disconnect();
      reject(new Error(`IBKR: connect timeout (${CONNECT_TIMEOUT_MS}ms) — is IB Gateway running on port ${IBKR_PORT}?`));
    }, CONNECT_TIMEOUT_MS);

    ib.once(EventName.connected, () => {
      clearTimeout(timer);
      _ib = ib;
      _connectPromise = null;
      resolve(ib);
    });

    // 2104/2106/2158 are informational "farm connected" notices — not errors
    ib.on(EventName.error, (_err, code, _reqId) => {
      const c = code as unknown as number;
      if (c !== 2104 && c !== 2106 && c !== 2158) {
        console.warn(`[ibkr] error code=${c}: ${_err instanceof Error ? _err.message : _err}`);
      }
    });

    ib.on(EventName.disconnected, () => {
      _ib = null;
      _connectPromise = null;
    });

    ib.connect(_clientId++);
  });

  return _connectPromise;
}

export function disconnectIbkr(): void {
  _ib?.disconnect();
  _ib = null;
}

let _nextReqId = 1000;

export async function fetchIbkrDailyBars(
  stooqSymbol: string,
  limit = 10,
): Promise<AlpacaBar[]> {
  const contract = IBKR_CONTRACTS[stooqSymbol];
  if (!contract) throw new Error(`IBKR: no contract mapping for ${stooqSymbol}`);

  const ib = await openConnection();
  const reqId = _nextReqId++;

  return new Promise<AlpacaBar[]>((resolve, reject) => {
    const bars: AlpacaBar[] = [];

    const timer = setTimeout(() => {
      ib.removeListener(EventName.historicalData, onBar);
      reject(new Error(`IBKR: data timeout for ${stooqSymbol}`));
    }, DATA_TIMEOUT_MS);

    // @stoqey/ib emits historicalData once per bar, then once more with
    // time="finished-<start>-<end>" and all-(-1) values to signal completion.
    const onBar = (
      id: number,
      time: string,
      open: number,
      high: number,
      low: number,
      close: number,
      volume: number,
    ) => {
      if (id !== reqId) return;

      if (time.startsWith("finished")) {
        clearTimeout(timer);
        ib.removeListener(EventName.historicalData, onBar);
        // bars arrive oldest-first; trim to limit
        resolve(bars.slice(-limit));
        return;
      }

      // formatDate=1 → "YYYYMMDD" for daily bars
      if (time.length < 8) return;
      const iso = `${time.slice(0, 4)}-${time.slice(4, 6)}-${time.slice(6, 8)}T00:00:00Z`;
      if (!isFinite(open) || !isFinite(high) || !isFinite(low) || !isFinite(close)) return;
      bars.push({ t: iso, o: open, h: high, l: low, c: close, v: volume ?? 0 });
    };

    ib.on(EventName.historicalData, onBar);

    ib.reqHistoricalData(
      reqId,
      contract,
      "",                       // endDateTime: "" = now
      "10 D",                   // 10 calendar days covers 6-7 trading days
      BarSizeSetting.DAYS_ONE,
      WhatToShow.TRADES,
      1,                        // useRTH: 1 = regular trading hours only
      1,                        // formatDate: 1 = YYYYMMDD string
      false,                    // keepUpToDate: false = one-shot snapshot
    );
  });
}
