# Apollo Connected CRM + GCP Merge — QA Report

Build basis: IT ZIP supplied 12 Sep 2026 (`(17)apollo-freighterp-main (17).zip`).

## Merge result

- IT's latest HR/Maintenance changes retained.
- `036_hr_weekend_overrides.sql` retained unchanged.
- CRM migration renumbered to `037_crm_module.sql` to avoid a migration-number collision.
- CRM server/API, UI, permissions, login option and portal switch merged into the latest IT code.
- Google Cloud same-origin API behavior added while preserving Vercel → Render compatibility during transition.

## Checks completed

PASS — Node syntax checks:
- `server/src/index.js`
- `server/src/crm.js`
- `server/src/config.js`
- `server/src/db.js`
- `server/src/migrate.js`
- `web/app-runtime.js`
- `web/app.js`
- `web/crm-portal.js`
- `web/hr-portal.js`
- `web/hr-profile-photo.js`
- `web/config.js`

PASS — `npm run check`.

PASS — JSON validation:
- `vercel.json`
- `server/package.json`

PASS — Static path/link validation:
- index CSS/JS/assets exist
- dynamic JS imports exist
- server relative module requires resolve
- CRM JS/CSS are linked
- CRM login option exists
- CRM portal switch exists

PASS — CRM preview navigation: 11 screens and 11 matching navigation targets.

PASS — CRM server-side security structure:
- CRM session required
- CRM session blocked from ERP-only generic routes
- normal sales account scope is based on `crm_accounts.assigned_to`
- export permission enforced server-side
- assignment permission enforced server-side
- archive permission enforced server-side
- audit/team-report permission enforced server-side
- CRM admin permission enforced server-side

PASS — Account handover logic:
- management can reassign accounts
- active opportunities still owned by the previous account owner move to the new owner
- open follow-ups still assigned to the previous account owner move to the new owner
- historical CRM activity remains retained

PASS — Migration ordering:
- IT migration: `036_hr_weekend_overrides.sql`
- CRM migration: `037_crm_module.sql`

PASS — merge-conflict marker scan.

## Deployment validation still required by IT

A full production integration test cannot be completed without Apollo's real PostgreSQL data, production secrets and deployed Cloud Run environment. Before enabling Sales users, IT must run the migration job and perform the live permission test described in `GCP_DEPLOYMENT.md`:

1. Sales A sees an account assigned to Sales A.
2. Sales B cannot see or fetch that account even with the known account ID.
3. A sales user without export permission receives a server-side denial.
4. Management reassigns the account to Sales B.
5. The account disappears from Sales A and appears for Sales B.
6. The reassignment is recorded in CRM audit/activity.

The Google Cloud deployment should not replace the existing Vercel/Render/Neon production stack until those checks and data reconciliation pass.
