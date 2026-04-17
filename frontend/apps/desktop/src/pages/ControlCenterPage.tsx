import { useMemo } from "react";
import { useWorkstation } from "../state/WorkstationContext";
import { entryStateLabel } from "../engine/propFirm";
import { STRATEGIES } from "../engine/strategies";
import { buildAgentStatuses, groupAgents } from "../engine/agents";
import type {
  AgentSpecialty,
  AgentState,
  AgentStatus,
  EventEntry,
  EventKind,
  InstrumentContext,
  PropFirmControl,
  RouteStatus,
} from "../engine/types";
import type { PreMarketBrief } from "../engine/preMarketChecklist";

// Control Center = supervision. Layout mirrors the NEXTRADE AI
// Control Center mockup: 6-cell status rail + 3-column body.
export function ControlCenterPage() {
  const {
    selected,
    propFirm,
    executionState,
    approve,
    send,
    killSwitch,
    setKillSwitch,
    quorumEnabled,
    journal,
    events,
    routeHealth,
    contexts,
    account,
    preMarketBrief,
    autoPilot,
    setAutoPilot,
    autoTradeCount,
    autoPilotMinScore,
    lastAutoPilotDecision,
    providerConfig,
    feedStatus,
    feedLastUpdate,
    feedLatencyMs,
    feedError,
  } = useWorkstation();

  const sym = selected.candidate.instrument.symbol;
  const strategy = STRATEGIES[selected.candidate.strategy];
  const side = selected.candidate.side;
  const canApprove =
    executionState === "draft" &&
    propFirm.finalContracts > 0 &&
    !selected.hardBlock.active;
  const canSend =
    executionState === "approved" || executionState === "reduced_approved";

  const agents = useMemo(
    () =>
      buildAgentStatuses({
        signal: selected,
        propFirm,
        executionState,
        killSwitch,
        quorumEnabled,
        journalCount: journal.length,
        preMarketBrief,
      }),
    [selected, propFirm, executionState, killSwitch, quorumEnabled, journal.length, preMarketBrief],
  );
  const agentGroups = useMemo(() => groupAgents(agents), [agents]);

  const banner = bannerCopy(executionState, propFirm, canApprove);
  const scoreBoost = (propFirm.adjustedScore - propFirm.rawScore) * 100;

  return (
    <div className="cc-v2">
      {/* Status rail */}
      <div className="cc-v2-rail">
        <RailCell label="System Mode" tone={killSwitch ? "warn" : "on"}>
          {killSwitch ? "RESTRICTED" : "OPERATIONAL"}
        </RailCell>
        <RailCell label="Kill Switch" tone={killSwitch ? "warn" : "off"}>
          {killSwitch ? "ENGAGED" : "OFF"}
        </RailCell>
        <RailCell label="Quorum" tone={quorumEnabled ? "on" : "off"}>
          {quorumEnabled ? "ON" : "OFF"}
        </RailCell>
        <RailCell label="Auto Pilot" tone={autoPilot ? "on" : "off"}>
          {autoPilot
            ? `ARMED · ${autoTradeCount}/${preMarketBrief.mentalReadiness.suggestedMaxTrades}`
            : "OFF"}
        </RailCell>
        <RailCell label="Prop-Firm State" tone={propFirmTone(propFirm)}>
          {entryStateLabel(propFirm.entryState).toUpperCase()}
        </RailCell>
        <RailCell label="Selected">
          <span>
            {sym}{" "}
            <span className="cc-v2-rail-muted">· {strategy.label}</span>
          </span>
        </RailCell>
        <RailCell label="Journal">
          <span>
            {journal.length}{" "}
            <span className="cc-v2-rail-muted">sent today</span>
          </span>
        </RailCell>
      </div>

      {/* Body */}
      <div className="cc-v2-body">
        {/* ============ LEFT ============ */}
        <aside className="cc-v2-left">
          <section className="cc-v2-section">
            <div className="cc-v2-section-head">Approval Queue</div>
            <div className="cc-v2-section-sub">
              Operator gate · approve before routing
            </div>
            <div
              className={`cc-queue-item ${canApprove ? "pending" : ""}`}
            >
              <div className="cc-queue-head">
                <div className="cc-queue-sym">
                  {sym}{" "}
                  <span className={`cc-queue-side ${side === "long" ? "long" : side === "short" ? "short" : "flat"}`}>
                    {side.toUpperCase()}
                  </span>
                </div>
                <span className={`cc-chip ${propFirmToneChip(propFirm)}`}>
                  {entryStateLabel(propFirm.entryState).toUpperCase()}
                </span>
              </div>
              <div className="cc-queue-meta">
                <span>{selected.candidate.strategy}</span>
                <span className="dot">·</span>
                <span>{propFirm.finalContracts} ct</span>
              </div>
              <div className="cc-queue-actions">
                <button
                  className="cc-btn approve"
                  onClick={approve}
                  disabled={!canApprove}
                >
                  Approve
                </button>
                <button
                  className="cc-btn primary"
                  onClick={send}
                  disabled={!canSend}
                >
                  Send →
                </button>
              </div>
            </div>
          </section>

          <section className="cc-v2-section">
            <div className="cc-v2-section-head">Recent Sends</div>
            <div className="cc-v2-section-sub">
              Last 5 routed to TradersPost
            </div>
            {journal.length === 0 ? (
              <div className="cc-empty">No sends yet this session.</div>
            ) : (
              <ul className="cc-sends">
                {journal.slice(0, 5).map((j) => (
                  <li key={j.id + j.timestamp}>
                    <span className="cc-sends-time">
                      {new Date(j.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="cc-sends-body">
                      <strong>{j.symbol}</strong> · {j.side} · {j.contracts}ct
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cc-v2-section cc-v2-section-last">
            <div className="cc-v2-section-head">AI Agent Status</div>
            <div className="cc-v2-section-sub">
              Operational summary of each agent · never surfaces hidden
              reasoning verbatim.
            </div>
            {agentGroups.map((group) =>
              group.agents.length === 0 ? null : (
                <div key={group.title}>
                  <div className="cc-agent-group">{group.title}</div>
                  {group.agents.map((a) => (
                    <AgentRow key={a.name} agent={a} />
                  ))}
                </div>
              ),
            )}
          </section>
        </aside>

        {/* ============ CENTER ============ */}
        <main className="cc-v2-center">
          <div className="cc-v2-pagehead">
            <div>
              <h1>Prop-Firm Entry Control</h1>
              <div className="cc-v2-pagehead-sub">
                Gating layer — every entry is explainable. Integer contracts
                only. Selected playbook:{" "}
                <b>
                  {sym} · {strategy.label} · {selected.context.regime}
                </b>
              </div>
            </div>
            <div className="cc-v2-pagehead-actions">
              <button
                className={`cc-ghost-btn autopilot ${autoPilot ? "armed" : ""}`}
                onClick={() => {
                  if (!autoPilot) {
                    const ok = confirm(
                      `Arm Auto Pilot?\n\n` +
                      `The system will approve + send trades automatically when:\n` +
                      `  · adjusted score ≥ ${autoPilotMinScore.toFixed(2)}\n` +
                      `  · kill switch is off\n` +
                      `  · no hard block\n` +
                      `  · prop-firm compliance is passing\n` +
                      `  · Reggie readiness ≠ stand aside\n` +
                      `  · daily auto-trade count < ${preMarketBrief.mentalReadiness.suggestedMaxTrades}\n\n` +
                      `You can disarm at any time.`,
                    );
                    if (!ok) return;
                  }
                  setAutoPilot(!autoPilot);
                }}
                title={autoPilot ? "Disarm Auto Pilot" : "Arm Auto Pilot"}
              >
                {autoPilot ? "🤖 AUTO PILOT ARMED" : "🤖 ARM AUTO PILOT"}
              </button>
              <button
                className={`cc-ghost-btn ${killSwitch ? "armed" : "danger"}`}
                onClick={() => setKillSwitch(!killSwitch)}
              >
                {killSwitch ? "DISARM KILL SWITCH" : "ARM KILL SWITCH"}
              </button>
            </div>
          </div>

          {autoPilot && (
            <div className="cc-autopilot-strip">
              <span className="cc-autopilot-dot" />
              <span className="cc-autopilot-label">AUTO PILOT ARMED</span>
              <span className="cc-autopilot-meta">
                Score floor {autoPilotMinScore.toFixed(2)} · {autoTradeCount}/{preMarketBrief.mentalReadiness.suggestedMaxTrades} sent today
              </span>
              {lastAutoPilotDecision?.action === "skip" &&
                !["autopilot_off", "already_processed", "not_draft"].includes(lastAutoPilotDecision.reasonCode) && (
                  <span className="cc-autopilot-reason">
                    Holding · {lastAutoPilotDecision.reason}
                  </span>
                )}
              <button
                className="cc-autopilot-disarm"
                onClick={() => setAutoPilot(false)}
              >
                Disarm
              </button>
            </div>
          )}

          <div className={`cc-state-banner ${banner.tone}`}>
            <div className={`cc-state-badge ${banner.tone}`}>
              {banner.badge}
            </div>
            <div className="cc-state-content">
              <h2>{banner.title}</h2>
              <p>
                {banner.lede} · adj score{" "}
                <b>{propFirm.adjustedScore.toFixed(3)}</b> · final size{" "}
                <b>{propFirm.finalContracts} ct</b> · compliance{" "}
                <b>{propFirm.compliance.passing ? "OK" : "FAILING"}</b>
              </p>
            </div>
            <div className="cc-state-actions">
              <button
                className="cc-btn approve"
                onClick={approve}
                disabled={!canApprove}
              >
                Approve
              </button>
              <button
                className="cc-btn primary"
                onClick={send}
                disabled={!canSend}
              >
                Send to TradersPost →
              </button>
            </div>
          </div>

          <div className="cc-score-grid">
            <ScoreCard
              label="Raw Score"
              value={propFirm.rawScore}
              pct={propFirm.rawScore * 100}
              sub="Dex · decision engine"
            />
            <ScoreCard
              label="Adjusted Score"
              value={propFirm.adjustedScore}
              pct={propFirm.adjustedScore * 100}
              highlight
              sub={`${scoreBoost >= 0 ? "+" : ""}${scoreBoost.toFixed(1)}% after Val adjustment`}
            />
            <ScoreCard
              label="Risk-Calc Contracts"
              value={propFirm.calculatedContracts}
              integer
              pct={Math.min(
                100,
                propFirm.calculatedContracts
                  ? (propFirm.calculatedContracts /
                      Math.max(propFirm.calculatedContracts, propFirm.qualityCap)) *
                      100
                  : 0,
              )}
              partial
              sub={`${(account.riskPerTradePct * 100).toFixed(2)}% risk · $${selected.sizing.perContractRisk.toFixed(0)} per contract`}
            />
            <ScoreCard
              label="Quality Cap"
              value={propFirm.qualityCap}
              integer
              pct={Math.min(100, (propFirm.qualityCap / 4) * 100)}
              sub={`Rhea · ladder rung ${Math.min(5, Math.max(1, propFirm.qualityCap + 1))}/5`}
            />
          </div>

          <div className="cc-gating-card">
            <div className="cc-gating-head">
              <h3>
                Gating Decision{" "}
                <span className="tag">INTEGER SIZING · EXPLAINABLE</span>
              </h3>
              <span
                className={`cc-state-pill ${propFirm.routeReady ? "ready" : ""}`}
              >
                {propFirm.routeReady
                  ? "ROUTE READY"
                  : propFirm.entryState === "blocked"
                    ? "BLOCKED"
                    : "ROUTE PENDING APPROVAL"}
              </span>
            </div>
            <table className="cc-gating-table">
              <tbody>
                <tr>
                  <td>Raw score</td>
                  <td className="v right">{propFirm.rawScore.toFixed(3)}</td>
                </tr>
                <tr>
                  <td>Adjusted score</td>
                  <td className="v-hi right">{propFirm.adjustedScore.toFixed(3)}</td>
                </tr>
                <tr>
                  <td>Risk-calc contracts</td>
                  <td className="v right">{propFirm.calculatedContracts}</td>
                </tr>
                <tr>
                  <td>Quality cap</td>
                  <td className="v right">{propFirm.qualityCap}</td>
                </tr>
                <tr>
                  <td>Final contracts</td>
                  <td className="v-hi right">{propFirm.finalContracts}</td>
                </tr>
                <tr>
                  <td>Route ready</td>
                  <td
                    className="v right"
                    style={{
                      color: propFirm.routeReady ? "var(--accent)" : "var(--warn)",
                    }}
                  >
                    {propFirm.routeReady
                      ? "YES"
                      : propFirm.blockReason ?? "no · awaiting approval"}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="cc-gating-head cc-gating-head-split">
              <h3>
                Compliance <span className="tag">PROP-FIRM CONSTRAINTS</span>
              </h3>
              <span
                className={`cc-gating-mini ${propFirm.compliance.passing ? "ok" : "bad"}`}
              >
                ▸{" "}
                {propFirm.compliance.passing
                  ? "ALL WITHIN BOUNDS"
                  : "BLOCKERS PRESENT"}
              </span>
            </div>

            <CompRow
              label="Daily loss pressure"
              detail="Today's drawdown / max daily loss"
              value={propFirm.compliance.dailyLossPressure}
              threshold={0.6}
            />
            <CompRow
              label="Drawdown pressure"
              detail="Running DD / allowed max DD"
              value={propFirm.compliance.drawdownPressure}
              threshold={0.6}
            />
            <CompRow
              label="Consistency pressure"
              detail="Single-day P&L / consistency target"
              value={propFirm.compliance.consistencyPressure}
              threshold={0.6}
            />
            <CompRow
              label="Evaluation caution"
              detail="Behavioral guardrails · impulsivity score"
              value={propFirm.compliance.evaluationCaution}
              threshold={0.7}
            />
            <CompRow
              label="Payout stability"
              detail="Rolling PF × win consistency"
              value={propFirm.compliance.payoutStability}
              invert
            />

            {(propFirm.compliance.blockers.length > 0 ||
              propFirm.compliance.cautions.length > 0) && (
              <div className="cc-compliance-notes">
                {propFirm.compliance.blockers.map((b, i) => (
                  <div key={`b-${i}`} className="cc-note cc-note-bad">
                    🚫 {b}
                  </div>
                ))}
                {propFirm.compliance.cautions.map((c, i) => (
                  <div key={`c-${i}`} className="cc-note cc-note-warn">
                    ⚠ {c}
                  </div>
                ))}
              </div>
            )}

            <div className="cc-gating-foot">
              <div className="cc-gating-foot-left">
                <button
                  className="cc-btn approve"
                  onClick={approve}
                  disabled={!canApprove}
                >
                  Approve
                </button>
                <button
                  className="cc-btn primary"
                  onClick={send}
                  disabled={!canSend}
                >
                  Send to TradersPost
                </button>
              </div>
              <div className="cc-exec-status">
                Execution: <b>{executionState.replace("_", " ").toUpperCase()}</b>
              </div>
            </div>
          </div>

          <div className="cc-audit-card">
            <div className="cc-audit-head">
              <h3>
                Audit Trail{" "}
                <span className="tag">OPERATOR + SYSTEM EVENTS</span>
              </h3>
              <span className="cc-audit-count">
                LAST {Math.min(events.length, 10)} · SESSION
              </span>
            </div>
            {events.length === 0 ? (
              <div className="cc-empty cc-empty-padded">No events yet.</div>
            ) : (
              events.slice(0, 10).map((e) => <AuditRow key={e.id} entry={e} />)
            )}
          </div>
        </main>

        {/* ============ RIGHT ============ */}
        <aside className="cc-v2-right">
          <PreMarketBriefSection brief={preMarketBrief} />

          <section className="cc-v2-section">
            <div className="cc-v2-section-head">Route Health</div>
            <div className="cc-v2-section-sub">
              Execution route to Tradovate via TradersPost
            </div>
            <RouteItem
              code="TP"
              tone="tp"
              name="TradersPost"
              note={routeHealth.tradersPost.note}
              status={routeHealth.tradersPost.status}
              lastCheck={routeHealth.tradersPost.lastCheck}
              metrics={[
                { k: "LATENCY", v: mockLatency("TP", killSwitch) },
                { k: "ERRORS 1H", v: killSwitch ? "paused" : "0" },
              ]}
            />
            <RouteItem
              code="TV"
              tone="tv"
              name="Tradovate"
              note={routeHealth.tradovate.note}
              status={routeHealth.tradovate.status}
              lastCheck={routeHealth.tradovate.lastCheck}
              metrics={[
                { k: "LATENCY", v: mockLatency("TV", killSwitch) },
                { k: "FILL RATE", v: killSwitch ? "—" : "98.2%" },
              ]}
            />
          </section>

          <section className="cc-v2-section">
            <div className="cc-v2-section-head">
              Market Data Feed
              <span className={`cc-feed-status ${feedStatus}`}>
                {feedStatus === "live" ? "LIVE" :
                 feedStatus === "loading" ? "FETCHING" :
                 feedStatus === "error" ? "ERROR" :
                 "IDLE"}
              </span>
            </div>
            <div className="cc-v2-section-sub">
              {providerConfig.kind === "mock"      ? "Static mock · engine/mockData.ts" :
               providerConfig.kind === "live_mock" ? `Live mock · ${providerConfig.pollIntervalMs ?? 5000}ms poll · ±${((providerConfig.driftFactor ?? 0.0008) * 100).toFixed(2)}% drift` :
               `REST · ${providerConfig.restUrl || "(not configured)"}`}
              {feedLastUpdate && (
                <>
                  {" · "}
                  last update {new Date(feedLastUpdate).toLocaleTimeString()}
                  {feedLatencyMs !== null && <> ({feedLatencyMs}ms)</>}
                </>
              )}
            </div>
            {feedError && (
              <div className="cc-feed-error">⚠ {feedError}</div>
            )}
            {contexts.map((ctx) => (
              <FeedRow key={ctx.instrument.symbol} ctx={ctx} />
            ))}
          </section>

          <section className="cc-v2-section cc-v2-section-last">
            <div className="cc-v2-section-head">Live Event Stream</div>
            <div className="cc-v2-section-sub">System + agent activity</div>
            {events.length === 0 ? (
              <div className="cc-empty">No events yet.</div>
            ) : (
              <div className="cc-event-stream">
                {events.slice(0, 12).map((e) => (
                  <StreamRow key={e.id} entry={e} />
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

// ====================== subcomponents ======================

function RailCell({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "on" | "off" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div className="cc-v2-rail-cell">
      <div className="cc-v2-rail-lbl">{label}</div>
      <div className={`cc-v2-rail-val ${tone ?? ""}`}>
        {tone && <span className={`cc-v2-rail-dot ${tone}`} />}
        <span>{children}</span>
      </div>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  pct,
  sub,
  highlight,
  partial,
  integer,
}: {
  label: string;
  value: number;
  pct: number;
  sub: string;
  highlight?: boolean;
  partial?: boolean;
  integer?: boolean;
}) {
  const rendered = integer ? `${Math.round(value)}` : value.toFixed(3);
  return (
    <div className="cc-score-card">
      <div className="cc-score-k">{label}</div>
      <div className={`cc-score-v ${highlight ? "accent" : ""}`}>{rendered}</div>
      <div className="cc-score-track">
        <span
          className={partial ? "partial" : ""}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <div className="cc-score-sub">{sub}</div>
    </div>
  );
}

function CompRow({
  label,
  detail,
  value,
  threshold,
  invert,
}: {
  label: string;
  detail: string;
  value: number;
  threshold?: number;
  invert?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  let tone: "good" | "warn" | "bad" = "good";
  if (invert) {
    // high is good; low is bad
    if (value < 0.3) tone = "bad";
    else if (value < 0.6) tone = "warn";
    else tone = "good";
  } else {
    const t = threshold ?? 0.6;
    if (value >= 1) tone = "bad";
    else if (value >= t) tone = "warn";
  }
  return (
    <div className="cc-comp-row">
      <div className="cc-comp-k">
        {label}
        <div className="cc-comp-d">{detail}</div>
      </div>
      <div className="cc-comp-track">
        <span className={tone} style={{ width: `${pct}%` }} />
      </div>
      <div className="cc-comp-v">{value.toFixed(2)}</div>
    </div>
  );
}

function AgentRow({ agent }: { agent: AgentStatus }) {
  const initials = agent.name.slice(0, agent.name.length > 3 ? 2 : 1);
  return (
    <div className="cc-agent">
      <div className={`cc-agent-av ${specialtyAvatar(agent.specialty)}`}>
        {initials}
      </div>
      <div className="cc-agent-body">
        <div className="cc-agent-name">
          {agent.name}{" "}
          <span className="cc-agent-role">· {agent.title}</span>
        </div>
        <div className="cc-agent-task">task · {agent.currentTask}</div>
        <div className="cc-agent-out">{agent.summary}</div>
        <div className="cc-agent-meta">
          {agent.confidence !== undefined && (
            <>
              conf <b>{agent.confidence.toFixed(2)}</b> ·{" "}
            </>
          )}
          {new Date(agent.lastUpdate).toLocaleTimeString()}
        </div>
      </div>
      <span className={`cc-chip ${stateChipClass(agent.state)}`}>
        {agent.state.toUpperCase()}
      </span>
    </div>
  );
}

function RouteItem({
  code,
  tone,
  name,
  note,
  status,
  lastCheck,
  metrics,
}: {
  code: string;
  tone: "tp" | "tv";
  name: string;
  note: string;
  status: RouteStatus;
  lastCheck: string;
  metrics: Array<{ k: string; v: string }>;
}) {
  const statusClass =
    status === "ok" ? "completed" : status === "degraded" ? "running" : "bad";
  const statusWord =
    status === "ok" ? "HEALTHY" : status === "degraded" ? "DEGRADED" : "DOWN";
  return (
    <div className="cc-route-item">
      <div className="cc-route-head">
        <div className="cc-route-name">
          <span className={`cc-route-icon ${tone}`}>{code}</span> {name}
        </div>
        <span className={`cc-chip ${statusClass}`}>{status.toUpperCase()}</span>
      </div>
      <div className="cc-route-desc">{note}</div>
      <div className="cc-route-status">
        <span
          className={`cc-route-word ${status === "ok" ? "ok" : status === "degraded" ? "warn" : "bad"}`}
        >
          ▸ {statusWord}
        </span>
        <span className="cc-route-time">
          {new Date(lastCheck).toLocaleTimeString()}
        </span>
      </div>
      <div className="cc-route-metrics">
        {metrics.map((m) => (
          <div key={m.k} className="cc-route-metric">
            <div className="cc-route-metric-k">{m.k}</div>
            <div className="cc-route-metric-v">{m.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedRow({ ctx }: { ctx: InstrumentContext }) {
  const latency = mockFeedLatency(ctx.instrument.symbol);
  const ticksPerMin = mockTickRate(ctx.instrument.symbol);
  return (
    <div className="cc-feed-sym">
      <div className="cc-feed-s">
        {ctx.instrument.symbol}
        <span className="cc-feed-sub">{ctx.instrument.name}</span>
      </div>
      <span className={`cc-feed-lat ${latency > 15 ? "warn" : ""}`}>
        {latency}ms
      </span>
      <span className="cc-feed-ticks">· {ticksPerMin}</span>
    </div>
  );
}

function AuditRow({ entry }: { entry: EventEntry }) {
  const cat = eventCategory(entry.kind);
  return (
    <div className="cc-audit-row">
      <div className="cc-audit-t">
        {new Date(entry.timestamp).toLocaleTimeString()}
      </div>
      <div className="cc-audit-actor">
        <span className={`cc-audit-dot ${cat.actor}`} />
        {cat.actorLabel}
      </div>
      <div className={`cc-audit-evt ${cat.evt}`}>{cat.label}</div>
      <div className="cc-audit-desc">{entry.detail}</div>
    </div>
  );
}

function StreamRow({ entry }: { entry: EventEntry }) {
  const cat = eventCategory(entry.kind);
  const t = new Date(entry.timestamp);
  const time = `${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}`;
  return (
    <div className="cc-event">
      <div className="cc-event-t">{time}</div>
      <div className="cc-event-c">
        <span className={`cc-event-tag ${cat.stream}`}>{cat.tag}</span>
        {entry.detail}
      </div>
    </div>
  );
}

// ====================== helpers ======================

function propFirmTone(pf: PropFirmControl): "on" | "off" | "warn" {
  if (pf.entryState === "blocked") return "warn";
  if (pf.entryState === "sent" || pf.entryState === "approved") return "on";
  return "off";
}

function propFirmToneChip(pf: PropFirmControl): string {
  if (pf.entryState === "blocked") return "bad";
  if (pf.entryState === "sent") return "completed";
  if (pf.entryState === "approved" || pf.entryState === "reduced_approved")
    return "completed";
  if (pf.entryState === "watch_only") return "idle";
  return "running";
}

function stateChipClass(state: AgentState): string {
  switch (state) {
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "waiting":
      return "running";
    case "blocked":
    case "escalated":
      return "bad";
    default:
      return "idle";
  }
}

function specialtyAvatar(s: AgentSpecialty): string {
  switch (s) {
    case "decision_engine":
      return "dex";
    case "strategy_taxonomy":
      return "strat";
    case "research":
      return "reggie";
    case "architecture":
      return "archie";
    case "risk_sizing":
      return "rhea";
    case "validation":
      return "val";
    case "pine_generation":
      return "pine";
    case "execution_routing":
      return "exa";
    case "prop_firm_gating":
      return "prospr";
    case "chart_display":
      return "chartie";
    case "control_center":
      return "ctrl";
    case "agent_supervisor":
      return "sup";
    case "journal":
      return "jour";
    case "qa":
      return "qa";
    default:
      return "idle";
  }
}

function bannerCopy(
  executionState: string,
  pf: PropFirmControl,
  canApprove: boolean,
): { tone: "ok" | "warn" | "bad"; badge: string; title: string; lede: string } {
  if (pf.entryState === "blocked")
    return {
      tone: "bad",
      badge: "BLOCKED",
      title: pf.blockReason ?? "Entry blocked",
      lede: "Compliance failure prevents routing",
    };
  if (executionState === "sent")
    return {
      tone: "ok",
      badge: "SENT",
      title: "Order routed to TradersPost",
      lede: "All agents completed",
    };
  if (
    executionState === "approved" ||
    executionState === "reduced_approved"
  )
    return {
      tone: "ok",
      badge: executionState === "reduced_approved" ? "REDUCED" : "APPROVED",
      title: "Approved — ready to send",
      lede: "Awaiting operator send",
    };
  if (pf.entryState === "watch_only")
    return {
      tone: "warn",
      badge: "WATCH ONLY",
      title: "Watch only — no size at current quality",
      lede: "Below quality floor",
    };
  return {
    tone: canApprove ? "ok" : "warn",
    badge: "DRAFT",
    title: canApprove
      ? "Candidate ready for operator review"
      : "Candidate not approvable",
    lede: "All agents completed",
  };
}

function eventCategory(kind: EventKind): {
  actor: "sys" | "op" | "agent";
  actorLabel: string;
  evt: "created" | "score" | "size" | "gate" | "warn";
  stream: "sys" | "agent" | "ok" | "gate";
  label: string;
  tag: string;
} {
  switch (kind) {
    case "instrument_selected":
      return {
        actor: "op",
        actorLabel: "Operator",
        evt: "created",
        stream: "sys",
        label: "INSTRUMENT_SELECT",
        tag: "SEL",
      };
    case "approved":
      return {
        actor: "op",
        actorLabel: "Operator",
        evt: "gate",
        stream: "gate",
        label: "APPROVED",
        tag: "APR",
      };
    case "sent":
      return {
        actor: "op",
        actorLabel: "Operator",
        evt: "gate",
        stream: "ok",
        label: "ROUTE_SENT",
        tag: "OK",
      };
    case "kill_switch_armed":
      return {
        actor: "op",
        actorLabel: "Operator",
        evt: "warn",
        stream: "gate",
        label: "KILL_ARMED",
        tag: "KS",
      };
    case "kill_switch_disarmed":
      return {
        actor: "op",
        actorLabel: "Operator",
        evt: "gate",
        stream: "gate",
        label: "KILL_DISARM",
        tag: "KS",
      };
    case "quorum_toggled":
      return {
        actor: "op",
        actorLabel: "Operator",
        evt: "gate",
        stream: "gate",
        label: "QUORUM_TOGGLE",
        tag: "GATE",
      };
    case "hard_block_triggered":
      return {
        actor: "sys",
        actorLabel: "System",
        evt: "warn",
        stream: "gate",
        label: "HARD_BLOCK",
        tag: "BLK",
      };
    case "chart_unavailable":
      return {
        actor: "sys",
        actorLabel: "System",
        evt: "warn",
        stream: "sys",
        label: "CHART_DOWN",
        tag: "SYS",
      };
    case "chart_retried":
      return {
        actor: "sys",
        actorLabel: "System",
        evt: "created",
        stream: "sys",
        label: "CHART_RETRY",
        tag: "SYS",
      };
    case "auto_pilot_armed":
      return {
        actor: "op",
        actorLabel: "Operator",
        evt: "gate",
        stream: "gate",
        label: "AUTOPILOT_ARM",
        tag: "AP",
      };
    case "auto_pilot_disarmed":
      return {
        actor: "op",
        actorLabel: "Operator",
        evt: "gate",
        stream: "gate",
        label: "AUTOPILOT_DISARM",
        tag: "AP",
      };
    case "auto_pilot_skipped":
      return {
        actor: "sys",
        actorLabel: "System",
        evt: "warn",
        stream: "sys",
        label: "AUTOPILOT_SKIP",
        tag: "AP",
      };
    case "auto_pilot_executed":
      return {
        actor: "sys",
        actorLabel: "System",
        evt: "gate",
        stream: "ok",
        label: "AUTOPILOT_EXEC",
        tag: "AP",
      };
    case "manual_trade_sent":
      return {
        actor: "op",
        actorLabel: "Operator",
        evt: "created",
        stream: "ok",
        label: "MANUAL_SENT",
        tag: "MT",
      };
    case "manual_trade_failed":
      return {
        actor: "op",
        actorLabel: "Operator",
        evt: "created",
        stream: "gate",
        label: "MANUAL_FAIL",
        tag: "MT",
      };
  }
}

function mockLatency(code: string, killSwitch: boolean): string {
  if (killSwitch) return "—";
  const base = code === "TP" ? 42 : 118;
  return `${base}ms`;
}

function mockFeedLatency(symbol: string): number {
  const hash = [...symbol].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return 6 + (hash % 18);
}

function mockTickRate(symbol: string): string {
  const hash = [...symbol].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const n = 150 + (hash * 17) % 2300;
  return n >= 1000 ? `${(n / 1000).toFixed(2)}K t/m` : `${n} t/m`;
}

// ---------------------------------------------------------------------------
// Pre-Market Brief section — Reggie's morning research handoff to Strat
// ---------------------------------------------------------------------------

function PreMarketBriefSection({ brief }: { brief: PreMarketBrief }) {
  const { mentalReadiness, economicCalendar, overnightSummary, sectorRotation, date } = brief;
  const readinessColor =
    mentalReadiness.sessionReadiness === "ready"      ? "var(--accent)" :
    mentalReadiness.sessionReadiness === "caution"    ? "var(--warn)" :
    "var(--danger)";

  return (
    <section className="cc-v2-section cc-brief">
      <div className="cc-v2-section-head">
        Pre-Market Brief
        <span className="cc-brief-tag">REGGIE → STRAT</span>
      </div>
      <div className="cc-v2-section-sub">{date} · enriched before decision engine</div>

      {/* Mental readiness */}
      <div className="cc-brief-block">
        <div className="cc-brief-blk-head">
          Mental Readiness
          <span className="cc-brief-readiness" style={{ color: readinessColor }}>
            {mentalReadiness.sessionReadiness.replace("_", " ").toUpperCase()}
          </span>
        </div>
        <div className="cc-brief-notes">
          {mentalReadiness.notes.map((n, i) => (
            <div key={i} className="cc-brief-note">· {n}</div>
          ))}
          <div className="cc-brief-note muted">
            Suggested max trades: {mentalReadiness.suggestedMaxTrades}
          </div>
        </div>
      </div>

      {/* Economic calendar */}
      <div className="cc-brief-block">
        <div className="cc-brief-blk-head">Economic Calendar</div>
        <table className="cc-brief-table">
          <tbody>
            {economicCalendar.map((ev, i) => (
              <tr key={i}>
                <td className="cc-brief-time">{ev.time}</td>
                <td className="cc-brief-event">{ev.event}</td>
                <td>
                  <span className={`cc-brief-impact ${ev.impact}`}>{ev.impact.toUpperCase()}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Overnight session */}
      <div className="cc-brief-block">
        <div className="cc-brief-blk-head">Overnight Session</div>
        <div className="cc-brief-overnight">
          {overnightSummary.map((o) => (
            <div key={o.symbol} className="cc-brief-overnight-row">
              <span className="cc-brief-sym">{o.symbol}</span>
              <span className={`cc-brief-bias ${o.sessionBias}`}>{o.sessionBias}</span>
              <span className="cc-brief-gap muted">{o.gapType.replace("_", " ")} {o.gapSize.toFixed(1)}pt</span>
              <span className={`cc-brief-support ${o.regimeSupport ? "ok" : "warn"}`}>
                {o.regimeSupport ? "regime ✓" : "regime ✗"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Sector rotation */}
      <div className="cc-brief-block">
        <div className="cc-brief-blk-head">
          Sector Rotation
          <span className={`cc-brief-flow ${sectorRotation.capitalFlow}`}>
            {sectorRotation.capitalFlow.replace("_", " ").toUpperCase()}
          </span>
        </div>
        <div className="cc-brief-sectors">
          {sectorRotation.leadingSectors.length > 0 && (
            <div className="cc-brief-note">
              Leading: {sectorRotation.leadingSectors.join(", ")}
            </div>
          )}
          {sectorRotation.laggingSectors.length > 0 && (
            <div className="cc-brief-note warn">
              Lagging: {sectorRotation.laggingSectors.join(", ")}
            </div>
          )}
          <div className="cc-brief-rel-strength">
            {sectorRotation.relativeStrength.slice(0, 4).map((r) => (
              <div key={r.symbol} className="cc-brief-rs-row">
                <span className="cc-brief-sym">{r.symbol}</span>
                <div className="cc-brief-rs-bar">
                  <div
                    className="cc-brief-rs-fill"
                    style={{ width: `${r.relScore * 100}%` }}
                  />
                </div>
                <span className="cc-brief-rs-val">{r.relScore.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
