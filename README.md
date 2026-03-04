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
| Cache / Session | Redis 7 (questions + student sessions) |
| Rate Limiting | Redis fixed-window counter (per token for students · per IP for admin/company) |
| Email | SMTP with per-company customisable templates |
| File Uploads | `python-multipart` (company logos) |
| Containerisation | Docker + Docker Compose |
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
│   │                               GET /health — DB + Redis status
│   │
│   ├── auth/
│   │   ├── __init__.py           ← Role dependency functions
│   │   │                           get_admin_user()
│   │   │                           get_company_user()
│   │   │                           get_company_or_admin_user()
│   │   └── security.py           ← JWT create/verify
│   │                               PBKDF2 password hash/verify (hmac.compare_digest)
│   │
│   ├── database/
│   │   ├── config.py             ← Pydantic Settings — reads .env
│   │   │                           DATABASE_URL, SECRET_KEY, REDIS_URL,
│   │   │                           ALLOWED_ORIGINS, FRONTEND_URL, SMTP_*
│   │   ├── connection.py         ← SQLAlchemy engine (pool_size=20, max_overflow=40)
│   │   │                           Base, get_db()
│   │   └── __init__.py           ← seed_initial_data()
│   │                               Populates colleges + student groups
│   │
│   ├── models/                   ← SQLAlchemy ORM table definitions
│   │   ├── admin.py              ← admins
│   │   ├── company.py            ← companies (logo_url, status, email templates)
│   │   ├── drive.py              ← drives (window scheduling, approval)
│   │   ├── drive_target.py       ← drive_targets (college/group targeting)
│   │   ├── question.py           ← questions (MCQ options + answer, index on drive_id)
│   │   ├── student.py            ← students (access token, anti-cheat, score)
│   │   ├── student_response.py   ← student_responses (indexes on student_id, drive_id)
│   │   ├── student_group.py      ← student_groups reference table
│   │   ├── college.py            ← colleges reference table
│   │   ├── ticket.py             ← tickets (category, priority, status)
│   │   └── __init__.py           ← Imports + exports all models
│   │
│   ├── routes/                   ← API route handlers (one file per domain)
│   │   ├── auth.py               ← POST /api/auth/company/register (multipart + logo)
│   │   │                           POST /api/auth/company/login
│   │   │                           POST /api/auth/admin/login
│   │   ├── admin.py              ← Company + drive management
│   │   │                           College + student group management
│   │   │                           Drive exam status + results export
│   │   ├── company.py            ← Drive CRUD + submit + duplicate
│   │   │                           Question upload (manual + CSV)
│   │   │                           Student roster upload (CSV)
│   │   │                           Drive start/end
│   │   │                           Email template CRUD + preview + send
│   │   ├── student.py            ← Token login (rate-limited)
│   │   │                           Exam start, questions (cached), submit (rate-limited)
│   │   │                           Violation recording + auto-disqualification
│   │   └── ticket.py             ← Company: raise/view tickets
│   │                               Admin: view/filter/resolve tickets
│   │
│   ├── schemas/                  ← Pydantic request & response models
│   │   ├── auth.py
│   │   ├── company.py
│   │   ├── drive.py              ← DriveStatusUpdate restricted to draft/submitted
│   │   ├── question.py
│   │   ├── student.py            ← ExamQuestion.points (not marks)
│   │   ├── email.py
│   │   └── ticket.py             ← @field_validator for category + priority
│   │
│   └── utils/
│       ├── drive_utils.py        ← get_drive_status() + format_drive_response()
│       │                           Shared helpers (breaks circular import)
│       ├── email_processor.py    ← Jinja-style template renderer + SMTP sender
│       └── redis_client.py       ← Redis singleton with graceful degradation
│                                   Question cache (1 h TTL)
│                                   Student session cache (2 h TTL)
│                                   Rate-limit counter (60 s fixed window)
│
├── alembic/                      ← Database migration scripts
│   ├── env.py                    ← Loads .env, imports all models for autogenerate
│   ├── script.py.mako
│   └── versions/
│       ├── 9b40e3979345_initial_schema.py
│       ├── 5ed1a9dc0b5a_add_violation_thresholds_to_drives.py
│       └── 2fc001c425a8_add_indexes_question_drive_id_.py
│
├── static/
│   └── logos/                    ← Uploaded company logos (PNG/JPEG)
│                                   Served at GET /static/logos/<filename>
│
├── alembic.ini                   ← Alembic config (URL set dynamically from .env)
├── Dockerfile                    ← Two-stage build (builder + slim runtime)
├── .dockerignore
├── pyproject.toml                ← uv project manifest + pinned dependencies
├── requirements.txt              ← pip-compatible package list (used by Dockerfile)
├── .env                          ← Local secrets (git-ignored)
├── .env.production               ← Production secrets template (git-ignored)
└── .env.example                  ← Environment variable template
```

---

## Setup

### Option A — Docker Compose (recommended)

The fastest way to run the full stack (PostgreSQL + Redis + API) with a single command.

**Prerequisites:** Docker Desktop (or Docker Engine + Compose plugin)

```bash
# 1. Clone the repo
git clone https://github.com/Kaustubh2904/Company-Exam-Portal.git
cd Company-Exam-Portal

