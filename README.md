# NexTrade AI

This repository contains the current NexTrade AI mobile trading workstation prototype and the decision-engine API.

## Structure

- `frontend/Nextrade-ai-mobile-prototype.tsx` — current React mobile prototype UI
- `backend/decision_api.py` — FastAPI decision engine demo API
- `backend/start_decision_api.ps1` — quick PowerShell runner for the backend
- `backend/requirements.txt` — Python dependencies for the backend

## Run the backend

```powershell
cd backend
pip install -r requirements.txt
python -m uvicorn decision_api:app --reload
```

Then open:

- `http://localhost:8000/docs`
- `http://localhost:8000/decision/demo?symbol=MES`

## Notes

The Home screen in the current UI is wired to the decision endpoint first, while the rest of the prototype still uses the fallback/mock application state until the remaining views are migrated.
