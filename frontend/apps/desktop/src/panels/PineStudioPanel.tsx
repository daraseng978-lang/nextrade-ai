import { useMemo, useState } from "react";
import { useWorkstation } from "../state/WorkstationContext";
import { generatePineScript, buildAlertPayload } from "../engine/pineGenerator";

export function PineStudioPanel() {
  const { selected, preMarketBrief } = useWorkstation();
  const [tab, setTab] = useState<"script" | "alert">("script");
  const script = useMemo(() => generatePineScript(selected, preMarketBrief), [selected, preMarketBrief]);
  const alertPayload = useMemo(() => buildAlertPayload(selected), [selected]);
  return (
    <div className="panel">
      <h2>Pine Studio</h2>
      <small>
        Day-specific implementation of selected playbook ·{" "}
        <strong>{selected.candidate.strategy}</strong>
      </small>
      <div className="tabs" style={{ marginTop: 8 }}>
        <span className={`tab ${tab === "script" ? "active" : ""}`} onClick={() => setTab("script")}>
          Pine Script
        </span>
        <span className={`tab ${tab === "alert" ? "active" : ""}`} onClick={() => setTab("alert")}>
          Alert Payload
        </span>
      </div>
      <div className="exec-block" style={{ maxHeight: 260, overflow: "auto" }}>
        {tab === "script" ? script : alertPayload}
      </div>
    </div>
  );
}