# 2. Create production env file and fill in real values
cp backend/.env.production backend/.env.production   # already exists — just edit it

# 3. Build and start all services
docker compose up -d --build

# 4. Verify everything is healthy
curl http://localhost:8000/health
```

API docs → **http://localhost:8000/docs**

To stop: `docker compose down`  
To wipe volumes too: `docker compose down -v`

---

### Option B — Local development (uv)

#### Prerequisites

- Python **3.12+**
- PostgreSQL running locally
- Redis running locally (`redis-server` or Docker: `docker run -d -p 6379:6379 redis:7-alpine`)
- [uv](https://docs.astral.sh/uv/) — `pip install uv`

---

#### Step 1 — Clone & enter the backend

```powershell
git clone https://github.com/Kaustubh2904/Company-Exam-Portal.git
cd Company-Exam-Portal\backend
```

#### Step 2 — Install dependencies

```powershell
uv sync
```

> Creates a `.venv` automatically and installs everything from `pyproject.toml`.

#### Step 3 — Configure environment

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

# Admin credentials (created on first startup)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# Redis (caching + rate limiting)
REDIS_URL=redis://localhost:6379/0

# SMTP (needed for email invitations)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM_NAME=Company Recruitment Team

# CORS — comma-separated list of allowed frontend origins
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:5173,http://localhost:5174

# Frontend URL used in student invitation emails
FRONTEND_URL=http://localhost:5174

# Runtime
ENVIRONMENT=development
DEBUG=true
```

#### Step 4 — Create the PostgreSQL database

```sql
CREATE DATABASE company_exam_portal;
```

#### Step 5 — Start the server

```powershell
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

On first startup the server will automatically:
1. ✅ Run all Alembic migrations (`alembic upgrade head`)
2. ✅ Seed colleges and student groups into the DB

> **Note:** Redis is optional for local development. If Redis is unreachable the app starts normally — caching and rate limiting are simply disabled.

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

### Admin — Companies
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/companies` | Admin | List companies (`?status_filter=pending\|approved\|rejected\|suspended\|all`) |
| `PUT` | `/api/admin/companies/{id}/approve` | Admin | Approve company registration |
| `PUT` | `/api/admin/companies/{id}/reject` | Admin | Reject + auto-delete logo from disk |
| `DELETE` | `/api/admin/companies/{id}` | Admin | Hard delete company |

### Admin — Drives
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/drives` | Admin | List all drives across companies |
| `PUT` | `/api/admin/drives/{id}/approve` | Admin | Approve drive submission |
| `PUT` | `/api/admin/drives/{id}/suspend` | Admin | Suspend a live drive |
| `PUT` | `/api/admin/drives/{id}/reactivate` | Admin | Reactivate a suspended drive |
| `GET` | `/api/admin/drives/{id}/detail` | Admin | Full drive detail with questions + students |
| `GET` | `/api/admin/drives/{id}/exam-status` | Admin | Live exam progress snapshot |

### Admin — Colleges & Student Groups
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/colleges` | Admin | List all colleges |
| `GET` | `/api/admin/colleges/pending` | Admin | List pending custom college requests |
| `PUT` | `/api/admin/colleges/approve-custom` | Admin | Approve a custom college name |
| `PUT` | `/api/admin/colleges/{id}/approve` | Admin | Approve college |
| `POST` | `/api/admin/colleges` | Admin | Create college |
| `PUT` | `/api/admin/colleges/{id}` | Admin | Update college |
| `DELETE` | `/api/admin/colleges/{id}` | Admin | Delete college |
| `GET` | `/api/admin/student-groups` | Admin | List all student groups |
| `GET` | `/api/admin/student-groups/pending` | Admin | List pending custom group requests |
| `PUT` | `/api/admin/student-groups/approve-custom` | Admin | Approve a custom group name |
| `PUT` | `/api/admin/student-groups/{id}/approve` | Admin | Approve student group |
| `POST` | `/api/admin/student-groups` | Admin | Create student group |
| `PUT` | `/api/admin/student-groups/{id}` | Admin | Update student group |
| `DELETE` | `/api/admin/student-groups/{id}` | Admin | Delete student group |

