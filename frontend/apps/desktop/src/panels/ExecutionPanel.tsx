import { useMemo, useState } from "react";
import { useWorkstation } from "../state/WorkstationContext";
import { formatExecution } from "../engine/executionFormatter";

type Tab = "telegram" | "kv" | "json";

export function ExecutionPanel() {
  const { selected, executionState, approve, send } = useWorkstation();
  const [tab, setTab] = useState<Tab>("telegram");
  const outputs = useMemo(() => formatExecution(selected), [selected]);

  const body =
    tab === "telegram" ? outputs.telegram :
    tab === "kv" ? outputs.keyValue :
    outputs.json;

  const canApprove = executionState === "draft";
  const canSend = executionState === "approved" || executionState === "reduced_approved";

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
        <button className="btn" onClick={approve} disabled={!canApprove}>
          Approve
        </button>
        <button className="btn primary" onClick={send} disabled={!canSend}>
          Send to TradersPost
        </button>
        <span style={{ marginLeft: "auto" }}>
          <small>
            State: <strong>{executionState.replace("_", " ")}</strong>
          </small>
        </span>
      </div>
    </section>
  );
}
