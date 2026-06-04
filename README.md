# ForgeHR Performance Appraisal System

ForgeHR is a full-stack internal HR appraisal system prototype for a manufacturing company. It includes role-based login, dashboards, KPI master records, employee master data, KPI templates, appraisal periods, manager appraisal workflow, HR review, employee acknowledgement, onboarding help, reports, audit logs, seed data, a Prisma PostgreSQL schema, and basic tests.

## Run Locally

This deliverable is intentionally runnable without installing packages:

```powershell
node server.js
```

Open `http://localhost:3000`.

Run tests:

```powershell
node --test tests/*.test.js
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

## Included Modules

- Authentication with hashed passwords and HTTP-only session cookies.
- Role-based access control for Super Admin, HR Admin, Line Manager, and Employee.
- Role-specific dashboards.
- Department and job role master views.
- KPI Master with create, search, filter, and status badges.
- KPI Template management with 100% total weight validation.
- Employee Master with line manager and KPI template assignment.
- Appraisal Period view with open/closed/locked model support.
- Line Manager appraisal actions with draft and submit states.
- HR review actions for return, approve, and publish.
- Employee published-result acknowledgement endpoint and UI support.
- Onboarding and help guide content for all roles.
- HR reports for completion, department performance, training needs, top performers, and improvement needs.
- Audit trail for important workflow events.
- Tests for scoring, rating, template weight validation, and RBAC.

## Prisma / PostgreSQL Path

The production database model is in `prisma/schema.prisma`. In a normal Node environment with a package manager, install Prisma and use:

```powershell
npm install next react react-dom prisma @prisma/client
npx prisma migrate dev
npx prisma db seed
```

The current runnable app uses seeded in-memory data so it can run in this Codex workspace without `npm`, `pnpm`, or `yarn`.

## Recommended Next.js Upgrade Structure

Use this app as the business-rule and screen blueprint, then map it into:

- `app/(auth)/login/page.tsx`
- `app/(dashboard)/layout.tsx`
- `app/api/auth/*/route.ts`
- `app/api/kpis/route.ts`
- `app/api/employees/route.ts`
- `app/api/templates/route.ts`
- `app/api/appraisals/[id]/route.ts`
- `components/AppShell.tsx`
- `components/DataTable.tsx`
- `lib/auth.ts`
- `lib/rbac.ts`
- `lib/scoring.ts`
- `prisma/schema.prisma`

## Validation Rules Implemented

- KPI template weight must equal 100%.
- Appraisal score must be between 1 and 5.
- Employees created through the API must have a department and line manager.
- Line managers can only appraise employees assigned to them.
- HR cannot publish an appraisal until it has been approved.
- Appraisals require an open period for manager edits.
- Employees can only acknowledge their own published result.

## Notes

This is a practical prototype, not just static screens. API routes enforce role checks and workflow rules, while the UI is responsive for desktop and tablet use. For production, replace the in-memory store with Prisma Client calls, add CSRF protection, add password reset email delivery, and generate PDF/Excel exports from the report and appraisal endpoints.