### Admin — Tickets
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/tickets` | Admin | List all tickets (`?status_filter=&category_filter=&priority_filter=`) |
| `GET` | `/api/admin/tickets/{id}` | Admin | Get ticket detail with company info |
| `PUT` | `/api/admin/tickets/{id}/status` | Admin | Update status + add resolution notes |

### Company — Drives
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/company/drives` | Company | List own drives |
| `POST` | `/api/company/drives` | Company | Create a drive |
| `GET` | `/api/company/drives/{id}` | Company | Get drive detail |
| `PUT` | `/api/company/drives/{id}` | Company | Update drive |
| `DELETE` | `/api/company/drives/{id}` | Company | Delete drive |
| `PUT` | `/api/company/drives/{id}/submit` | Company | Submit drive for admin approval |
| `PUT` | `/api/company/drives/{id}/status` | Company | Set drive status (`draft` or `submitted` only) |
| `POST` | `/api/company/drives/{id}/duplicate` | Company | Duplicate drive (copies targets, questions, pre-exam students) |
| `POST` | `/api/company/drives/{id}/start` | Company | Manually start exam window |
| `POST` | `/api/company/drives/{id}/end` | Company | Manually end exam window |
| `GET` | `/api/company/drives/{id}/questions` | Company | List drive questions |
| `GET` | `/api/company/drives/{id}/students` | Company | List drive students |
| `POST` | `/api/company/drives/{id}/upload-questions` | Company | Bulk upload questions from CSV |
| `POST` | `/api/company/drives/{id}/upload-students` | Company | Bulk upload students from CSV |

### Company — Email
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/company/email-template` | Company | Get current email template |
| `PUT` | `/api/company/email-template` | Company | Update email template |
| `POST` | `/api/company/email-template/preview` | Company | Preview rendered email |
| `POST` | `/api/company/drives/{id}/email-students` | Company | Send invitations to drive students |
| `GET` | `/api/company/drives/{id}/email-status` | Company | Email send status per student |

### Company — Reference Data & Tickets
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/company/colleges` | Company | List approved colleges |
| `GET` | `/api/company/student-groups` | Company | List approved student groups |
| `POST` | `/api/company/tickets/raise` | Company | Raise a support ticket |
| `GET` | `/api/company/tickets/my-tickets` | Company | List own tickets |
| `GET` | `/api/company/tickets/my-tickets/{id}` | Company | Get specific ticket |

### Student
| Method | Path | Auth | Rate limit | Description |
|--------|------|------|------------|-------------|
| `POST` | `/api/student/auth/login` | — | 5 per token / 5 min | Login with email + access token |
| `GET` | `/api/student/auth/validate` | Student token | — | Validate token |
| `GET` | `/api/student/drive-info` | Student token | — | Drive window + status info |
| `POST` | `/api/student/exam/start` | Student token | — | Start exam, generate question order |
| `GET` | `/api/student/exam/questions` | Student token | — | Fetch questions (Redis-cached) |
| `POST` | `/api/student/exam/violation` | Student token | — | Record anti-cheat violation |
| `POST` | `/api/student/exam/submit` | Student token | 3 per token / hour | Submit answers |
| `GET` | `/api/student/exam/result` | Student token | — | Get scored result |

### Utility
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/static/logos/{filename}` | — | Serve company logo |
| `GET` | `/health` | — | DB + Redis connectivity status |

---

## Drive Lifecycle

```
draft  →  submitted  →  approved  →  live  →  completed
                  ↓                     ↑
               rejected             suspended
```

| Status | Who sets it |
|--------|-------------|
| `draft` | Company (default on creation) |
| `submitted` | Company (requests admin review) |
| `approved` | Admin |
| `rejected` | Admin |
| `live` | Computed — `actual_window_start` set and not yet ended |
| `completed` | Computed — `actual_window_end` passed |
| `suspended` | Admin (mid-exam intervention) |

> Drive status is computed on-the-fly by `get_drive_status()` — the DB stores `draft/submitted/rejected/suspended` only. `live` and `completed` are never written to the DB.

---

## Exam Flow

```
Company: start drive  →  Student: login  →  POST /exam/start
  →  GET /exam/questions (cached)  →  POST /exam/violation (×N)
  →  POST /exam/submit  →  GET /exam/result
```

Key invariants:
- A student can only start the exam after the company manually calls `POST /drives/{id}/start`
- Each student gets an **individual** exam start time and deadline (`started_at + exam_duration_minutes`)
- Questions are **randomised per student** and stored in `student.question_order`
- `correct_answer` is stored as full option text; the student submits a letter (`A/B/C/D`) which is mapped to the text before comparison
- **Server-side timer** is checked on submit — late submissions are accepted but the deadline was already enforced client-side
- Violations auto-disqualify at per-type thresholds (`tab_switch: 3`, `fullscreen_exit: 3`, `screenshot: 1`, etc.)

---

## Redis Caching

| Key pattern | TTL | Content |
|-------------|-----|---------|
| `questions:drive:<id>` | 1 hour | All drive questions (including `correct_answer` for scoring) |
| `session:token:<token>` | 2 hours | Student session metadata |
| `ratelimit:student_login:<token>` | 5 min | Student login attempt counter (per token) |
| `ratelimit:exam_submit:<token>` | 1 hour | Exam submit attempt counter (per token) |
| `ratelimit:admin_login:<ip>` | 60 s | Admin login attempt counter (per IP) |
| `ratelimit:company_login:<ip>` | 60 s | Company login attempt counter (per IP) |

Student rate limits are **keyed by access token**, not IP — so 500 students on the same college WiFi each get their own independent counter.  
Admin/company limits are **keyed by IP** — correct for password credential brute-force protection.

Redis is **optional** — the app degrades gracefully if Redis is unreachable (cache miss path always hits the DB, rate limiting is disabled).

---

## Ticket System

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

