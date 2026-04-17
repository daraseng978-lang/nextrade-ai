import { useCallback, useState } from "react";
import { useWorkstation } from "../state/WorkstationContext";
import type { TradersPostDispatch } from "../engine/types";
import { dispatchToTradersPost, dispatchTelegram } from "../engine/dispatch";
import { formatSentMessage } from "../engine/telegramMessages";

interface QuickTradeForm {
  symbol: string;
  side: "long" | "short";
  entry: string;
  stop: string;
  target: string;
  quantity: string;
  notifyTelegram: boolean;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function QuickTradePage() {
  const { contexts, dispatchConfig, telegramConfig, pushEvent, logExecution } = useWorkstation();
  const [form, setForm] = useState<QuickTradeForm>({
    symbol: contexts[0]?.instrument.symbol || "MES",
    side: "long",
    entry: "",
    stop: "",
    target: "",
    quantity: "1",
    notifyTelegram: telegramConfig.enabled,
  });
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleChange = useCallback(
    (key: keyof QuickTradeForm, value: string | boolean) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const validateForm = (): string | null => {
    if (!form.symbol) return "Symbol required";
    if (!form.entry || isNaN(Number(form.entry)) || Number(form.entry) <= 0)
      return "Valid entry price required";
    if (!form.stop || isNaN(Number(form.stop)) || Number(form.stop) <= 0)
      return "Valid stop price required";
    if (!form.target || isNaN(Number(form.target)) || Number(form.target) <= 0)
      return "Valid target price required";
    if (!form.quantity || isNaN(Number(form.quantity)) || Number(form.quantity) <= 0)
      return "Quantity must be > 0";

    const entry = Number(form.entry);
    const stop = Number(form.stop);
    const target = Number(form.target);

    if (form.side === "long" && stop >= entry) return "Stop must be below entry for LONG";
    if (form.side === "long" && target <= entry) return "Target must be above entry for LONG";
    if (form.side === "short" && stop <= entry) return "Stop must be above entry for SHORT";
    if (form.side === "short" && target >= entry) return "Target must be below entry for SHORT";

    return null;
  };

  const handleExecute = useCallback(async () => {
    const error = validateForm();
    if (error) {
      setStatus(`❌ ${error}`);
      return;
    }

    setLoading(true);
    setStatus("Sending...");

    try {
      const payload: TradersPostDispatch = {
        ticker: form.symbol,
        action: form.side === "long" ? "buy" : "sell",
        orderType: "limit",
        price: round(Number(form.entry)),
        quantity: Number(form.quantity),
        stopLoss: { type: "stop", stopPrice: round(Number(form.stop)) },
        takeProfit: { limitPrice: round(Number(form.target)) },
        sentiment: form.side === "long" ? "bullish" : "bearish",
        strategy: "opening_range_breakout",
      };

      const result = await dispatchToTradersPost(payload, dispatchConfig);

      if (result.ok) {
        const sideLabel = form.side === "long" ? "LONG" : "SHORT";
        setStatus(`✓ Sent! ${sideLabel} ${form.quantity}x ${form.symbol} @ ${form.entry}`);
        logExecution({
          id: `quick-${Date.now()}`,
          timestamp: new Date().toISOString(),
          symbol: form.symbol,
          side: form.side,
          contracts: Number(form.quantity),
          entryPrice: Number(form.entry),
          stopPrice: Number(form.stop),
          tp1Price: Number(form.target),
          tp2Price: Number(form.target),
          stopDistance: Math.abs(Number(form.entry) - Number(form.stop)),
          rMultiple: Math.abs(Number(form.target) - Number(form.entry)) / Math.abs(Number(form.entry) - Number(form.stop)),
          perContractRisk: 0,
          accountRiskDollars: 0,
          notionalDollars: 0,
          strategy: "opening_range_breakout",
          strategyLabel: "Manual Trade",
          regime: "manual" as any,
          regimeConfidence: 0,
          rawScore: 0,
          adjustedScore: 0,
          playbookReasons: [],
          state: "best_available",
          status: "open",
        });

        pushEvent({
          kind: "manual_trade_sent",
          symbol: form.symbol,
          detail: `Manual ${form.side === "long" ? "LONG" : "SHORT"} ${form.quantity}x @ ${form.entry} → ${result.message}`,
        });

        if (form.notifyTelegram && telegramConfig.enabled) {
          const sideLabel = form.side === "long" ? "LONG" : "SHORT";
          const msg = `🟢 MANUAL SENT\n${form.symbol} ${sideLabel}\n${form.quantity}ct @ ${form.entry}\nStop ${form.stop} · TP ${form.target}\nTradersPost ${result.status}`;
          await dispatchTelegram(msg, telegramConfig);
        }

        setForm({ ...form, entry: "", stop: "", target: "", quantity: "1" });
      } else {
        setStatus(`✗ Failed: ${result.message}`);
        pushEvent({
          kind: "manual_trade_failed",
          symbol: form.symbol,
          detail: `Manual ${form.side === "long" ? "LONG" : "SHORT"} failed: ${result.message}`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`✗ Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [form, dispatchConfig, telegramConfig, logExecution, pushEvent]);

  const symbols = contexts.map((c) => c.instrument.symbol);

  return (
    <div className="quick-trade-page">
      <div className="quick-trade-container">
        <h1>Quick Trade</h1>
        <p className="subtitle">Bypass signals — execute manual trades directly</p>

        <form className="quick-trade-form" onSubmit={(e) => { e.preventDefault(); handleExecute(); }}>
          {/* Symbol */}
          <div className="form-group">
            <label>Symbol</label>
            <select
              value={form.symbol}
              onChange={(e) => handleChange("symbol", e.target.value)}
              disabled={loading}
            >
              {symbols.map((sym) => (
                <option key={sym} value={sym}>
                  {sym}
                </option>
              ))}
            </select>
          </div>

          {/* Side */}
          <div className="form-group">
            <label>Direction</label>
            <div className="side-toggle">
              <button
                type="button"
                className={`side-btn ${form.side === "long" ? "active" : ""}`}
                onClick={() => handleChange("side", "long")}
                disabled={loading}
              >
                LONG
              </button>
              <button
                type="button"
                className={`side-btn ${form.side === "short" ? "active" : ""}`}
                onClick={() => handleChange("side", "short")}
                disabled={loading}
              >
                SHORT
              </button>
            </div>
          </div>

          {/* Entry, Stop, Target */}
          <div className="form-row">
            <div className="form-group">
              <label>Entry</label>
              <input
                type="number"
                step="0.01"
                value={form.entry}
                onChange={(e) => handleChange("entry", e.target.value)}
                placeholder="Price"
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>Stop</label>
              <input
                type="number"
                step="0.01"
                value={form.stop}
                onChange={(e) => handleChange("stop", e.target.value)}
                placeholder="Price"
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>Target</label>
              <input
                type="number"
                step="0.01"
                value={form.target}
                onChange={(e) => handleChange("target", e.target.value)}
                placeholder="Price"
                disabled={loading}
              />
            </div>
          </div>

          {/* Quantity */}
          <div className="form-group">
            <label>Quantity</label>
            <input
              type="number"
              step="1"
              min="1"
              value={form.quantity}
              onChange={(e) => handleChange("quantity", e.target.value)}
              placeholder="1"
              disabled={loading}
            />
          </div>

          {/* Telegram notification */}
          <div className="form-group checkbox">
            <input
              type="checkbox"
              id="notify-tg"
              checked={form.notifyTelegram}
              onChange={(e) => handleChange("notifyTelegram", e.target.checked)}
              disabled={loading || !telegramConfig.enabled}
            />
            <label htmlFor="notify-tg">Notify Telegram</label>
          </div>

          {/* Status */}
          {status && <div className={`status-message ${status.includes("✓") ? "ok" : status.includes("✗") ? "error" : "loading"}`}>{status}</div>}

          {/* Execute Button */}
          <button type="submit" className="btn-execute" disabled={loading}>
            {loading ? "Sending..." : "Execute Trade"}
          </button>
        </form>

        {/* Info box */}
        <div className="quick-trade-info">
          <h3>⚠️ Manual Trades</h3>
          <ul>
            <li>Executes immediately — no approval workflow</li>
            <li>Logs to journal automatically</li>
            <li>Sends to TradersPost if dispatch enabled</li>
            <li>Optionally notifies Telegram</li>
            <li>Respects compliance rules (prop firm limits, etc.)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
