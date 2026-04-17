import type { PropFirmControl, SelectedSignal } from "./types";
import type { PreMarketBrief } from "./preMarketChecklist";

// One-line human-readable messages for the four Telegram triggers.
// Keep them short — Telegram mobile previews truncate at ~4 lines.

export function formatBriefMessage(brief: PreMarketBrief): string {
  const { mentalReadiness, economicCalendar, overnightSummary, sectorRotation, date } = brief;
  const highImpact = economicCalendar.filter(e => e.impact === "high");
  const bullets: string[] = [];
  bullets.push(`📋 Pre-Market Brief · ${date}`);
  bullets.push("");
  bullets.push(`Readiness: ${mentalReadiness.sessionReadiness.toUpperCase()} · max ${mentalReadiness.suggestedMaxTrades} trade(s)`);
  bullets.push(`Flow: ${sectorRotation.capitalFlow.replace("_", " ")}`);
  if (highImpact.length > 0) {
    bullets.push("");
    bullets.push("High-impact events:");
    for (const e of highImpact) bullets.push(`• ${e.time} ${e.event}`);
  }
  bullets.push("");
  bullets.push("Overnight bias:");
  for (const o of overnightSummary.slice(0, 6)) {
    bullets.push(`• ${o.symbol} ${o.sessionBias}${o.regimeSupport ? " ✓" : " ✗"}`);
  }
  if (mentalReadiness.notes.length > 0) {
    bullets.push("");
    bullets.push(`Note: ${mentalReadiness.notes[0]}`);
  }
  return bullets.join("\n");
}

export function formatSignalMessage(signal: SelectedSignal): string {
  const c = signal.candidate;
  const state = signal.state.replace(/_/g, " ");
  const emoji =
    signal.hardBlock.active ? "🚫" :
    signal.state === "best_available" ? "🟢" :
    signal.state === "reduced_size" ? "🟡" :
    signal.state === "watch_only" ? "👀" :
    "⏸";
  return [
    `${emoji} Signal · ${c.instrument.symbol} ${c.side.toUpperCase()}`,
    `Strategy: ${c.strategy}`,
    `Regime: ${signal.context.regime} (conf ${signal.context.regimeConfidence.toFixed(2)})`,
    `Score: raw ${c.rawScore.toFixed(2)} · adj ${signal.adjustedScore.toFixed(2)}`,
    `Entry ${c.entry.toFixed(2)} · Stop ${c.stop.toFixed(2)} · Target ${c.target.toFixed(2)}`,
    `State: ${state}`,
    c.reasons.length > 0 ? `Why: ${c.reasons.slice(0, 2).join(" · ")}` : "",
  ].filter(Boolean).join("\n");
}

export function formatApprovalMessage(
  signal: SelectedSignal,
  propFirm: PropFirmControl,
  stage: "needed" | "given",
): string {
  const c = signal.candidate;
  const emoji = stage === "needed" ? "⚠" : "✅";
  const head = stage === "needed" ? "Approval Needed" : "Approved";
  return [
    `${emoji} ${head} · ${c.instrument.symbol} ${c.side.toUpperCase()}`,
    `${propFirm.finalContracts}ct · adj ${signal.adjustedScore.toFixed(2)}`,
    `Compliance: ${propFirm.compliance.passing ? "OK" : "FAILING"}`,
    propFirm.compliance.blockers[0] ? `Blocker: ${propFirm.compliance.blockers[0]}` : "",
    stage === "needed" ? "Operator: approve or disarm." : "Awaiting Send.",
  ].filter(Boolean).join("\n");
}

export function formatSentMessage(
  signal: SelectedSignal,
  dispatchStatus: "ok" | "fail" | "mock",
  dispatchDetail?: string,
  auto: boolean = false,
): string {
  const c = signal.candidate;
  const prefix = auto ? "🤖⚡ AUTO PILOT SENT" : "🟢 SENT";
  const statusLine =
    dispatchStatus === "ok"   ? `✓ TradersPost ${dispatchDetail ?? "200"}` :
    dispatchStatus === "fail" ? `✗ TradersPost FAIL · ${dispatchDetail ?? ""}` :
    "(mock — no broker dispatch)";
  return [
    `${prefix} · ${c.instrument.symbol} ${c.side.toUpperCase()}`,
    `${signal.sizing.finalContracts}ct · ${c.strategy}`,
    `Entry ${c.entry.toFixed(2)} · Stop ${c.stop.toFixed(2)} · TP ${c.target.toFixed(2)}`,
    `adj ${signal.adjustedScore.toFixed(2)} · R ${c.rMultiple.toFixed(2)}`,
    statusLine,
  ].join("\n");
}
