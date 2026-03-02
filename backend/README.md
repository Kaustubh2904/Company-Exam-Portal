# Company Exam Portal — Backend

FastAPI backend for a recruitment exam platform. Companies register, create exam drives, upload student rosters, send SMTP invitations, and raise support tickets — all with admin oversight and JWT-based auth.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API Framework | FastAPI 0.104 |
| ORM | SQLAlchemy 2.0 |
| Database | PostgreSQL (`psycopg` driver) |
| Migrations | Alembic (auto-runs on startup) |
| Validation | Pydantic v2 |
| Auth | JWT (admin/company) · access tokens (students) |
| Password Hashing | PBKDF2-HMAC-SHA256 |
| Email | SMTP with per-company customisable templates |
| File Uploads | `python-multipart` (company logos) |
| Package Manager | [uv](https://docs.astral.sh/uv/) |

---

## Project Structure

```
backend/
│
├── app/                          ← Main application package
│   │
│   ├── main.py                   ← FastAPI app entry point
│   │                               Registers routers, CORS, static files
│   │                               Runs Alembic migrations + seeds on startup
│   │
│   ├── auth/
│   │   ├── __init__.py           ← Role dependency functions
│   │   │                           get_admin_user()
│   │   │                           get_company_user()
│   │   │                           get_company_or_admin_user()
│   │   └── security.py           ← JWT create/verify
│   │                               PBKDF2 password hash/verify
│   │
│   ├── database/
│   │   ├── config.py             ← Pydantic Settings — reads .env
│   │   ├── connection.py         ← SQLAlchemy engine, Base, get_db()
│   │   └── __init__.py           ← seed_initial_data()
│   │                               Populates colleges + student groups
│   │
│   ├── models/                   ← SQLAlchemy ORM table definitions
│   │   ├── admin.py              ← admins table
│   │   ├── company.py            ← companies table (logo_url, status, email templates)
│   │   ├── drive.py              ← drives table (window scheduling, approval)
│   │   ├── drive_target.py       ← drive_targets table (college/group targeting)
│   │   ├── question.py           ← questions table (MCQ options + answer)
│   │   ├── student.py            ← students table (access token, anti-cheat, score)
│   │   ├── student_response.py   ← student_responses table
│   │   ├── student_group.py      ← student_groups reference table
│   │   ├── college.py            ← colleges reference table
│   │   ├── ticket.py             ← tickets table (category, priority, status)
│   │   └── __init__.py           ← Imports + exports all models
│   │
│   ├── routes/                   ← API route handlers (one file per domain)
│   │   ├── auth.py               ← POST /api/auth/company/register (multipart + logo)
│   │   │                           POST /api/auth/company/login
│   │   │                           POST /api/auth/admin/login
│   │   ├── admin.py              ← Company approval/rejection
│   │   │                           Drive approval
│   │   │                           Ticket management
│   │   ├── company.py            ← Drive CRUD
│   │   │                           Question upload (manual + CSV)
│   │   │                           Student roster upload (CSV)
│   │   │                           Email template + send
│   │   ├── student.py            ← Token login, exam delivery, answer submission
│   │   └── ticket.py             ← Company: raise/view tickets
│   │                               Admin: view/filter/resolve tickets
│   │
│   ├── schemas/                  ← Pydantic request & response models
│   │   ├── auth.py
│   │   ├── company.py
│   │   ├── drive.py
│   │   ├── question.py
│   │   ├── student.py
│   │   ├── email.py
│   │   └── ticket.py
│   │
│   └── utils/
│       └── email_processor.py    ← Jinja-style template renderer + SMTP sender
│
├── alembic/                      ← Database migration scripts
│   ├── env.py                    ← Loads .env, imports all models for autogenerate
│   ├── script.py.mako            ← Migration file template
│   └── versions/
│       └── 9b40e3979345_initial_schema.py  ← First migration (tickets table)
│
├── static/
│   └── logos/                    ← Uploaded company logo files (PNG/JPEG)
│                                   Served at GET /static/logos/<filename>
│
├── alembic.ini                   ← Alembic config (URL set dynamically from .env)
├── pyproject.toml                ← uv project manifest + pinned dependencies
├── requirements.txt              ← Legacy pip reference (same packages)
├── .env                          ← Local secrets (git-ignored)
└── .env.example                  ← Environment variable template
```

---

## Setup

### Prerequisites

- Python **3.12+**
- PostgreSQL running locally (or remote)
- [uv](https://docs.astral.sh/uv/) installed — `pip install uv`

---

### Step 1 — Clone & enter the backend

```powershell
git clone https://github.com/Kaustubh2904/Company-Exam-Portal.git
cd Company-Exam-Portal\backend
```

### Step 2 — Install dependencies

```powershell
uv sync
```

> This creates a `.venv` automatically and installs everything from `pyproject.toml`.

### Step 3 — Configure environment

```powershell
copy .env.example .env
```

Open `.env` and fill in your values:

```env
# Database
DATABASE_URL=postgresql+psycopg://postgres:your_password@localhost:5432/company_exam_portal

# Security — generate with: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Default admin credentials (created on first startup)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# SMTP (needed for email invitations)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM_NAME=Company Recruitment Team

# CORS — leave blank for development (allows all)
ALLOWED_ORIGINS=
```

### Step 4 — Create the PostgreSQL database

```powershell
# In psql or your DB client
CREATE DATABASE company_exam_portal;
```

### Step 5 — Start the server

```powershell
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

On first startup the server will automatically:
1. ✅ Run all Alembic migrations (`alembic upgrade head`)
2. ✅ Seed colleges and student groups into the DB

API docs → **http://localhost:8000/docs**
ReDoc → **http://localhost:8000/redoc**
Health check → **http://localhost:8000/health**

---

## Database Migrations

| Command | Description |
|---------|-------------|
| `uv run alembic upgrade head` | Apply all pending migrations |
| `uv run alembic revision --autogenerate -m "my_change"` | Generate migration from model changes |
| `uv run alembic downgrade -1` | Roll back one migration |
| `uv run alembic current` | Show current DB revision |
| `uv run alembic history` | Show full migration history |

> ⚠️ Always generate a migration after changing any `models/*.py` file. Never use `create_all()` directly.

---

## API Endpoints

### Authentication
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/company/register` | — | Register company with logo (`multipart/form-data`) |
| `POST` | `/api/auth/company/login` | — | Company login → JWT |
| `POST` | `/api/auth/admin/login` | — | Admin login → JWT |

### Admin
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/companies` | Admin | List companies (filter: `pending/approved/rejected/suspended/all`) |
| `PUT` | `/api/admin/companies/{id}/approve` | Admin | Approve company registration |
| `PUT` | `/api/admin/companies/{id}/reject` | Admin | Reject + auto-delete logo from disk |
| `GET` | `/api/admin/tickets` | Admin | List all tickets (`?status_filter=&category_filter=&priority_filter=`) |
| `GET` | `/api/admin/tickets/{id}` | Admin | Get ticket detail with company info |
| `PUT` | `/api/admin/tickets/{id}/status` | Admin | Update status + add resolution notes |

### Company
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/company/drives` | Company | List own drives |
| `POST` | `/api/company/drives` | Company | Create a drive |
| `PUT` | `/api/company/drives/{id}` | Company | Update drive |
| `POST` | `/api/company/drives/{id}/questions/csv-upload` | Company | Bulk upload questions from CSV |
| `POST` | `/api/company/drives/{id}/students/csv-upload` | Company | Bulk upload students from CSV |
| `POST` | `/api/company/tickets/raise` | Company | Raise a support ticket |
| `GET` | `/api/company/tickets/my-tickets` | Company | List own tickets |
| `GET` | `/api/company/tickets/my-tickets/{id}` | Company | Get specific ticket |

### Student
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/student/login` | — | Login with access token |
| `GET` | `/api/student/exam` | Student | Get exam questions |
| `POST` | `/api/student/submit` | Student | Submit answers |

### Static & Utility
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/static/logos/{filename}` | — | Serve company logo file |
| `GET` | `/health` | — | DB connectivity health check |

---

## Ticket System

Companies raise tickets to admin. Flow:

```
open  →  in_progress  →  resolved  →  closed
```

| Field | Valid Values |
|-------|-------------|
| `category` | `billing` · `drive` · `technical` · `general` |
| `priority` | `low` · `medium` · `high` · `urgent` |
| `status` | `open` · `in_progress` · `resolved` · `closed` |

Resolution notes are **required** when setting status to `resolved` or `closed`.

---

## Company Logo Upload

- Uploaded at **registration** as `multipart/form-data` field `logo`
- Accepted types: `image/png`, `image/jpeg` — max **2 MB**
- Stored at `static/logos/<company_id>_<uuid>.png`
- Accessible at `GET /static/logos/<filename>`
- **Auto-deleted from disk** when admin rejects the company

