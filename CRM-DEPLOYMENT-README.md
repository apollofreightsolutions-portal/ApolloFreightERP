# Apollo Connected CRM V1 — IT Deployment Notes

## What this package adds
Apollo Connected now includes a CRM / Sales workspace inside the existing portal design. It is not a separate application.

New CRM screens:
1. CRM Dashboard
2. Accounts
3. Contacts
4. Opportunities
5. Sales Visits
6. Meeting Minutes
7. Follow-ups
8. Activity Timeline
9. CRM Reports
10. Team & Assignments (management permission)
11. CRM Security (CRM-admin permission)

The login screen now includes **CRM / Sales**. The left-side **Portal Access** area also includes **Open CRM / Sales** under the existing HR / Maintenance access controls.

## Database migration
Deploy the application with the existing migration process enabled. The new migration is:

`server/sql/037_crm_module.sql`

It adds CRM permissions to `app_users` and creates the CRM account, contact, opportunity, visit, meeting, task and audit tables.

Existing users whose `role` is `Admin` receive full CRM-management permissions on migration. Ordinary users receive no CRM access until Company Management enables it.

## Recommended Sales Executive permissions
For an ordinary salesperson:

- CRM Portal Access: Enabled
- CRM Role: Sales Executive
- View All Accounts: Disabled
- Manage Assignments: Disabled
- Export / Download: Disabled
- Archive Accounts: Disabled
- Team Reports: Disabled
- CRM Admin: Disabled
- ERP Portal Access: Disable if this employee should be CRM-only

With this profile, the salesperson's CRM API is restricted to accounts where `crm_accounts.assigned_to` matches that logged-in user. Contacts, opportunities, visits, meeting minutes and account activity inherit that same account-level visibility.

## Employee departure / handover
Management should:

1. Disable the employee's application account / CRM access.
2. Open **CRM > Team & Assignments**.
3. Reassign that employee's accounts to the replacement salesperson.
4. The account's contacts, opportunities, visits, meeting minutes and history stay with the account and become visible to the new owner.
5. The reassignment is written to the CRM audit log.

There are no CRM hard-delete endpoints in V1. Accounts are archived by users who have archive permission.

## Security controls implemented
- CRM permission checks are server-side; hiding a frontend button is not used as the security boundary.
- CRM access is checked against the current `app_users` record on each CRM request.
- Account visibility is enforced by `assigned_to` unless the current user has `crm_view_all_accounts`.
- Reassignment, export, archive, team reporting and CRM administration have separate permission flags.
- CSV export endpoints reject users without export permission.
- CRM-only tokens are rejected by the sensitive ERP CRUD routes.
- CRM writes and ownership/security changes are logged in `crm_audit_log` with actor, timestamp and request IP when available.
- Contact records selected for a visit/meeting are validated to belong to the same account.
- The historical `admin / admin123` database-failure demo login is disabled when `NODE_ENV=production`.

## Production configuration checklist
Before deployment confirm:

- `NODE_ENV=production`
- Correct `DATABASE_URL`
- Run `npm run migrate` explicitly before traffic. For Google Cloud, use the Cloud Run migration job in `GCP_DEPLOYMENT.md`; production startup intentionally does not auto-run migrations.
- `ALLOWED_ORIGIN` restricted to Apollo's real web origin(s)
- Production authentication/token secrets are configured and not development values
- HTTPS is enforced at the hosting/load-balancer layer
- Database backups / point-in-time recovery are enabled
- Production database credentials and cloud/storage secrets are not committed to the repository

## Files added
- `server/sql/037_crm_module.sql`
- `server/src/crm.js`
- `web/crm-portal.js`
- `web/crm-portal.css`
- `CRM-PREVIEW.html`
- `CRM-DEPLOYMENT-README.md`

Core files updated include `server/src/index.js`, `web/index.html`, `web/app.js`, `web/app-runtime.js`, and root `vercel.json`.

## Design preview
Open `CRM-PREVIEW.html` locally in a browser. It uses sample data and lets you click through all 11 CRM pages without connecting to the production database.

## Important deployment note
This V1 was built against `Apollo_Connected_Redesign_V2(1).zip`. If the live GitHub / Google Cloud version has code changes made after that package, merge or rebase this CRM package onto the current live source before production deployment. Do not overwrite newer production changes blindly.


## Latest IT merge

This CRM was re-merged onto the IT ZIP supplied on 12 Sep 2026. That build added `036_hr_weekend_overrides.sql`, so the CRM migration is `037_crm_module.sql`. IT's later HR and Maintenance changes are retained. The Google Cloud deployment instructions in `GCP_DEPLOYMENT.md` supersede older Vercel/Render deployment notes for production.
