# Apollo Connected — ERP + HR + Maintenance + CRM

This package is based on the latest Apollo Connected source ZIP supplied on 14 Sep 2026, with Apollo CRM retained and Apollo AI (Gemini V1) integrated on top.

## Production target

Google Cloud is the recommended production target:

- Cloud Run: one Node/Express service serving the UI and API
- Cloud SQL for PostgreSQL: ERP/HR/Maintenance/CRM database
- Secret Manager: database URL and session-signing secret
- Artifact Registry + Cloud Build: container build and image storage
- Private Cloud Storage bucket: reserved for future real file uploads
- `connected.apollo-freight.com`: production hostname

See `GCP_DEPLOYMENT.md` for the deployment sequence.

## CRM

The CRM is integrated into Apollo Connected and uses the same authentication system. A CRM user must have CRM Portal access. Normal sales users see only accounts assigned to their username; this is enforced by the API, not only by the interface.

CRM features include accounts, contacts, opportunities, client visits, meeting minutes, follow-ups/tasks, activity history, reports, account reassignment/handover, exports controlled by permission, archive controls, and CRM administration.

Database migration for the CRM is `server/sql/037_crm_module.sql`. The IT-supplied build already contains `036_hr_weekend_overrides.sql`, so CRM was intentionally renumbered from 036 to 037 during this merge.

When an account is reassigned, active opportunities and open follow-ups that still belong to the previous account owner are transferred to the new owner while the historical activity remains intact.

## Apollo AI (Gemini V1)

This package includes Apollo AI as a read-only, permission-scoped assistant. The Gemini API key remains server-side, user access is controlled by `app_users.ai_access`, shipment context is branch-scoped, CRM context follows account ownership / existing CRM view-all permission, and the free-tier-safe defaults exclude financial amounts and personal HR data.

See `APOLLO-AI-README.md` before deployment. Migration `server/sql/038_apollo_ai.sql` must be reviewed and applied.

## Transition compatibility

`vercel.json` and `render.yaml` are kept for rollback/transition only. `web/config.js` uses the current origin on Google Cloud, but still recognizes a `*.vercel.app` host and points it to the existing Render API during the migration period.

## Security notes

- Production disables the historical `admin / admin123` database-failure fallback.
- CRM account visibility is enforced server-side.
- CRM export, assignment, archive, team-report and admin capabilities are separate permissions.
- Use a strong, stable `CUSTOMER_PORTAL_SECRET` from Secret Manager in production.
- Run reviewed SQL migrations explicitly in production; production startup does not auto-run the migration directory.

## Final verification before users are enabled

After deployment, test at minimum:

1. Management can enter CRM and assign an account to Sales A.
2. Sales A can see that account and its contacts/opportunities/visits/minutes.
3. Sales B cannot access the account, including by manually changing an ID in an API request.
4. Sales A without export permission cannot export CRM data.
5. Management can reassign the account from Sales A to Sales B and the account immediately disappears from Sales A and appears for Sales B.
6. The audit trail records the reassignment.

Do not decommission Vercel/Render/Neon until the Google Cloud copy has passed the live data, login, permission and rollback checks.
