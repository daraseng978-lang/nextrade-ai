import { useMemo, useState } from "react";
import { useWorkstation } from "../state/WorkstationContext";
import { formatExecution } from "../engine/executionFormatter";

type Tab = "telegram" | "kv" | "json";

export function ExecutionPanel() {
  const { selected, logExecution } = useWorkstation();
  const [tab, setTab] = useState<Tab>("telegram");
  const [state, setState] = useState<"draft" | "approved" | "sent" | "watch_only">(
    selected.sizing.finalContracts === 0 ? "watch_only" : "draft",
  );
  const outputs = useMemo(() => formatExecution(selected), [selected]);

  const body =
    tab === "telegram" ? outputs.telegram :
    tab === "kv" ? outputs.keyValue :
    outputs.json;

  const canSend = state !== "watch_only" && selected.state !== "hard_blocked";

  const approve = () => setState("approved");
  const send = () => {
    setState("sent");
    logExecution({
      id: selected.id,
      timestamp: new Date().toISOString(),
      symbol: selected.candidate.instrument.symbol,
      strategy: selected.candidate.strategy,
      regime: selected.context.regime,
      side: selected.candidate.side,
      contracts: selected.sizing.finalContracts,
      adjustedScore: selected.adjustedScore,
      state: selected.state,
    });
  };

  return (
    <section className="panel">
      <h2>Execution · TradersPost dispatch</h2>
      <small>
        All formats derived from one normalized signal object.{" "}
        Watch-only signals never flip to live-ready.
      </small>
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
        <button className="btn" onClick={approve} disabled={!canSend || state !== "draft"}>
          Approve
        </button>
        <button
          className="btn primary"
          onClick={send}
          disabled={!canSend || state !== "approved"}
        >
          Send to TradersPost
        </button>
        <span style={{ marginLeft: "auto" }}>
          <small>
            State: <strong>{state.replace("_", " ")}</strong>
          </small>
        </span>
      </div>
    </section>
  );
}
