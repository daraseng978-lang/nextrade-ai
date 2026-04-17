import { useMemo, useState } from "react";
import { useWorkstation } from "../state/WorkstationContext";
import { formatExecution } from "../engine/executionFormatter";

type Tab = "telegram" | "kv" | "json";

export function ExecutionPanel() {
  const {
    selected,
    executionState,
    approve,
    send,
    autoPilot,
    setAutoPilot,
    autoPilotMinScore,
    autoTradeCount,
    preMarketBrief,
    lastAutoPilotDecision,
  } = useWorkstation();
  const [tab, setTab] = useState<Tab>("telegram");
  const outputs = useMemo(() => formatExecution(selected), [selected]);

  const body =
    tab === "telegram" ? outputs.telegram :
    tab === "kv" ? outputs.keyValue :
    outputs.json;

  const canApprove = executionState === "draft";
  const canSend = executionState === "approved" || executionState === "reduced_approved";

  const maxTrades = preMarketBrief.mentalReadiness.suggestedMaxTrades;
  const holdNote =
    autoPilot &&
    lastAutoPilotDecision?.action === "skip" &&
    !["autopilot_off", "already_processed", "not_draft"].includes(lastAutoPilotDecision.reasonCode)
      ? lastAutoPilotDecision.reason
      : null;

  return (
    <section className="panel">
      <div className="exec-head">
        <div>
          <h2>Execution · TradersPost dispatch</h2>
          <small>
            All formats derived from one normalized signal object.{" "}
            Watch-only signals never flip to live-ready.
          </small>
        </div>
        <button
          className={`autopilot-toggle ${autoPilot ? "on" : ""}`}
          onClick={() => {
            if (!autoPilot) {
              const ok = confirm(
                `Arm Auto Pilot?\n\n` +
                `System will auto-approve + auto-send when all guardrails pass:\n` +
                `  · adjusted score ≥ ${autoPilotMinScore.toFixed(2)}\n` +
                `  · kill switch off · no hard block\n` +
                `  · prop-firm compliance passing\n` +
                `  · Reggie readiness ≠ stand aside\n` +
                `  · ≤ ${maxTrades} trades today\n\n` +
                `Disarm any time.`,
              );
              if (!ok) return;
            }
            setAutoPilot(!autoPilot);
          }}
          title={autoPilot ? "Auto Pilot is armed — click to disarm" : "Arm Auto Pilot"}
        >
          <span className={`autopilot-dot ${autoPilot ? "on" : ""}`} />
          {autoPilot
            ? `AUTO PILOT · ${autoTradeCount}/${maxTrades}`
            : "AUTO PILOT OFF"}
        </button>
      </div>

      {autoPilot && holdNote && (
        <div className="autopilot-hold">
          <span className="autopilot-hold-tag">HOLDING</span>
          <span>{holdNote}</span>
        </div>
      )}
      <div className="tabs" style={{ marginTop: 8 }}>
        <span className={`tab ${tab === "telegram" ? "active" : ""}`} onClick={() => setTab("telegram")}>
          Telegram
        </span>
        <span className={`tab ${tab === "kv" ? "active" : ""}`} onClick={() => setTab("kv")}>
          KEY=VALUE
        </span>
        <span className={`tab ${tab === "json" ? "active" : ""}`} onClick={() => setTab("json")}>
          JSON
        </span>
      </div>
      <div className="exec-block" style={{ maxHeight: 220, overflow: "auto" }}>
        {body}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn" onClick={approve} disabled={!canApprove || autoPilot}>
          Approve
        </button>
        <button className="btn primary" onClick={send} disabled={!canSend || autoPilot}>
          Send to TradersPost
        </button>
        <span style={{ marginLeft: "auto" }}>
          <small>
            State: <strong>{executionState.replace("_", " ")}</strong>
            {autoPilot && <> · <span style={{ color: "var(--accent)" }}>auto pilot</span></>}
          </small>
        </span>
      </div>
    </section>
  );
}
