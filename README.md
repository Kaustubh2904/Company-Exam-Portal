# Company Exam Portal

A full-stack recruitment exam platform with a FastAPI backend, React admin/company dashboard, and a student exam client. Companies create drives, invite students, deliver proctored MCQ exams, and review results.

## Stack
- **Backend:** FastAPI, SQLAlchemy, PostgreSQL
- **Admin/Company UI:** React + Vite (`frontend-react`)
- **Student UI:** React + Vite (`student-portal`)
- **Auth:** JWT for companies/admin, access tokens for students
- **Email:** SMTP-based invitations

## Repository layout
- `backend/` — FastAPI API, models, auth, email utils
- `frontend-react/` — admin/company dashboard
- `student-portal/` — student exam client
- `sample_*.csv` — sample data for questions/students

See `docs/system-overview.md` for workflow, data model, and sequence details.

## Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL (default URL: `postgresql+psycopg://postgres:password@localhost:5432/company_exam_portal`)

## Quick start
### Backend (FastAPI)
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # set DATABASE_URL, SECRET_KEY, SMTP_*
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
API docs at http://localhost:8000/docs

### Admin/Company dashboard
```powershell
cd frontend-react
npm install
npm run dev -- --host --port 5173
```

### Student portal
```powershell
cd student-portal
npm install
npm run dev -- --host --port 5174
```



## Deployment notes
- Keep `.env` values out of git (secrets/keys). Sample at `backend/.env.example`.
- Commit lockfiles for reproducible builds (`package-lock.json`/`yarn.lock`/`pnpm-lock.yaml`).
- Set CORS origins via `ALLOWED_ORIGINS` when hosting.

## Documentation
- Full architecture & workflow: `docs/system-overview.md`
- API base: `backend/app/main.py` (routers under `app/routes`)
