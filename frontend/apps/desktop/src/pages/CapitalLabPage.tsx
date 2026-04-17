import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useWorkstation } from "../state/WorkstationContext";
import {
  buildDefaultParams,
  simulateCapitalLab,
  type CapitalLabParams,
} from "../engine/capitalLab";

// Capital Lab = prop-firm readiness simulator.
// Eval pass probability + funded lifecycle + Monte Carlo.
export function CapitalLabPage() {
  const { account } = useWorkstation();
  const [overrides, setOverrides] = useState<Partial<CapitalLabParams>>({});

  const params = useMemo<CapitalLabParams>(() => {
    const base = buildDefaultParams(
      account.accountEquity,
      account.riskPerTradePct,
      account.maxDailyLossPct,
      account.consistencyTargetPct,
    );
    return { ...base, ...overrides };
  }, [account, overrides]);

  const result = useMemo(() => simulateCapitalLab(params), [params]);

  const update = <K extends keyof CapitalLabParams>(key: K, value: CapitalLabParams[K]) =>
    setOverrides((prev) => ({ ...prev, [key]: value }));

  const curveData = useMemo(() => {
    const maxLen = Math.max(0, ...result.sampleCurves.map((c) => c.length));
    const rows: Array<Record<string, number>> = [];
    for (let i = 0; i < maxLen; i++) {
      const row: Record<string, number> = { trade: i };
      result.sampleCurves.forEach((c, idx) => {
        if (i < c.length) row[`p${idx}`] = c[i];
      });
      rows.push(row);
    }
    return rows;
  }, [result.sampleCurves]);

  const target = params.accountEquity * (1 + params.profitTargetPct);
  const trailingFloor = params.accountEquity - params.accountEquity * params.maxDrawdownPct;
  const readiness = readinessTier(result.passRate, result.expectancyR);

  return (
    <div className="page-grid capital-lab-grid">
      <aside className="column left">
        <section className="panel">
          <h2>Simulation Inputs</h2>
          <small>Edge &amp; rules for the Monte Carlo engine.</small>
          <table className="kv" style={{ marginTop: 10 }}>
            <tbody>
              <NumberRow
                label="Profit target (%)"
                value={params.profitTargetPct * 100}
                step={0.5}
                onChange={(v) => update("profitTargetPct", v / 100)}
              />
              <NumberRow
                label="Trailing DD (%)"
                value={params.maxDrawdownPct * 100}
                step={0.5}
                onChange={(v) => update("maxDrawdownPct", v / 100)}
              />
              <NumberRow
                label="Win rate (%)"
                value={params.winRate * 100}
                step={1}
                onChange={(v) => update("winRate", clamp01(v / 100))}
              />
              <NumberRow
                label="Avg win (R)"
                value={params.avgWinR}
                step={0.1}
                onChange={(v) => update("avgWinR", Math.max(0, v))}
              />
              <NumberRow
                label="Avg loss (R)"
                value={params.avgLossR}
                step={0.1}
                onChange={(v) => update("avgLossR", Math.max(0, v))}
              />
              <NumberRow
                label="Trades / day"
                value={params.tradesPerDay}
                step={1}
                onChange={(v) => update("tradesPerDay", Math.max(1, Math.round(v)))}
              />
              <NumberRow
                label="Eval days"
                value={params.maxEvalDays}
                step={1}
                onChange={(v) => update("maxEvalDays", Math.max(1, Math.round(v)))}
              />
              <NumberRow
                label="Funded days"
                value={params.fundedDays}
                step={1}
                onChange={(v) => update("fundedDays", Math.max(1, Math.round(v)))}
              />
              <NumberRow
                label="Paths"
                value={params.paths}
                step={100}
                onChange={(v) => update("paths", Math.max(100, Math.round(v)))}
              />
            </tbody>
          </table>
          <div style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => setOverrides({})}>Reset to account</button>
          </div>
          <div style={{ marginTop: 10, color: "var(--muted)" }}>
            <small>
              Account {fmtMoney(params.accountEquity)} · risk {(params.riskPerTradePct * 100).toFixed(2)}% ·
              daily loss {(params.maxDailyLossPct * 100).toFixed(2)}% (from Settings).
            </small>
          </div>
        </section>
      </aside>

      <main className="column wide">
        <section className="panel">
          <h2>Readiness</h2>
          <div className={`readiness-hero ${readiness.tone}`}>
            <div>
              <div className="readiness-label">{readiness.label}</div>
              <div className="readiness-sub">{readiness.sub}</div>
            </div>
            <div className="readiness-metric">
              <div className="metric-big">{(result.passRate * 100).toFixed(1)}%</div>
              <div className="metric-small">eval pass rate</div>
            </div>
          </div>
          <table className="kv" style={{ marginTop: 12 }}>
            <tbody>
              <tr>
                <td className="k">Expectancy</td>
                <td>{result.expectancyR.toFixed(2)}R / trade</td>
              </tr>
              <tr>
                <td className="k">Median days to pass</td>
                <td>
                  {result.medianDaysToPass == null
                    ? "—"
                    : `${result.medianDaysToPass} (P10 ${result.p10DaysToPass} · P90 ${result.p90DaysToPass})`}
                </td>
              </tr>
              <tr>
                <td className="k">Bust rate</td>
                <td>{(result.bustRate * 100).toFixed(1)}%</td>
              </tr>
              <tr>
                <td className="k">Timeout rate</td>
                <td>{(result.timeoutRate * 100).toFixed(1)}%</td>
              </tr>
              <tr>
                <td className="k">Max DD (P50)</td>
                <td>{fmtMoney(result.maxDrawdown.p50)} (P90 {fmtMoney(result.maxDrawdown.p90)})</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="panel">
          <h2>Equity paths</h2>
          <small>
            20 sample paths of {result.pathBreakdown.totalPaths.toLocaleString()} simulated.
            Green line = profit target, red line = trailing drawdown floor.
          </small>
          <div style={{ height: 260, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curveData}>
                <CartesianGrid stroke="#253148" strokeDasharray="3 3" />
                <XAxis dataKey="trade" stroke="#8596b0" />
                <YAxis
                  stroke="#8596b0"
                  domain={[
                    (dataMin: number) => Math.min(dataMin, trailingFloor) * 0.995,
                    (dataMax: number) => Math.max(dataMax, target) * 1.005,
                  ]}
                  tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  contentStyle={{ background: "#141c2b", border: "1px solid #253148", color: "#d7e0ef" }}
                  formatter={(v: number) => fmtMoney(v)}
                />
                <ReferenceLine y={target} stroke="#22c55e" strokeDasharray="4 2" />
                <ReferenceLine y={trailingFloor} stroke="#ef4444" strokeDasharray="4 2" />
                <ReferenceLine y={params.accountEquity} stroke="#8596b0" strokeDasharray="2 2" />
                {result.sampleCurves.map((_, idx) => (
                  <Line
                    key={idx}
                    type="monotone"
                    dataKey={`p${idx}`}
                    stroke={idx % 3 === 0 ? "#6ee7b7" : idx % 3 === 1 ? "#38bdf8" : "#eab308"}
                    strokeWidth={1}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                    opacity={0.7}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel">
          <h2>Funded lifecycle</h2>
          <small>
            Payout &amp; bust profile across {params.fundedDays} funded days after a successful eval.
            Consistency cap {(params.consistencyTargetPct * 100).toFixed(0)}% of gross profit per day.
          </small>
          <table className="kv" style={{ marginTop: 10 }}>
            <tbody>
              <tr>
                <td className="k">Payout P10</td>
                <td>{fmtMoney(result.fundedPayout.p10)}</td>
              </tr>
              <tr>
                <td className="k">Payout P50</td>
                <td>{fmtMoney(result.fundedPayout.p50)}</td>
              </tr>
              <tr>
                <td className="k">Payout P90</td>
                <td>{fmtMoney(result.fundedPayout.p90)}</td>
              </tr>
              <tr>
                <td className="k">Funded bust rate</td>
                <td>{(result.fundedPayout.bustRate * 100).toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="panel">
          <h2>Path breakdown</h2>
          <table className="kv">
            <tbody>
              <tr>
                <td className="k">Passed eval</td>
                <td>{result.pathBreakdown.passed.toLocaleString()} / {result.pathBreakdown.totalPaths.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="k">Busted</td>
                <td>{result.pathBreakdown.busted.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="k">Ran out of days</td>
                <td>{result.pathBreakdown.timedOut.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function NumberRow({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <tr>
      <td className="k">{label}</td>
      <td>
        <input
          type="number"
          value={value}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="exec-block"
          style={{ width: 110 }}
        />
      </td>
    </tr>
  );
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function fmtMoney(x: number): string {
  const sign = x < 0 ? "-" : "";
  const abs = Math.abs(x);
  if (abs >= 10_000) return `${sign}$${Math.round(abs).toLocaleString()}`;
  return `${sign}$${abs.toFixed(0)}`;
}

function readinessTier(
  passRate: number,
  expectancyR: number,
): { label: string; sub: string; tone: string } {
  if (expectancyR <= 0) {
    return {
      label: "Negative edge",
      sub: "Expectancy is negative — no size will fix this. Fix the strategy first.",
      tone: "bad",
    };
  }
  if (passRate >= 0.6) return { label: "Ready", sub: "High eval pass rate at these rules.", tone: "ok" };
  if (passRate >= 0.35) return { label: "Conditional", sub: "Pass rate is decent but not dominant — trim risk or widen targets.", tone: "wait" };
  return { label: "Not ready", sub: "Too much bust risk at current edge vs. rules.", tone: "bad" };
}
