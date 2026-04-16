# Architecture

## System layers

1. **Input Layer** — market data + instrument context (`engine/mockData.ts` today, real feed later).
2. **Decision Layer** — `engine/decisionEngine.ts` picks the best candidate.
3. **Strategy Realization Layer** — `engine/playbooks.ts` turns a selected strategy into a concrete candidate with levels.
4. **Pine Creation Layer** — `engine/pineGenerator.ts` builds day-specific Pine + alert payload.
5. **Validation Layer** — `engine/validation.ts` produces profile + adjusted score + hard-block check.
6. **Signal Decision Layer** — `decide()` assembles final `SelectedSignal`.
7. **Confirmation Layer (optional)** — `panels/QuorumPanel.tsx`.
8. **Execution Layer** — `engine/executionFormatter.ts` → TradersPost dispatch shape.
9. **Journal / Feedback Layer** — `state/WorkstationContext.tsx#logExecution` + `panels/JournalPanel.tsx`.

## End-to-end flow

```
Market Data + Context
  → Decision Engine
    → Selected Instrument + Regime + Playbook
    → Strategy Realization
    → Pine Script Generation
    → Validation / Prop-Firm Adjustment
    → Best Available Trade Output
    → Optional Quorum
    → TradersPost
    → Tradovate
    → Journal / Performance
    → Calibration Loop
```

## Module ownership

| Module                                            | Owner agent         |
| ------------------------------------------------- | ------------------- |
| `engine/regimes.ts`, `engine/strategies.ts`, `engine/playbooks.ts` | Strategist          |
| `engine/decisionEngine.ts`                        | Decision Engineer   |
| `engine/sizing.ts`                                | Risk Manager        |
| `engine/validation.ts`                            | Validation Analyst  |
| `engine/pineGenerator.ts`                         | Pine Engineer       |
| `engine/executionFormatter.ts`                    | Execution Engineer  |
| `layout/*`, `panels/MarketScannerPanel.tsx`, `panels/DecisionPanel.tsx`, `panels/ValidationPanel.tsx`, `panels/PineStudioPanel.tsx`, `panels/ExecutionPanel.tsx` | Desktop UI Engineer |
| `panels/ControlCenterPanel.tsx`, `panels/QuorumPanel.tsx`          | Control Center Engineer |
| `panels/JournalPanel.tsx`, `panels/PerformancePanel.tsx`, `panels/CapitalLabWorkspace.tsx` | Journal Analyst     |
| `src/tests/**`                                    | QA Director         |

## Data contracts

All panels read the single `SelectedSignal` from `WorkstationContext`. The
scanner drives context; center and right panels always reflect the same
selected trade. Normalized types live in `engine/types.ts` — no field drift.

## Workspace modes

The top bar switches between two layouts that share the same context:

- **Desk** (`DesktopWorkbench`) — original 3-column trading workflow.
- **Control Center** (`ControlCenter`) — supervisory layout with:
  - top strip: system mode, kill switch, prop-firm state, selected instrument / strategy, quorum, journal count.
  - left zone: Market Scanner + AI Agent Status.
  - center zone: TradingView multi-timeframe workspace + Validation.
  - right zone: Prop-Firm Entry Control + Journal.

Execution workflow state (`draft → approved → sent`, or `blocked` / `watch_only`) lives in `WorkstationContext` so both layouts stay synchronized. Selecting a different instrument resets the workflow to `draft`.

## Control Center modules

- `panels/ChartWorkspace.tsx` — quad / focus TradingView display. Levels are overlaid as a legend card per chart (third-party iframe can't be injected into).
- `panels/AgentStatusPanel.tsx` — groups agents by section (decision / risk / pine / execution / control / journal). Summaries are safe operational lines — no raw chain-of-thought.
- `panels/PropFirmEntryPanel.tsx` — entry state machine with compliance meters (daily loss, drawdown, consistency, evaluation caution, payout stability).

## Hard-block policy

Only four states fully block trading: major event lockout, operator kill
switch, invalid / missing critical data, extreme volatility emergency. Every
other soft condition adjusts confidence or cap, never suppresses output.

## Sizing contract

```
finalContracts = min(riskContracts, qualityCap)
riskContracts  = floor((equity * riskPerTrade) / perContractRisk)
qualityCap     = ladder(adjustedScore)    // integer, 0..4
```

Fractional contracts are impossible by construction.
