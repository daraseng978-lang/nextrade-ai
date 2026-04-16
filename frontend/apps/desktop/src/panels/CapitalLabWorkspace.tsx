import { useWorkstation } from "../state/WorkstationContext";

// Separate workspace (not mounted into the main desk by default).
// Surfaces prop-firm-style planning: daily risk, consistency target,
// max daily loss, and "what-if" sizing at different account equities.
export function CapitalLabWorkspace() {
  const { account, setAccount, selected } = useWorkstation();
  const perContract = selected.sizing.perContractRisk;
  const dailyBudget = account.accountEquity * account.maxDailyLossPct;
  const consistencyCap = account.accountEquity * account.consistencyTargetPct;
  return (
    <section className="panel">
      <h2>Capital Lab</h2>
      <small>Prop-firm simulation / planning</small>
      <table className="kv" style={{ marginTop: 10 }}>
        <tbody>
          <tr>
            <td className="k">Account equity</td>
            <td>
              <input
                type="number"
                value={account.accountEquity}
                onChange={(e) => setAccount({ ...account, accountEquity: Number(e.target.value) })}
                className="exec-block"
                style={{ width: 140 }}
              />
            </td>
          </tr>
          <tr><td className="k">Risk per trade</td><td>{(account.riskPerTradePct * 100).toFixed(2)}%</td></tr>
          <tr><td className="k">Daily loss budget</td><td>${dailyBudget.toFixed(0)}</td></tr>
          <tr><td className="k">Consistency cap</td><td>${consistencyCap.toFixed(0)}</td></tr>
          <tr><td className="k">Per-contract risk</td><td>${perContract.toFixed(2)}</td></tr>
        </tbody>
      </table>
    </section>
  );
}
