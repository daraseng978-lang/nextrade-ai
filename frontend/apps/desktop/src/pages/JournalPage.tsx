import { useMemo, useState } from "react";
import { useWorkstation } from "../state/WorkstationContext";
import { PerformancePanel } from "../panels/PerformancePanel";
import {
  EMOTION_TAGS,
  computeOutcome,
  type EmotionTag,
  type JournalEntry,
  type TradeStatus,
} from "../engine/journal";
import { INSTRUMENTS } from "../engine/instruments";
import { aiJournalAnalysis } from "../engine/ai";
import { summarizeSignalLog } from "../engine/signalLog";

function pointValueFor(symbol: string): number {
  return INSTRUMENTS.find((i) => i.symbol === symbol)?.pointValue ?? 1;
}

const STATUS_FILTERS: { key: "all" | TradeStatus; label: string }[] = [
  { key: "all",       label: "All"        },
  { key: "open",      label: "Open"       },
  { key: "win",       label: "Wins"       },
  { key: "loss",      label: "Losses"     },
  { key: "breakeven", label: "Breakeven"  },
];

export function JournalPage() {
  const { journal } = useWorkstation();
  const [filter, setFilter] = useState<"all" | TradeStatus>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filter === "all" ? journal : journal.filter((j) => j.status === filter)),
    [journal, filter],
  );

  return (
    <div className="page-grid journal-grid">
      <main className="column wide">
        <PerformancePanel />

        <SignalLogPanel />

        <AiAnalysisPanel />

        <section className="panel">
          <div className="journal-head">
            <div>
              <h2>Trade Journal</h2>
              <small>
                Comprehensive log · trade details · rationale · risk management ·
                psychological state · visual documentation
              </small>
            </div>
            <div className="journal-filters">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`journal-filter-chip ${filter === f.key ? "active" : ""}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                  {f.key !== "all" && (
                    <span className="journal-filter-count">
                      {journal.filter((j) => j.status === f.key).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="journal-empty">
              <small>
                {journal.length === 0
                  ? "No trades logged yet. Approve and send from the Control Center to begin logging."
                  : `No trades match filter "${filter}".`}
              </small>
            </div>
          ) : (
            <div className="journal-list">
              {filtered.map((entry) => (
                <TradeCard
                  key={entry.id}
                  entry={entry}
                  expanded={expandedId === entry.id}
                  onToggle={() =>
                    setExpandedId(expandedId === entry.id ? null : entry.id)
                  }
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// =================================================================
// Trade card — collapsed header + expandable detail sections
// =================================================================

function TradeCard({
  entry,
  expanded,
  onToggle,
}: {
  entry: JournalEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusClass =
    entry.status === "win"       ? "win" :
    entry.status === "loss"      ? "loss" :
    entry.status === "breakeven" ? "be" :
    entry.status === "skipped"   ? "skip" :
    "open";

  const rColor =
    (entry.outcomeR ?? 0) > 0  ? "var(--accent)" :
    (entry.outcomeR ?? 0) < 0  ? "var(--danger)" :
    "var(--muted)";

  return (
    <div className={`trade-card ${expanded ? "expanded" : ""}`}>
      <button
        className="trade-card-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className={`trade-status-pill ${statusClass}`}>
          {entry.status.toUpperCase()}
        </span>
        <span className="trade-sym">{entry.symbol}</span>
        <span className={`trade-side ${entry.side}`}>
          {entry.side.toUpperCase()}
        </span>
        <span className="trade-meta">
          {entry.contracts}ct · {entry.strategyLabel}
        </span>
        <span className="trade-time">
          {new Date(entry.timestamp).toLocaleString()}
        </span>
        <span className="trade-r" style={{ color: rColor }}>
          {entry.outcomeR !== undefined ? `${entry.outcomeR >= 0 ? "+" : ""}${entry.outcomeR.toFixed(2)}R` : "—"}
        </span>
        <span className="trade-caret">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <div className="trade-card-body">
          <TradeDetailsSection entry={entry} />
          <StrategyRationaleSection entry={entry} />
          <RiskManagementSection entry={entry} />
          <OutcomeSection entry={entry} />
          <PsychologySection entry={entry} />
          <VisualDocumentationSection entry={entry} />
          <NotesSection entry={entry} />
        </div>
      )}
    </div>
  );
}

// =================================================================
// Section 1: Trade details (read-only — auto populated at send)
// =================================================================

function TradeDetailsSection({ entry }: { entry: JournalEntry }) {
  return (
    <div className="trade-section">
      <div className="trade-section-head">1 · Trade Details</div>
      <div className="trade-kv-grid">
        <KV k="Date / Time" v={new Date(entry.timestamp).toLocaleString()} />
        <KV k="Symbol" v={entry.symbol} />
        <KV k="Direction" v={entry.side.toUpperCase()} />
        <KV k="Contracts" v={`${entry.contracts}`} />
        <KV k="Entry" v={entry.entryPrice.toFixed(2)} />
        <KV k="Stop" v={entry.stopPrice.toFixed(2)} />
        <KV k="TP1 / TP2" v={`${entry.tp1Price.toFixed(2)} / ${entry.tp2Price.toFixed(2)}`} />
        <KV k="Stop distance" v={`${entry.stopDistance.toFixed(2)} pts`} />
        <KV k="Notional" v={`$${entry.notionalDollars.toFixed(0)}`} />
        <KV k="Risk (account)" v={`$${entry.accountRiskDollars.toFixed(0)}`} />
      </div>
    </div>
  );
}

// =================================================================
// Section 2: Strategy & rationale (read-only)
// =================================================================

function StrategyRationaleSection({ entry }: { entry: JournalEntry }) {
  return (
    <div className="trade-section">
      <div className="trade-section-head">2 · Strategy & Rationale</div>
      <div className="trade-kv-grid">
        <KV k="Strategy" v={entry.strategyLabel} />
        <KV k="Strategy ID" v={entry.strategy} />
        <KV k="Regime" v={entry.regime} />
        <KV k="Regime confidence" v={entry.regimeConfidence.toFixed(2)} />
        <KV k="Raw score" v={entry.rawScore.toFixed(3)} />
        <KV k="Adjusted score" v={entry.adjustedScore.toFixed(3)} />
      </div>
      {entry.playbookReasons.length > 0 && (
        <div className="trade-reasons">
          <div className="trade-reasons-label">Playbook reasons</div>
          <ul>
            {entry.playbookReasons.map((r, i) => (<li key={i}>{r}</li>))}
          </ul>
        </div>
      )}
    </div>
  );
}

// =================================================================
// Section 3: Risk management (editable)
// =================================================================

function RiskManagementSection({ entry }: { entry: JournalEntry }) {
  const { updateJournalEntry } = useWorkstation();
  const rr = entry.rMultiple;
  return (
    <div className="trade-section">
      <div className="trade-section-head">3 · Risk Management</div>
      <div className="trade-kv-grid">
        <KV k="Risk / Reward" v={`1 : ${rr.toFixed(2)}`} />
        <KV k="Per contract risk" v={`$${entry.perContractRisk.toFixed(2)}`} />
        <KV k="Total risk" v={`$${entry.accountRiskDollars.toFixed(2)}`} />
        <KV k="Followed plan?" v={entry.followedPlan === undefined ? "—" : entry.followedPlan ? "Yes" : "No"} />
      </div>

      <div className="trade-toggle-row">
        <label className="trade-toggle">
          <input
            type="radio"
            name={`plan-${entry.id}`}
            checked={entry.followedPlan === true}
            onChange={() => updateJournalEntry(entry.id, { followedPlan: true })}
          />
          <span>Followed the plan</span>
        </label>
        <label className="trade-toggle">
          <input
            type="radio"
            name={`plan-${entry.id}`}
            checked={entry.followedPlan === false}
            onChange={() => updateJournalEntry(entry.id, { followedPlan: false })}
          />
          <span>Deviated</span>
        </label>
      </div>

      {entry.followedPlan === false && (
        <textarea
          className="trade-textarea"
          placeholder="What did you do differently and why? (e.g. moved stop, took off half early, chased entry…)"
          value={entry.deviationNotes ?? ""}
          onChange={(e) => updateJournalEntry(entry.id, { deviationNotes: e.target.value })}
        />
      )}
    </div>
  );
}

// =================================================================
// Section 4: Outcome (editable — P&L / exit)
// =================================================================

function OutcomeSection({ entry }: { entry: JournalEntry }) {
  const { updateJournalEntry, deleteJournalEntry } = useWorkstation();
  const [draftExit, setDraftExit] = useState<string>(entry.exitPrice?.toString() ?? "");

  const applyExit = () => {
    const exitPrice = parseFloat(draftExit);
    if (!isFinite(exitPrice)) return;
    const { outcomeR, pnlDollars, status } = computeOutcome(
      entry, exitPrice, pointValueFor(entry.symbol),
    );
    updateJournalEntry(entry.id, {
      exitPrice,
      exitTime: new Date().toISOString(),
      outcomeR,
      pnlDollars,
      status,
    });
  };

  return (
    <div className="trade-section">
      <div className="trade-section-head">4 · Outcome</div>
      <div className="trade-outcome-row">
        <label className="trade-inline-field">
          <span>Exit price</span>
          <input
            type="number"
            step="0.01"
            value={draftExit}
            onChange={(e) => setDraftExit(e.target.value)}
            placeholder={entry.entryPrice.toFixed(2)}
          />
        </label>
        <button className="trade-apply-btn" onClick={applyExit}>
          Record exit
        </button>
        {entry.status !== "open" && (
          <button
            className="trade-reopen-btn"
            onClick={() => updateJournalEntry(entry.id, {
              status: "open", exitPrice: undefined, exitTime: undefined,
              outcomeR: undefined, pnlDollars: undefined,
            })}
          >
            Reopen
          </button>
        )}
        <button
          className="trade-delete-btn"
          onClick={() => {
            if (confirm(`Delete trade ${entry.symbol} @ ${new Date(entry.timestamp).toLocaleTimeString()}?`)) {
              deleteJournalEntry(entry.id);
            }
          }}
        >
          Delete
        </button>
      </div>

      {entry.exitPrice !== undefined && (
        <div className="trade-kv-grid">
          <KV k="Exit price" v={entry.exitPrice.toFixed(2)} />
          <KV k="Exit time" v={entry.exitTime ? new Date(entry.exitTime).toLocaleString() : "—"} />
          <KV k="Outcome R" v={entry.outcomeR !== undefined ? `${entry.outcomeR.toFixed(3)}R` : "—"} />
          <KV k="P&L" v={entry.pnlDollars !== undefined ? `$${entry.pnlDollars.toFixed(2)}` : "—"} />
        </div>
      )}
    </div>
  );
}

// =================================================================
// Section 5: Psychological / emotional state (editable)
// =================================================================

function PsychologySection({ entry }: { entry: JournalEntry }) {
  const { updateJournalEntry } = useWorkstation();

  const toggleEmotion = (tag: EmotionTag) => {
    const current = entry.emotions ?? [];
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    updateJournalEntry(entry.id, { emotions: next });
  };

  return (
    <div className="trade-section">
      <div className="trade-section-head">5 · Psychological State</div>

      <div className="emotion-grid">
        {EMOTION_TAGS.map((tag) => {
          const isOn = entry.emotions?.includes(tag) ?? false;
          return (
            <button
              key={tag}
              className={`emotion-chip ${isOn ? "active" : ""}`}
              onClick={() => toggleEmotion(tag)}
            >
              {tag}
            </button>
          );
        })}
      </div>

      <div className="mindset-grid">
        <label className="mindset-field">
          <span>Before entry</span>
          <textarea
            placeholder="What was your state of mind before pulling the trigger?"
            value={entry.mindsetBefore ?? ""}
            onChange={(e) => updateJournalEntry(entry.id, { mindsetBefore: e.target.value })}
          />
        </label>
        <label className="mindset-field">
          <span>During trade</span>
          <textarea
            placeholder="How did you feel while in the trade? Any urge to deviate?"
            value={entry.mindsetDuring ?? ""}
            onChange={(e) => updateJournalEntry(entry.id, { mindsetDuring: e.target.value })}
          />
        </label>
        <label className="mindset-field">
          <span>After close</span>
          <textarea
            placeholder="Post-trade reflection — lessons, surprises, what you'd repeat/change."
            value={entry.mindsetAfter ?? ""}
            onChange={(e) => updateJournalEntry(entry.id, { mindsetAfter: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}

// =================================================================
// Section 6: Visual documentation (editable URLs)
// =================================================================

function VisualDocumentationSection({ entry }: { entry: JournalEntry }) {
  const { updateJournalEntry } = useWorkstation();
  return (
    <div className="trade-section">
      <div className="trade-section-head">6 · Visual Documentation</div>
      <div className="mindset-grid">
        <label className="mindset-field">
          <span>Entry screenshot URL</span>
          <input
            type="url"
            placeholder="https://… (upload to Imgur / TradingView snapshot)"
            value={entry.entryScreenshotUrl ?? ""}
            onChange={(e) => updateJournalEntry(entry.id, { entryScreenshotUrl: e.target.value })}
          />
        </label>
        <label className="mindset-field">
          <span>Exit screenshot URL</span>
          <input
            type="url"
            placeholder="https://…"
            value={entry.exitScreenshotUrl ?? ""}
            onChange={(e) => updateJournalEntry(entry.id, { exitScreenshotUrl: e.target.value })}
          />
        </label>
        <label className="mindset-field">
          <span>TradingView link</span>
          <input
            type="url"
            placeholder="https://www.tradingview.com/chart/…"
            value={entry.tradingViewUrl ?? ""}
            onChange={(e) => updateJournalEntry(entry.id, { tradingViewUrl: e.target.value })}
          />
        </label>
      </div>

      {(entry.entryScreenshotUrl || entry.exitScreenshotUrl) && (
        <div className="screenshot-grid">
          {entry.entryScreenshotUrl && (
            <a href={entry.entryScreenshotUrl} target="_blank" rel="noreferrer">
              <img src={entry.entryScreenshotUrl} alt="Entry chart" />
              <small>Entry</small>
            </a>
          )}
          {entry.exitScreenshotUrl && (
            <a href={entry.exitScreenshotUrl} target="_blank" rel="noreferrer">
              <img src={entry.exitScreenshotUrl} alt="Exit chart" />
              <small>Exit</small>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function NotesSection({ entry }: { entry: JournalEntry }) {
  const { updateJournalEntry } = useWorkstation();
  return (
    <div className="trade-section">
      <div className="trade-section-head">Lesson Notes</div>
      <textarea
        className="trade-textarea"
        placeholder="Free-form lessons, market context, follow-up ideas…"
        value={entry.notes ?? ""}
        onChange={(e) => updateJournalEntry(entry.id, { notes: e.target.value })}
      />
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="trade-kv">
      <div className="trade-kv-k">{k}</div>
      <div className="trade-kv-v">{v}</div>
    </div>
  );
}

// =================================================================
// Signal Log panel — audits every unique setup the scanner emits
// across ALL 6 instruments, per-symbol counts + recent list.
// =================================================================

function SignalLogPanel() {
  const { signalLog, clearSignalLog } = useWorkstation();
  const [symbolFilter, setSymbolFilter] = useState<string>("all");
  const [windowHours, setWindowHours] = useState<number>(24);

  const summary = useMemo(
    () => summarizeSignalLog(signalLog, windowHours * 60 * 60 * 1000),
    [signalLog, windowHours],
  );
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  const filtered = useMemo(
    () => signalLog
      .filter(e => new Date(e.timestamp).getTime() >= cutoff)
      .filter(e => symbolFilter === "all" || e.symbol === symbolFilter)
      .slice(0, 100),
    [signalLog, symbolFilter, cutoff],
  );

  const symbols = Array.from(new Set(signalLog.map(e => e.symbol))).sort();

  return (
    <section className="panel">
      <div className="journal-head">
        <div>
          <h2>📡 Signal Log</h2>
          <small>
            Every unique setup the scanner emits, across all 6 instruments.
            Use this to see where noise comes from. {summary.total} signals in
            the last {windowHours}h ({summary.uniqueSetupsToday} unique setups).
          </small>
        </div>
        <button
          className="journal-filter-chip"
          onClick={() => {
            if (confirm("Clear the entire signal log? This cannot be undone.")) clearSignalLog();
          }}
          style={{ fontSize: 12, padding: "4px 10px" }}
        >
          Clear log
        </button>
      </div>

      <div className="journal-filters" style={{ marginTop: 8 }}>
        <button
          className={`journal-filter-chip ${symbolFilter === "all" ? "active" : ""}`}
          onClick={() => setSymbolFilter("all")}
        >
          All <span className="journal-filter-count">{summary.total}</span>
        </button>
        {symbols.map(s => (
          <button
            key={s}
            className={`journal-filter-chip ${symbolFilter === s ? "active" : ""}`}
            onClick={() => setSymbolFilter(s)}
          >
            {s} <span className="journal-filter-count">{summary.bySymbol[s] ?? 0}</span>
          </button>
        ))}
        <select
          value={windowHours}
          onChange={(e) => setWindowHours(Number(e.target.value))}
          style={{ marginLeft: "auto", background: "transparent", color: "inherit", border: "1px solid var(--border)", padding: "4px 8px" }}
        >
          <option value={1}>1 h</option>
          <option value={4}>4 h</option>
          <option value={24}>24 h</option>
          <option value={168}>7 days</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="journal-empty">
          <small>No signals in window.</small>
        </div>
      ) : (
        <div className="signal-log-list">
          {filtered.map((e) => (
            <div key={e.id} className="signal-log-row">
              <span className="signal-log-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
              <span className="signal-log-sym">{e.symbol}</span>
              <span className={`trade-side ${e.side}`}>{e.side.toUpperCase()}</span>
              <span className="signal-log-strat">{e.strategy}</span>
              <span className="signal-log-regime">{e.regime.replace("_", " ")}</span>
              <span className={`trade-status-pill ${e.state === "best_available" ? "win" : e.state === "stand_aside" ? "loss" : "be"}`}>
                {e.state}
              </span>
              <span className="signal-log-score">
                adj {e.adjustedScore.toFixed(2)} · T {e.triggerQuality >= 0 ? "+" : ""}{e.triggerQuality.toFixed(2)} · L {e.locationQuality >= 0 ? "+" : ""}{e.locationQuality.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// =================================================================
// AI Analysis panel — "Analyze my trades" button + result block
// =================================================================

function AiAnalysisPanel() {
  const { journal, providerConfig } = useWorkstation();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const closedCount = useMemo(
    () => journal.filter(e => e.status === "win" || e.status === "loss" || e.status === "breakeven").length,
    [journal],
  );

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    const r = await aiJournalAnalysis(providerConfig.restUrl, journal);
    setLoading(false);
    if (r.ok && r.data) setResult(r.data.analysis);
    else setError(r.error ?? "unknown error");
  };

  return (
    <section className="panel">
      <div className="journal-head">
        <div>
          <h2>🤖 AI Journal Analysis</h2>
          <small>
            Claude reads your closed trades and finds patterns — regime fit,
            strategy performance, emotional correlation. Runs on Claude Haiku
            (~$0.01/analysis). {closedCount} closed trade{closedCount === 1 ? "" : "s"} available.
          </small>
        </div>
        <button
          className="journal-filter-chip active"
          disabled={loading || closedCount < 5}
          onClick={run}
          style={{ fontSize: 14, padding: "8px 16px" }}
        >
          {loading ? "Analyzing…" : result ? "Re-analyze" : "Analyze my trades"}
        </button>
      </div>

      {closedCount < 5 && !result && (
        <small style={{ color: "var(--muted)" }}>
          Need at least 5 closed trades. Log a few more from the Control Center first.
        </small>
      )}

      {error && (
        <div className="journal-empty" style={{ color: "var(--danger)" }}>
          <small>AI unavailable: {error}</small>
        </div>
      )}

      {result && (
        <pre className="ai-journal-result">
          {result}
        </pre>
      )}
    </section>
  );
}
