# ForgeHR Performance Appraisal System

ForgeHR is a full-stack internal HR appraisal system for a manufacturing company. It covers role-based login, dashboards, KPI master records, employee master data, KPI templates, appraisal periods, the manager appraisal workflow, HR review, employee acknowledgement, onboarding help, reports, and audit logs.

It runs with **zero third-party dependencies** — only Node.js is required. Data is persisted to a local SQLite database via the built-in `node:sqlite` module, and the frontend is plain ES modules with one lazily-loaded folder per page.

## Requirements

- **Node.js 22.5+** (24 recommended). `node:sqlite` is built in; no `npm install` is needed.

## Run Locally

```bash
node server.js
```

Open `http://localhost:3000`.

Run the tests (scoring, RBAC, and full API/workflow integration):

```bash
node --test
```

## Demo Logins

All demo users use this password:

```text
Password123!
```

| Role | Email |
| --- | --- |
| Super Admin | super.admin@company.test |
| HR Admin | hr.admin@company.test |
| Line Manager | grace.manager@company.test |
| Line Manager | daniel.manager@company.test |
| Line Manager | aisha.manager@company.test |
| Employee | john.operator@company.test |
| Employee | mary.sales@company.test |

## Architecture

```
server.js                 Single Node HTTP entry: auth, CSRF, sessions, static, routing
src/
  core/
    auth.js               PBKDF2 password hashing + verification
    rbac.js               Roles and permission checks
    scoring.js            Weighted 1-5 scoring engine
    security.js           CSRF token helpers + login rate limiter
  db/
    index.js              node:sqlite connection + document-store collections
    seed.js               Idempotent seed data
  server/
    http.js               Request/response helpers (JSON, cookies, body limits)
    session.js            SQLite-backed sessions with TTL
    domain.js             Read-model (dashboards, bootstrap, reports, lookups)
    routes.js             Authenticated API handlers
    evidence.js           Real evidence-file upload/download
public/
  index.html              Loads main.js (ES module)
  main.js                 App entry
  shared/                 state, api (CSRF-aware), helpers, ui, appraisal, modals, shell (router)
  pages/<name>/index.js   One folder per page, dynamically imported on navigation
prisma/schema.prisma      Reference relational schema (optional migration target)
tests/                    scoring, rbac, and api/workflow integration tests
```

The SQLite file is created at `./data/forgehr.db` on first run and is seeded only when empty, so data entered later is preserved across restarts. Override the location with the `DATA_DIR` / `DATA_FILE` / `UPLOADS_DIR` environment variables, and the port with `PORT`.

## Scoring model

Each KPI in an appraisal has a **weight** (template weights sum to 100%) and a manager **score from 1 to 5**. The final score is the weight-weighted average of the KPI scores, so it also lands on the 1–5 scale and template weights genuinely drive the outcome. A percentage (`score / 5 × 100`) and a rating band (Excellent / Very Good / Satisfactory / Needs Improvement / Unsatisfactory) are derived from it.

## Security

- PBKDF2-hashed passwords; no plaintext credentials are stored.
- HTTP-only, `SameSite=Strict` session cookies backed by SQLite with an 8-hour TTL.
- CSRF protection (double-submit token) on all state-changing requests.
- Login rate limiting to blunt brute-force attempts.
- Security headers (CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`).
- Evidence files are validated by size and type and served only to authenticated sessions.

## Validation & workflow rules

- KPI template weights must total 100%.
- Appraisal scores must be between 1 and 5.
- Employees created through the API must have a department and a line manager.
- Line managers can only appraise employees assigned to them (others get 403).
- Managers can edit an appraisal only while it is Not Started / Draft / Returned; once Submitted it is locked.
- HR cannot publish an appraisal until it has been approved.
- Manager edits require an open appraisal period.
- Employees can only acknowledge their own published result.

## Optional: PostgreSQL via Prisma

`prisma/schema.prisma` contains a relational model that mirrors this domain. To migrate off SQLite, install Prisma and point the repositories in `src/db` at Prisma Client. The default SQLite path needs none of this.
