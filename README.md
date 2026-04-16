# Nextrade AI — Claude

Multi-agent desktop trading workstation. The desktop app is the real product; the
mobile prototype under `frontend/apps/mobile` is retained for reference only.

Execution path: **Nextrade AI → TradersPost → Tradovate**.

## Layout

```
frontend/
  apps/
    desktop/     # React + TS + Vite desktop workstation (primary product)
    mobile/      # Legacy mobile prototype (reference only)
backend/
  decision_engine_api.py   # FastAPI decision engine demo (optional, reference)
docs/
  ARCHITECTURE.md
  TEST_SUMMARY.md
```

## Running the desktop app

```bash
cd frontend/apps/desktop
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # tsc -b --noEmit
npm run test         # vitest matrix
npm run build        # production build
```

The workstation is a **three-column layout**:

- **Left — Market Scanner:** instruments, regime, tradable state
- **Center — Decision Engine + Execution:** hero trade card, runner-ups, Telegram / KEY=VALUE / JSON output, approve → send
- **Right — Strategy & Tools:** Validation, Pine Studio, Control Center, Journal

Optional panels available:

- `QuorumPanel` — multi-check agreement view (toggle from top bar)
- `CapitalLabWorkspace` — prop-firm planning workspace
- `PerformancePanel` — journal roll-up

## Core rules (locked)

- Desktop is the target. Mobile is not.
- Always produce a best available trade unless a **true hard block** applies.
- Validation adjusts **confidence** and **size**, never silently kills trades.
- Futures sizing is **integer contracts only**, `final = min(risk, quality cap)`.
- Pine scripts are **day-specific implementations of the selected master playbook**, never random.
- Regimes (7): strong trend up/down, balanced range, expansion breakout, reversal / mean reversion, low quality, event driven.
- Strategies (12): see `frontend/apps/desktop/src/engine/strategies.ts`.

## Quality cap ladder

| Adjusted score | Cap         |
| -------------- | ----------- |
| ≥ 0.75         | 4 contracts |
| ≥ 0.58         | 3 contracts |
| ≥ 0.45         | 2 contracts |
| ≥ 0.35         | 1 contract  |
| < 0.35         | 0           |

## Hard-block states

Only these can fully block trading:

- major event lockout
- operator kill switch
- invalid / missing critical data
- extreme volatility emergency

## Tests

The vitest matrix covers the sections called out in the test plan:

- decision engine taxonomy and selection
- sizing (integer-only, ladder, `min(risk, cap)`)
- validation (bounded adjustments, hard-block triggers)
- Pine generation (anchored to selected playbook)
- execution output consistency across Telegram / KEY=VALUE / JSON

See [`docs/TEST_SUMMARY.md`](docs/TEST_SUMMARY.md) for the full matrix.

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Legacy artifacts

- `frontend/apps/mobile/` — prior mobile prototype, not the current product.
- `backend/decision_engine_api.py` — FastAPI reference for the decision engine.
