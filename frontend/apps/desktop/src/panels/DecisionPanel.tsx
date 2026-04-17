import { useEffect, useRef, useState } from "react";
import { useWorkstation } from "../state/WorkstationContext";
import { STRATEGIES } from "../engine/strategies";
import { aiTradeReasoning } from "../engine/ai";

interface AiCacheEntry { key: string; text: string; at: number; }

export function DecisionPanel() {
  const { selected, providerConfig } = useWorkstation();
  const c = selected.candidate;
  const meta = STRATEGIES[c.strategy];
  const blocked = selected.state === "hard_blocked";

  // AI commentary — keyed on stable setup (symbol+strategy+regime+side).
  // Per-symbol cache so flipping between symbols shows the prior analysis
  // instead of re-paying Claude. Only fires on genuine setup changes;
  // regime hysteresis upstream keeps borderline flicker from reaching us.
  const stableKey = `${c.instrument.symbol}-${c.strategy}-${c.regime}-${c.side}`;
  const aiCache = useRef<Record<string, AiCacheEntry>>({});
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const symbol = c.instrument.symbol;

    if (blocked || c.reasons.length === 0) {
      setAiText(null);
      setAiErr(null);
      setAiLoading(false);
      return;
    }

    const cached = aiCache.current[symbol];
    // Same stable setup for this symbol — reuse the cached analysis,
    // don't re-call Claude. Swapping to a different symbol still shows
    // that symbol's cached text (if any).
    if (cached && cached.key === stableKey) {
      setAiText(cached.text);
      setAiErr(null);
      setAiLoading(false);
      return;
    }
    // Show stale text from the previous setup on this symbol while the
    // new one loads — better UX than flashing empty → text.
    if (cached) setAiText(cached.text);
    setAiErr(null);
    setAiLoading(true);
    aiTradeReasoning(providerConfig.restUrl, selected).then((r) => {
      if (cancelled) return;
      setAiLoading(false);
      if (r.ok && r.data) {
        aiCache.current[symbol] = { key: stableKey, text: r.data.commentary, at: Date.now() };
        setAiText(r.data.commentary);
      } else {
        setAiErr(r.error ?? "unknown error");
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableKey, blocked, providerConfig.restUrl]);

  return (
    <section>
      <div className="panel">
        <h2>Decision Engine</h2>
        <small>Best available trade · runner-ups · why this won</small>
      </div>
      <div className="hero">
        <div className="title">
          <h2>
            {blocked
              ? `🚫 Hard Block`
              : `${c.instrument.symbol} · ${c.side.toUpperCase()} · ${meta.label}`}
          </h2>
          <div className="sub">
            {blocked
              ? selected.hardBlock.detail ?? selected.hardBlock.reason
              : `Regime: ${c.regime}  |  Family: ${meta.family}  |  R-target: ${c.rMultiple}x`}
          </div>
        </div>

        <div className="grid-3">
          <Cell label="Entry" value={c.entry.toFixed(2)} />
          <Cell label="Stop" value={c.stop.toFixed(2)} />
          <Cell label="Target" value={c.target.toFixed(2)} />
          <Cell label="Raw Score" value={c.rawScore.toFixed(2)} />
          <Cell label="Adj. Score" value={selected.adjustedScore.toFixed(2)} />
          <Cell label="Final Contracts" value={String(selected.sizing.finalContracts)} />
        </div>
      </div>

      {!blocked && c.reasons.length > 0 && (
        <div className="reason-list">
          <strong>🤖 AI desk analyst</strong>
          <p style={{ marginTop: 6 }}>
            {aiLoading && <em style={{ color: "var(--muted)" }}>Analyzing setup…</em>}
            {aiErr && <em style={{ color: "var(--muted)" }}>AI unavailable: {aiErr}</em>}
            {aiText}
          </p>
        </div>
      )}

      <div className="reason-list">
        <strong>Why this won</strong>
        <ul>
          {c.reasons.length === 0 ? (
            <li>No eligible candidate — {selected.state.replace("_", " ")}.</li>
          ) : (
            c.reasons.map((r, i) => <li key={i}>{r}</li>)
          )}
        </ul>
      </div>

      {c.scoreBreakdown && (
        <div className="reason-list">
          <strong>
            Score breakdown{" "}
            {c.scoreBreakdown.realizedN > 0
              ? `· ${c.scoreBreakdown.realizedN} live trade${c.scoreBreakdown.realizedN === 1 ? "" : "s"} in blend`
              : "· no live trades yet (Capital Lab preset only)"}
          </strong>
          <table className="kv" style={{ marginTop: 6 }}>
            <tbody>
              <ScoreRow label="Regime fit" value={c.scoreBreakdown.regime} />
              <ScoreRow label="Regime confidence" value={c.scoreBreakdown.confidence} />
              <ScoreRow label="Liquidity" value={c.scoreBreakdown.liquidity} />
              <ScoreRow label="Capital Lab + journal edge" value={c.scoreBreakdown.edge} />
              <ScoreRow label="Side alignment" value={c.scoreBreakdown.side} />
              <ScoreRow label="Event penalty" value={c.scoreBreakdown.event} />
              <ScoreRow label="Cross-market (VIX/DXY)" value={c.scoreBreakdown.crossMarket} />
              <ScoreRow label="Trigger quality (PA+vol)" value={c.scoreBreakdown.trigger} />
              <ScoreRow label="Location (VWAP+profile)" value={c.scoreBreakdown.location} />
              <ScoreRow label="Footprint bonus" value={c.scoreBreakdown.footprint} />
              <tr>
                <td className="k"><strong>Raw total</strong></td>
                <td><strong>{c.scoreBreakdown.total.toFixed(2)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="runner-ups">
        <strong>Runner-ups</strong>
        {selected.runnerUps.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No other viable candidates.</p>
        ) : (
          selected.runnerUps.map((r) => {
            const m = STRATEGIES[r.strategy];
            return (
              <div className="card" key={r.strategy}>
                <div>
                  <div style={{ fontWeight: 600 }}>{m.label}</div>
                  <small>
                    {r.side.toUpperCase()} · entry {r.entry.toFixed(2)} · stop {r.stop.toFixed(2)}
                  </small>
                </div>
                <div>{r.rawScore.toFixed(2)}</div>
                <div>
                  <span className="badge">{m.family}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="cell">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  const sign = value >= 0 ? "+" : "";
  return (
    <tr>
      <td className="k">{label}</td>
      <td>{sign}{value.toFixed(3)}</td>
    </tr>
  );
}
