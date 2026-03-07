# Company Exam Portal — Backend

FastAPI backend for a recruitment exam platform. Companies register, create exam drives, upload student rosters, send SMTP invitations, and raise support tickets — all with admin oversight and JWT-based auth.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Setup](#setup)
   - [Option A — Docker Compose](#option-a--docker-compose-recommended)
   - [Option B — Local Development (uv)](#option-b--local-development-uv)
4. [Environment Variables](#environment-variables)
5. [Database Migrations](#database-migrations)
6. [Complete Project Flow](#complete-project-flow)
   - [Actor Overview](#actor-overview)
   - [Phase 1 — Admin Bootstrap](#phase-1--admin-bootstrap)
   - [Phase 2 — Company Onboarding](#phase-2--company-onboarding)
   - [Phase 3 — Drive Creation](#phase-3--drive-creation)
   - [Phase 4 — Exam Execution](#phase-4--exam-execution)
   - [Phase 5 — Results & Post-Exam](#phase-5--results--post-exam)
   - [Phase 6 — Support Tickets](#phase-6--support-tickets)
7. [Drive Lifecycle](#drive-lifecycle)
8. [Exam Flow (Student)](#exam-flow-student)
9. [Plan System](#plan-system)
10. [Redis Caching & Rate Limiting](#redis-caching--rate-limiting)
11. [Email Template System](#email-template-system)
12. [Anti-Cheat System](#anti-cheat-system)
13. [API Reference](#api-reference)
14. [Postman Collection](#postman-collection)

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
| Email | SMTP with per-company customisable Jinja-style templates |
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
│   │                               GET /        — API info
│   │                               GET /health  — DB + Redis live status
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
│   │                               Populates 24 colleges + 20 student groups on first run
│   │
│   ├── models/                   ← SQLAlchemy ORM table definitions
│   │   ├── admin.py              ← admins
│   │   ├── company.py            ← companies (logo_url, status, plan, email templates)
│   │   ├── drive.py              ← drives (window scheduling, approval, actual window)
│   │   ├── drive_target.py       ← drive_targets (college/group/batch targeting)
│   │   ├── question.py           ← questions (MCQ options + answer, index on drive_id)
│   │   ├── student.py            ← students (access token, anti-cheat flags, score)
│   │   ├── student_response.py   ← student_responses (indexes on student_id, drive_id)
│   │   ├── student_group.py      ← student_groups reference table
│   │   ├── college.py            ← colleges reference table
│   │   ├── ticket.py             ← tickets (category, priority, status, resolution)
│   │   ├── notification.py       ← notifications (plan changes, admin messages)
│   │   └── __init__.py           ← Imports + exports all models
│   │
│   ├── routes/                   ← API route handlers (one file per domain)
│   │   ├── auth.py               ← POST /api/auth/company/register (multipart + logo)
│   │   │                           POST /api/auth/company/login
│   │   │                           POST /api/auth/admin/login
│   │   ├── admin.py              ← Company management (suspend/unsuspend/set-plan/notify/delete)
│   │   │                           Drive management (list/detail/suspend/reactivate/exam-status)
│   │   │                           College + student group CRUD + pending approvals
│   │   │                           Notification log
│   │   ├── company.py            ← Drive CRUD + publish + duplicate + start/end
│   │   │                           Question upload (CSV)
│   │   │                           Student roster upload (CSV)
│   │   │                           Email template CRUD + preview + send
│   │   │                           Results + CSV export (summary + detailed)
│   │   │                           Profile + notifications
│   │   ├── student.py            ← Token login (rate-limited)
│   │   │                           Drive info + token validation
│   │   │                           Exam start, questions (Redis-cached), submit (rate-limited)
│   │   │                           Violation recording + auto-disqualification
│   │   │                           Result retrieval
│   │   └── ticket.py             ← Company: raise/view tickets
│   │                               Admin: view/filter/resolve tickets
│   │
│   ├── schemas/                  ← Pydantic request & response models
│   │   ├── auth.py               ← AdminLogin, CompanyLogin, Token
│   │   ├── company.py            ← CompanyResponse, PLAN_LIMITS, NotificationResponse
│   │   ├── drive.py              ← DriveCreate, DriveUpdate, DriveResponse, DriveTargetCreate
│   │   ├── question.py           ← QuestionResponse
│   │   ├── student.py            ← StudentLoginRequest, ExamDataResponse, ExamSubmissionRequest
│   │   ├── email.py              ← EmailTemplateUpdate, EmailTemplatePreview, EmailSendResponse
│   │   └── ticket.py             ← TicketCreate, TicketStatusUpdate, AdminTicketResponse
│   │
│   └── utils/
│       ├── drive_utils.py        ← get_drive_status() + format_drive_response()
│       │                           Computes live/ended from actual_window_start/end
│       ├── email_processor.py    ← Jinja-style template renderer + variable validator
│       └── redis_client.py       ← Redis singleton with graceful degradation
│                                   Question cache · Student session cache · Rate-limit counters
│
├── alembic/                      ← Database migration scripts
│   ├── env.py                    ← Loads .env, imports all models for autogenerate
│   ├── script.py.mako
│   └── versions/
│       ├── 9b40e3979345_initial_schema.py
│       ├── 5ed1a9dc0b5a_add_violation_thresholds_to_drives.py
│       ├── 2fc001c425a8_add_indexes_question_drive_id_.py
│       ├── a3f2b1c0d9e8_remove_violation_details_total_violations.py
│       └── b1c2d3e4f5a6_plan_system_and_notifications.py
│
├── static/
│   └── logos/                    ← Uploaded company logos (PNG/JPEG ≤ 2 MB)
│                                   Served at GET /static/logos/<filename>
│
├── alembic.ini                   ← Alembic config (URL set dynamically from .env)
├── Dockerfile                    ← Two-stage build (builder + slim runtime)
├── .dockerignore
├── pyproject.toml                ← uv project manifest + pinned dependencies
├── requirements.txt              ← pip-compatible package list (used by Dockerfile)
├── .env                          ← Local secrets (git-ignored)
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

# 2. Copy and configure the environment file
cp backend/.env.example backend/.env

# 3. Build and start all services (Postgres + Redis + API)
docker compose up -d --build

# 4. Verify everything is healthy
curl http://localhost:8000/health
```

| URL | Purpose |
|-----|---------|
| `http://localhost:8000/docs` | Swagger UI (interactive API docs) |
| `http://localhost:8000/redoc` | ReDoc (readable API docs) |
| `http://localhost:8000/health` | Health check — DB + Redis status |

To stop: `docker compose down`  
To wipe all data too: `docker compose down -v`

---

### Option B — Local Development (uv)

#### Prerequisites

- Python **3.12+**
- PostgreSQL running locally
- Redis running locally (`redis-server` or `docker run -d -p 6379:6379 redis:7-alpine`)
- [uv](https://docs.astral.sh/uv/) → `pip install uv`

#### Step 1 — Clone & enter the backend

```powershell
git clone https://github.com/Kaustubh2904/Company-Exam-Portal.git
cd Company-Exam-Portal\backend
```

#### Step 2 — Install dependencies

```powershell
uv sync
```

> Creates `.venv` automatically and installs everything from `pyproject.toml`.

#### Step 3 — Configure environment

```powershell
copy .env.example .env
# Open .env and fill in your values (see Environment Variables below)
```

#### Step 4 — Create the PostgreSQL database

```sql
CREATE DATABASE company_exam_portal;
```

#### Step 5 — Start the server

```powershell
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

On **first startup** the server automatically:
1. ✅ Runs all Alembic migrations (`alembic upgrade head`)
2. ✅ Seeds 24 colleges and 20 student groups into the DB (only if the table is empty)

> The **admin account** is created lazily — it is inserted on the first successful `POST /api/auth/admin/login` request using `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env`.

> **Note:** Redis is optional. If unreachable, the app starts normally — caching and rate limiting are gracefully disabled.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
# ── Database ────────────────────────────────────────────────────
DATABASE_URL=postgresql+psycopg://postgres:your_password@localhost:5432/company_exam_portal

# ── Security ────────────────────────────────────────────────────
# Generate with: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# ── Admin account (created automatically on first startup) ──────
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# ── Redis (caching + rate limiting — optional) ──────────────────
REDIS_URL=redis://localhost:6379/0

# ── SMTP (required for student email invitations) ───────────────
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password          # Gmail: use App Password
SMTP_FROM_NAME=Company Recruitment Team

# ── CORS ────────────────────────────────────────────────────────
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:5173

# ── Frontend URL (used in student invitation emails) ────────────
FRONTEND_URL=http://localhost:5174

# ── Runtime ─────────────────────────────────────────────────────
ENVIRONMENT=development
DEBUG=true
```

---

## Database Migrations

| Command | Description |
|---------|-------------|
| `uv run alembic upgrade head` | Apply all pending migrations |
| `uv run alembic revision --autogenerate -m "describe_change"` | Generate migration from model changes |
| `uv run alembic downgrade -1` | Roll back one migration |
| `uv run alembic current` | Show current DB revision |
| `uv run alembic history` | Show full migration history |

> ⚠️ Always generate a migration after modifying any `models/*.py` file. Never use `Base.metadata.create_all()` directly in production.

---

## Complete Project Flow

### Actor Overview

```
┌─────────┐         ┌─────────┐         ┌─────────┐
│  Admin  │         │ Company │         │ Student │
└────┬────┘         └────┬────┘         └────┬────┘
     │                   │                   │
     │  Manages           │  Creates drives   │  Takes
     │  platform          │  uploads content  │  the exam
     │  access,           │  sends emails     │  views result
     │  plans &           │  views results    │
     │  colleges          │
```

---

### Phase 1 — Admin Bootstrap

The admin account is **not** pre-seeded. It is created **lazily on the first login attempt** in `routes/auth.py`: if the supplied credentials match `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env` and no admin row exists yet, one is created automatically.

```
Server starts
    └─→ seed_initial_data()
            ├─→ Seeds 24 pre-approved Colleges  (only if College table is empty)
            └─→ Seeds 20 pre-approved Student Groups

First POST /api/auth/admin/login { "username": "admin", "password": "..." }
    └─→ No admin row found?
            └─→ Credentials match ADMIN_USERNAME / ADMIN_PASSWORD?
                    └─→ Create Admin row + return JWT
```

Admin logs in via `POST /api/auth/admin/login` and receives a **JWT** used for all admin operations.

---

### Phase 2 — Company Onboarding

#### 2a. Company Self-Registration

Companies register themselves — **no admin approval step is required**. They are auto-approved on registration with the **free plan** (2 drives).

```
POST /api/auth/company/register   (multipart/form-data)
    Fields: company_name, username, email, password, logo (PNG/JPEG ≤ 2 MB)
    └─→ Logo saved to  static/logos/reg_<username>_<uuid>.<ext>
    └─→ Company created with:
            status       = "approved"
            is_approved  = true
            plan         = "free"
            drives_limit = 2
            drives_used  = 0
```

#### 2b. Company Login

```
POST /api/auth/company/login   { "username": "...", "password": "..." }
    └─→ Returns { "access_token": "...", "token_type": "bearer" }
```

All company API calls include: `Authorization: Bearer <token>`

#### 2c. Admin Plan Management

Admin can upgrade a company's plan at any time to increase how many drives they can run:

| Plan | Drives Allowed | Expiry |
|------|----------------|--------|
| `free` | 2 | Never |
| `basic` | 5 | 30 days |
| `pro` | 15 | 30 days |
| `premium` | 50 | 30 days |
| `custom` | Admin-specified | 30 days |

```
PUT /api/admin/companies/{id}/set-plan   { "plan": "pro" }
    └─→ Updates drives_limit and plan_expires_at
    └─→ Automatically sends in-app notification to the company
```

When a paid plan expires, the effective limit falls back to the free-tier limit (2 drives). The `drives_used` counter is never reset.

#### 2d. Admin Company Controls

```
PUT /api/admin/companies/{id}/suspend      ← disables login, freezes all drives
PUT /api/admin/companies/{id}/unsuspend    ← re-enables the account
POST /api/admin/companies/{id}/notify      ← sends in-app message to the company
DELETE /api/admin/companies/{id}           ← hard delete (blocked if company has ANY drives — delete the drives first)
```

---

### Phase 3 — Drive Creation

A **drive** is one recruitment exam event. It goes through preparation stages before students can take it.

#### 3a. Create Drive (Draft)

```
POST /api/company/drives
{
  "title": "SDE Hiring Drive 2026",
  "category": "Technical MCQ",
  "window_start": "2026-04-01T09:00:00Z",   ← when students can begin logging in
  "window_end":   "2026-04-01T12:00:00Z",   ← login window closes
  "exam_duration_minutes": 60,               ← each student's personal timer
  "targets": [
    { "college_id": 1, "student_group_id": 1, "batch_year": "2026" }
  ]
}
    └─→ Drive created with status = "draft"
```

**Targeting:**
- Use `college_id` / `student_group_id` for entries from the seeded master list
- Use `custom_college_name` / `custom_student_group_name` for new names (queued for admin approval)
- Multiple targets can be combined to reach students across colleges, groups, and batches

#### 3b. Upload Questions via CSV

```
POST /api/company/drives/{id}/upload-questions   (form-data, field: file)

CSV columns: question, option_a, option_b, option_c, option_d, correct_answer, points
```

- `correct_answer` must **exactly match** one of the four option texts
- `points` defaults to `1` if omitted
- Returns a summary of rows added vs. errors (first 10 errors shown)

#### 3c. Upload Students via CSV

```
POST /api/company/drives/{id}/upload-students   (form-data, field: file)

CSV columns: name, email, roll_number, phone*, college*, student_group*   (* optional)
```

- Each student receives a **unique UUID access token** auto-generated on creation
- This token is sent to students via email and used for exam-day login
- Duplicate emails within the same drive are rejected

#### 3d. Publish Drive

Once questions and students are uploaded, publish the drive: `draft` → `upcoming`

```
PUT /api/company/drives/{id}/publish
    └─→ Validates: ≥1 question AND ≥1 student exist
    └─→ Sets status = "upcoming"
```

#### 3e. Send Email Invitations

After publishing, send login credentials to all students via SMTP:

```
POST /api/company/drives/{id}/email-students
    └─→ Renders per-student email using the company's custom template
    └─→ Sends via SMTP (subject + body with {{variable}} substitution)
    └─→ Returns { sent_count, failed_count, failed_emails[] }
```

Each student's email contains their unique `email` and `access_token` for exam day.

#### 3f. Admin Manages Colleges & Groups

If a company used a `custom_college_name` or `custom_student_group_name`, admin reviews and approves them:

```
GET /api/admin/colleges/pending           ← list unapproved custom names
PUT /api/admin/colleges/approve-custom    ← approve and add to master list
```

---

### Phase 4 — Exam Execution

#### 4a. Start Exam Window (Company)

On exam day, the company manually opens the window:

```
POST /api/company/drives/{id}/start
    └─→ Plan check: drives_used < drives_limit (or plan not expired)
    └─→ Sets actual_window_start = now
    └─→ Sets actual_window_end   = now + window_duration_minutes
    └─→ Increments company.drives_used  ← consumes one drive credit
    └─→ Sets drive.status = "live"
    └─→ Returns full drive object with updated times
```

> Each `start` call consumes one drive credit from the company's plan allocation.

#### 4b. Student Login

Students use the credentials from their invitation email:

```
POST /api/student/auth/login   { "email": "...", "access_token": "..." }
    └─→ Rate limited: 5 attempts per token per 5 minutes
    └─→ Returns { access_token, student_id, drive_id, drive_title, drive_status, ... }
    └─→ Student session cached in Redis (2 h TTL)
```

All subsequent student API calls pass: `?token=<access_token>` as a query parameter

#### 4c. Start Individual Exam (Student)

```
POST /api/student/exam/start
    └─→ Checks: exam window is open (actual_window_start set, actual_window_end in future)
    └─→ Checks: drive is approved and not suspended
    └─→ Shuffles all question IDs → stores randomised order in student.question_order
    └─→ Stamps student.exam_started_at = now
    └─→ Returns { exam_started_at, expected_end, exam_duration_minutes, question_order }
```

#### 4d. Fetch Questions

```
GET /api/student/exam/questions
    └─→ Returns questions in the student's randomised order
    └─→ correct_answer is NEVER included in the response
    └─→ Served from Redis cache (1 h TTL); DB-only on cache miss
    └─→ Includes expected_end (individual student deadline)
```

#### 4e. Anti-Cheat Violations

The frontend detects violations and calls this endpoint when a threshold is crossed:

```
POST /api/student/exam/violation   { "disqualification_reason": "Tab switching ×3" }
    └─→ Sets student.is_disqualified = true
    └─→ Sets student.score = 0, total_marks = sum of all question points
    └─→ Auto-submits: exam_submitted_at = now
    └─→ Invalidates Redis session cache
```

Disqualified students receive a 403 on all subsequent exam endpoints.

#### 4f. Submit Exam

```
POST /api/student/exam/submit
{
  "answers": [
    { "question_id": 1, "selected_option": "A", "marked_for_review": false },
    { "question_id": 2, "selected_option": "C", "marked_for_review": false },
    { "question_id": 3, "selected_option": null, "marked_for_review": true }
  ]
}
    └─→ Rate limited: 3 attempts per token per hour
    └─→ Maps letter (A/B/C/D) → full option text, compares to correct_answer (case-insensitive)
    └─→ Bulk inserts all StudentResponse records in one DB round-trip
    └─→ Stores score + total_marks on the student record
    └─→ Invalidates Redis session
    └─→ Returns { score, total_marks, percentage, submitted_at }
```

#### 4g. End Exam Window (Company)

Company can close the window before `actual_window_end` is reached:

```
POST /api/company/drives/{id}/end
    └─→ Sets actual_window_end = now
    └─→ Sets drive.status = "ended"
    └─→ Auto-submits every student where exam_started_at IS NOT NULL and exam_submitted_at IS NULL
    └─→ Returns { auto_submitted_count, drive }
```

The window also ends automatically when `actual_window_end` passes — `get_drive_status()` detects this and returns `"ended"` without a DB write (the stored `drive.status` remains `"live"` in that case).

#### 4h. Admin Drive Controls (Mid-Exam)

```
GET /api/admin/drives/{id}/exam-status     ← live snapshot: state, time remaining, student count
PUT /api/admin/drives/{id}/suspend         ← halts exam, deletes all responses, notifies company
PUT /api/admin/drives/{id}/reactivate      ← restores drive to "upcoming" after suspension
```

---

### Phase 5 — Results & Post-Exam

#### 5a. Student Views Result

```
GET /api/student/exam/result
    └─→ Returns { score, total_marks, percentage, submitted_at, is_disqualified, disqualification_reason }
```

#### 5b. Company Views Results

```
GET /api/company/drives/{id}/results?min_percentage=50
    └─→ Returns all students with score, percentage, exam status
    └─→ Optional min_percentage filter to shortlist candidates
```

#### 5c. Export Results as CSV

```
GET /api/company/drives/{id}/results/export?format=summary
    Columns: Name, Email, Roll No., College, Group, Score, Total, %, Status, Disqualified

GET /api/company/drives/{id}/results/export?format=detailed
    Columns: all summary columns + Q1, Q2, Q3... (selected letter + ✓/✗ per question)
```

Both formats are streamed as CSV downloads with a `Content-Disposition: attachment` header.

#### 5d. Admin Oversight

```
GET /api/admin/drives/{id}/detail      ← full view: questions + students + company info
GET /api/admin/drives/{id}/exam-status ← live snapshot (works post-exam too)
GET /api/admin/notifications           ← log of all system + admin notifications
```

---

### Phase 6 — Support Tickets

Companies can raise support tickets at any point in the lifecycle:

```
POST /api/company/tickets/raise
{
  "title": "Cannot upload student CSV",
  "description": "Getting a 400 error on every upload attempt...",
  "category": "technical",    ← billing | drive | technical | general
  "priority": "high"          ← low | medium | high | urgent
}
    └─→ Creates ticket with status = "open"
```

Companies manage their own tickets:

```
GET /api/company/tickets/my-tickets          ← list own tickets (newest first)
GET /api/company/tickets/my-tickets/{id}     ← get specific ticket
```

Admin manages all tickets:

```
GET /api/admin/tickets?status_filter=open&priority_filter=high
    └─→ All tickets with company name + email

PUT /api/admin/tickets/{id}/status
    { "status": "resolved", "resolution_notes": "Fixed CSV validation logic." }
    └─→ resolution_notes REQUIRED when status is "resolved" or "closed"
    └─→ Records resolved_by (admin username) and resolved_at timestamp
```

Ticket lifecycle: `open` → `in_progress` → `resolved` → `closed`

---

## Drive Lifecycle

```
                         publish()
  [draft] ─────────────────────────────→ [upcoming]
     ↑                                        │
     │  (update allowed)                      │  start()   ← consumes 1 drive credit
     │                                        ↓
     │                                     [live]
     │                                        │
     │                               end() or time expires
     │                                        ↓
     │                                     [ended]
     │
     │  Admin can intervene at any time:
     │
     │  suspend()  ←──── [live] or [upcoming]
     │      └─→ [suspended]
     │               │
     │               └──→ [upcoming]  ←── reactivate()
```

| Status | Stored in DB | Set by | Description |
|--------|-------------|--------|-------------|
| `draft` | ✅ | Company (creation default) | Not yet published |
| `upcoming` | ✅ | Company (`publish`) | Published, waiting to start |
| `live` | ✅ | Company (`start`) | Written to DB by `start()`; `get_drive_status()` will also return `"live"` whenever `actual_window_start` is set and the window hasn't closed |
| `ended` | ✅ | Company (`end`) or computed | Written to DB by `end()`; if the window expires naturally, `get_drive_status()` returns `"ended"` without a DB write |
| `suspended` | ✅ | Admin | Admin override — exam halted, all student responses cleared |

> **How `get_drive_status()` works (priority order):**
> 1. If `drive.status == "suspended"` → return `"suspended"`
> 2. Else if `actual_window_end` is set and `now >= actual_window_end` → return `"ended"` (catches natural expiry without a DB write)
> 3. Else if `actual_window_start` is set → return `"live"`
> 4. Else return the stored `drive.status` (`"draft"` or `"upcoming"`)

---

## Exam Flow (Student)

```
Company: POST /drives/{id}/start
              │
              ↓
Student:  POST /api/student/auth/login           email + access_token
              │
              ↓
Student:  GET  /api/student/drive-info           check window times (optional)
              │
              ↓
Student:  POST /api/student/exam/start           randomise order, stamp start time
              │
              ↓
Student:  GET  /api/student/exam/questions       all questions, no correct answers
              │
              │   ┌──────────────────────────────────────┐
              │   │  Violation threshold exceeded?        │
              │   │  POST /api/student/exam/violation     │
              │   │  → disqualified + auto-submitted      │
              │   └──────────────────────────────────────┘
              │
              ↓
Student:  POST /api/student/exam/submit          all answers in one payload
              │
              ↓
Student:  GET  /api/student/exam/result          score, percentage, status
```

**Key invariants:**
- Students can only start after the company opens the window (`actual_window_start` set)
- Each student has their **own independent exam timer** (`exam_started_at + exam_duration_minutes`)
- Questions are **shuffled uniquely per student** and stored in `student.question_order`
- `correct_answer` is stored as full option text; the student submits `A/B/C/D` which is mapped to text before comparison
- Late submissions (after individual deadline) are accepted server-side — the client timer enforces the cutoff

---

## Plan System

Plans control how many drives a company can **start** (each `POST /drives/{id}/start` consumes one drive credit).

| Plan | Drive Credits | Expiry |
|------|--------------|--------|
| `free` | 2 | Never expires |
| `basic` | 5 | 30 days from assignment |
| `pro` | 15 | 30 days from assignment |
| `premium` | 50 | 30 days from assignment |
| `custom` | Admin-set integer | 30 days from assignment |

**Expiry behaviour:** When a paid plan expires, the effective limit drops to the free-tier limit (2). The `drives_used` counter is cumulative and never resets.

Admin assigns plans via `PUT /api/admin/companies/{id}/set-plan`. An in-app notification is automatically created for the company on every plan change.

---

## Redis Caching & Rate Limiting

| Key Pattern | TTL | Content |
|-------------|-----|---------|
| `questions:drive:<id>` | 1 hour | All drive questions (including `correct_answer` for scoring) |
| `session:token:<token>` | 2 hours | Student session metadata |
| `ratelimit:student_login:<token>` | 5 min | Login attempt counter — **per token** |
| `ratelimit:exam_submit:<token>` | 1 hour | Submit attempt counter — **per token** |
| `ratelimit:admin_login:<ip>` | 60 s | Admin login attempt counter — **per IP** |
| `ratelimit:company_login:<ip>` | 60 s | Company login attempt counter — **per IP** |

**Why per-token for students?** 500 students on the same college WiFi share a single IP. Keying rate limits by token gives each student their own independent counter — a struggling student cannot accidentally block everyone else.

**Graceful degradation:** If Redis is unreachable, all cache operations are no-ops and rate limiting is disabled. The app continues to function using DB-only paths.

---

## Email Template System

Each company has its own email template stored in the `companies` table. Templates use `{{variable}}` (double-brace) placeholders, rendered by `EmailTemplateProcessor` via a regex replace:

| Variable | Resolved to |
|----------|-------------|
| `{{student_name}}` | Student's full name |
| `{{student_email}}` | Student's login email |
| `{{roll_number}}` | Student's roll number |
| `{{access_token}}` | Student's unique exam access token |
| `{{drive_title}}` | Title of the drive |
| `{{company_name}}` | Company's registered name |
| `{{start_time}}` | Scheduled window start time |
| `{{duration}}` | Exam duration in minutes |
| `{{login_url}}` | Frontend URL for student login |
| `{{password}}` | _(deprecated — use `{{access_token}}`)_ |

**Workflow:**

```
GET  /api/company/email-template           ← view current template + available variables
PUT  /api/company/email-template           ← update subject + body templates
POST /api/company/email-template/preview   ← preview rendered output with sample data
GET  /api/company/drives/{id}/email-status ← confirm drive is ready and SMTP is configured
POST /api/company/drives/{id}/email-students ← send to all students in the drive
```

A default template is pre-populated for every company. Custom templates are toggled via `use_custom_template: true`.

---

## Anti-Cheat System

All anti-cheat detection logic lives in the **frontend**. When a violation threshold is exceeded, the frontend calls:

```
POST /api/student/exam/violation
{ "disqualification_reason": "Tab switching detected 3 times" }
```

The backend then:
1. Sets `student.is_disqualified = true`
2. Stores `student.disqualification_reason`
3. Sets `student.score = 0` and `student.total_marks` = sum of all question points
4. Auto-submits the exam (`exam_submitted_at = now`)
5. Invalidates the Redis session cache

Disqualified students get a `403 Forbidden` on any subsequent protected exam endpoint.

---

## API Reference

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/admin/login` | — | Admin login → JWT |
| `POST` | `/api/auth/company/register` | — | Register company with logo (`multipart/form-data`) |
| `POST` | `/api/auth/company/login` | — | Company login → JWT |

### Admin — Companies

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/companies` | Admin JWT | List all companies (`?status_filter=all\|approved\|suspended`) |
| `PUT` | `/api/admin/companies/{id}/suspend` | Admin JWT | Suspend company account |
| `PUT` | `/api/admin/companies/{id}/unsuspend` | Admin JWT | Reactivate suspended company |
| `PUT` | `/api/admin/companies/{id}/set-plan` | Admin JWT | Assign plan + drive limit |
| `POST` | `/api/admin/companies/{id}/notify` | Admin JWT | Send in-app notification to company |
| `DELETE` | `/api/admin/companies/{id}` | Admin JWT | Hard delete company (blocked if company has any drives) |

### Admin — Drives

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/drives` | Admin JWT | List all drives (`?status_filter=all\|draft\|upcoming\|live\|ended\|suspended`) |
| `GET` | `/api/admin/drives/{id}/detail` | Admin JWT | Full drive: questions + students + company info |
| `GET` | `/api/admin/drives/{id}/exam-status` | Admin JWT | Live exam snapshot: state, time remaining, student count |
| `PUT` | `/api/admin/drives/{id}/suspend` | Admin JWT | Suspend drive and clear all student responses |
| `PUT` | `/api/admin/drives/{id}/reactivate` | Admin JWT | Reactivate suspended drive → status = upcoming |

### Admin — Colleges

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/colleges` | Admin JWT | List all colleges |
| `GET` | `/api/admin/colleges/pending` | Admin JWT | List custom college names pending approval |
| `POST` | `/api/admin/colleges` | Admin JWT | Create new college |
| `PUT` | `/api/admin/colleges/approve-custom` | Admin JWT | Approve a custom college name used in drive targets |
| `PUT` | `/api/admin/colleges/{id}/approve` | Admin JWT | Approve existing college |
| `PUT` | `/api/admin/colleges/{id}` | Admin JWT | Update college name / approval status |
| `DELETE` | `/api/admin/colleges/{id}` | Admin JWT | Delete college |

### Admin — Student Groups

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/student-groups` | Admin JWT | List all student groups |
| `GET` | `/api/admin/student-groups/pending` | Admin JWT | List custom group names pending approval |
| `POST` | `/api/admin/student-groups` | Admin JWT | Create new student group |
| `PUT` | `/api/admin/student-groups/approve-custom` | Admin JWT | Approve a custom group name used in drive targets |
| `PUT` | `/api/admin/student-groups/{id}/approve` | Admin JWT | Approve existing group |
| `PUT` | `/api/admin/student-groups/{id}` | Admin JWT | Update group name / approval status |
| `DELETE` | `/api/admin/student-groups/{id}` | Admin JWT | Delete student group |

### Admin — Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/notifications` | Admin JWT | List all sent notifications (`?company_id=` to filter) |

### Admin — Tickets

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/tickets` | Admin JWT | List all tickets (`?status_filter=&category_filter=&priority_filter=`) |
| `GET` | `/api/admin/tickets/{id}` | Admin JWT | Get ticket detail with company info |
| `PUT` | `/api/admin/tickets/{id}/status` | Admin JWT | Update status + add resolution notes |

### Company — Profile & Misc

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/company/profile` | Company JWT | Profile + plan info + drives remaining |
| `GET` | `/api/company/colleges` | Company JWT | List approved colleges for targeting |
| `GET` | `/api/company/student-groups` | Company JWT | List approved student groups for targeting |
| `GET` | `/api/company/notifications` | Company JWT | Company notifications (last 90 days) |

### Company — Drives

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/company/drives` | Company JWT | List own drives |
| `POST` | `/api/company/drives` | Company JWT | Create drive (status = draft) |
| `GET` | `/api/company/drives/{id}` | Company JWT | Get drive detail |
| `PUT` | `/api/company/drives/{id}` | Company JWT | Update drive (draft or upcoming only) |
| `DELETE` | `/api/company/drives/{id}` | Company JWT | Delete drive (draft or upcoming only) |
| `PUT` | `/api/company/drives/{id}/publish` | Company JWT | Publish draft → upcoming (requires questions + students) |
| `POST` | `/api/company/drives/{id}/duplicate` | Company JWT | Clone drive with questions, targets and pre-exam students |
| `POST` | `/api/company/drives/{id}/start` | Company JWT | Open exam window (consumes one drive credit) |
| `POST` | `/api/company/drives/{id}/end` | Company JWT | Close exam window early, auto-submit active students |
| `GET` | `/api/company/drives/{id}/exam-status` | Company JWT | Current exam state, time remaining, student count |

### Company — Questions & Students

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/company/drives/{id}/questions` | Company JWT | List all questions for a drive |
| `POST` | `/api/company/drives/{id}/upload-questions` | Company JWT | Bulk upload from CSV |
| `GET` | `/api/company/drives/{id}/students` | Company JWT | List all students for a drive |
| `POST` | `/api/company/drives/{id}/upload-students` | Company JWT | Bulk upload from CSV |

### Company — Email

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/company/email-template` | Company JWT | Get current email template + available variables |
| `PUT` | `/api/company/email-template` | Company JWT | Update email template |
| `POST` | `/api/company/email-template/preview` | Company JWT | Preview rendered template with sample data |
| `GET` | `/api/company/drives/{id}/email-status` | Company JWT | Check readiness: SMTP configured, students exist, drive published |
| `POST` | `/api/company/drives/{id}/email-students` | Company JWT | Send invitations to all drive students via SMTP |

### Company — Results & Export

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/company/drives/{id}/results` | Company JWT | Get all student results (`?min_percentage=` to filter) |
| `GET` | `/api/company/drives/{id}/results/export?format=summary` | Company JWT | Download summary CSV |
| `GET` | `/api/company/drives/{id}/results/export?format=detailed` | Company JWT | Download detailed CSV with per-question answers |

### Company — Tickets

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/company/tickets/raise` | Company JWT | Raise a new support ticket |
| `GET` | `/api/company/tickets/my-tickets` | Company JWT | List own tickets (newest first) |
| `GET` | `/api/company/tickets/my-tickets/{id}` | Company JWT | Get specific ticket by ID |

### Student

Student endpoints are authenticated via a `?token=<access_token>` query parameter (not a header).

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| `POST` | `/api/student/auth/login` | — | 5 / token / 5 min | Login with email + access token |
| `GET` | `/api/student/auth/validate` | Student token | — | Check if token is still valid |
| `GET` | `/api/student/drive-info` | Student token | — | Drive window times + current status |
| `POST` | `/api/student/exam/start` | Student token | — | Start exam, generate randomised question order |
| `GET` | `/api/student/exam/questions` | Student token | — | Fetch questions in randomised order (no answers) |
| `POST` | `/api/student/exam/violation` | Student token | — | Record violation → auto-disqualify and submit |
| `POST` | `/api/student/exam/submit` | Student token | 3 / token / hour | Submit all answers |
| `GET` | `/api/student/exam/result` | Student token | — | Get final score and percentage |

### Utility

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | — | API info + links to docs |
| `GET` | `/health` | — | DB + Redis connectivity check |
| `GET` | `/static/logos/{filename}` | — | Serve company logo file |
| `GET` | `/docs` | — | Swagger UI (interactive) |
| `GET` | `/redoc` | — | ReDoc (readable) |

---

## Postman Collection

A ready-to-use Postman collection is available at [`docs/Company-Exam-Portal.postman_collection.json`](docs/Company-Exam-Portal.postman_collection.json).

### Import & Setup

1. Open **Postman** → click **Import** → select the JSON file
2. Edit collection variables under the *Variables* tab:

| Variable | Default | Auto-saved? | Description |
|----------|---------|-------------|-------------|
| `baseUrl` | `http://localhost:8000` | — | API server URL |
| `adminToken` | — | ✅ on Admin Login | JWT for admin requests |
| `companyToken` | — | ✅ on Company Login | JWT for company requests |
| `studentToken` | — | ✅ on Student Login | Access token for student requests |
| `driveId` | `1` | ✅ on Create Drive | Target drive ID |
| `companyId` | `1` | — | Target company ID for admin requests |
| `collegeId` | `1` | — | Target college ID |
| `groupId` | `1` | — | Target student group ID |
| `ticketId` | `1` | ✅ on Raise Ticket | Target ticket ID |

### Recommended Test Order

```
1.  Admin Login                       → adminToken saved
2.  Company Register
3.  Company Login                     → companyToken saved
4.  Admin: Set Company Plan           (optional — upgrade from free)
5.  Company: Get Approved Colleges    (note a college ID)
6.  Company: Get Approved Groups      (note a group ID)
7.  Company: Create Drive             → driveId saved
8.  Company: Upload Questions CSV
9.  Company: Upload Students CSV
10. Company: Publish Drive
11. Company: Get Email Status         (verify SMTP is ready)
12. Company: Send Emails to Students
13. Company: Start Exam Window
14. Student: Login                    → studentToken saved
15. Student: Start Exam
16. Student: Get Exam Questions
17. Student: Submit Exam
18. Student: Get Exam Result
19. Company: Get Drive Results
20. Company: Export Results CSV
21. Company: End Exam Window
22. Company: Raise Ticket             → ticketId saved
23. Admin: Get All Tickets
24. Admin: Update Ticket Status       (resolve)
```

