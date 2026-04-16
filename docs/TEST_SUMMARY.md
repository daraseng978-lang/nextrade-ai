# Test summary

The vitest suite (`frontend/apps/desktop/src/tests/*.test.ts`) implements the
test matrix from the build plan.

## 10.1 Boot / compile tests — QA Director

- `npm run typecheck` — `tsc -b --noEmit` must pass.
- `npm run build` — must produce a clean Vite bundle.
- Desktop app starts with `npm run dev` at `http://localhost:5173`.

## 10.3 Decision logic — Decision Engineer

- `decision.test.ts`
  - all 7 regimes and 12 strategies are present.
  - every regime maps to valid, known strategies.
  - trending regime selects a `trend` or `breakout` family candidate.
  - strong trend down produces a short candidate.
  - kill switch produces a hard-block signal with 0 contracts.
  - runner-ups are provided when not hard-blocked.

## 10.4 Sizing — Risk Manager

- `sizing.test.ts`
  - quality cap ladder maps score → cap per locked rules.
  - final contracts always integer.
  - `final = min(riskContracts, qualityCap)` always holds.
  - score below 0.35 → 0 contracts.
  - every mock signal sizes with integer contracts only.

## 10.5 Validation — Validation Analyst

- `validation.test.ts`
  - adjusted score stays in `[0, 1]`.
  - worst-case validation input lowers the adjusted score.
  - normal mock data never triggers a hard block.
  - invalid data (ATR = 0) triggers a hard block.

## 10.6 Pine generation — Pine Engineer

- `pine.test.ts`
  - generated Pine includes `@version=5`, instrument symbol, selected strategy id.
  - generated Pine carries session levels (`orHigh`, `orLow`, `pdH`, `pdL`).
  - alert payload mirrors normalized signal fields (ticker, action, quantity, stop, strategy).

## 10.7 Execution — Execution Engineer

- `execution.test.ts`
  - Telegram / KEY=VALUE / JSON all derive from the same signal.
  - watch-only signals never flip to live-ready state.
  - KEY=VALUE and JSON formats agree on contract count.

## 10.2 Selection flow — Desktop UI Engineer (manual)

Driven from the desktop UI:

- Selecting a scanner row updates the hero card, validation bars, Pine output, execution block.
- Switching instruments clears stale context; bars and panels re-render.

## 10.8 Journal — Journal Analyst (manual)

- Approve → Send in `ExecutionPanel` writes an entry into `JournalPanel`.
- Entry carries symbol, strategy, regime, side, contracts, adjusted score.

## 10.9 Control center — Control Center Engineer (manual)

- Kill switch state visible in top bar and Control Center panel.
- Integration state surfaced (mock).
- Disabling Quorum does not destabilize the rest of the desk.

## 10.10 Regression — QA Director

After each phase, `npm run test` + `npm run typecheck` + `npm run build` must all pass.
