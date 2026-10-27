# Apollo Connected V29 — deployment handoff

Base: the exact `(28)ApolloFreightERP-main (28).zip` supplied on 26 October 2026. This is a full source ZIP, not the V27.2 billing test. Existing production imports are database records: do not reimport, reset, reseed or replace the database when deploying.

## What changed

- Accounts show the exact filtered account count and sequential row numbers. Account IDs remain unchanged.
- Management can select all matching accounts and uncheck exceptions. A compact action bar appears only with selected accounts. Changing filters removes selections outside the new result set. All rendered matching records are selected, not just those visible in the viewport; there is no page-only selection. API maximum is 5,000 per update.
- Bulk salesperson, entity and status changes are validated and committed together. Existing statuses remain Prospect, Lead, Active (active customer), Dormant. Individual account editing remains available.
- Reassignment sends one summary email per batch to the new active salesperson using the existing Microsoft Graph mail sender. Single-account creation/reassignment and Team & Assignments also notify. Repeating an unchanged owner does not send another notification. Failed mail does not undo a saved assignment; its status is reported separately. Accepted means the mail API accepted the message, not verified inbox delivery.
- Assignment email links lead through CRM sign-in to the batch's accounts. Every read checks current account access. No public links or mailbox permission changes. `APP_PUBLIC_URL` is supported; default is https://connected.apollo-freight.com.
- Import confirmation now displays saved counts and an alert before closing. A lost response explicitly tells the operator to check Accounts before retrying.
- Customer document checks validate database storage before making AI calls, report a specific DOC-DB-SETUP error, recognise additional Excel invoice headers, and reject zero-item extraction instead of presenting an empty result. Description/quantity tables without HS codes are read but flagged for review, not approved.

## REQUIRED: customer document database check

Run these from `server/` using the SAME live DATABASE_URL, schema/search_path and database role as the Cloud Run service. Do not point them at a developer database. Preserve a database backup first.

1. Schema and write-capability diagnostic (the temporary probe INSERT is rolled back):

   `node src/customer-compliance-setup.js`

2. If the table is missing, the authorised database administrator must review `server/sql/042_customer_compliance.sql`. Run ONLY that targeted setup, not an entire historical migration/seed sequence:

   `ALLOW_PRODUCTION_MIGRATIONS=true node src/customer-compliance-setup.js --apply`

   The flag is required even outside production for this command. Do not add it permanently to the web service. This creates the existing compliance table/indexes if absent and verifies access. It does not delete or overwrite existing data. If the application role cannot create schema objects, the DBA applies SQL042 separately, then grants the runtime role the required table access and reruns the diagnostic without `--apply`.

3. An existing but incompatible table requires DBA investigation; this helper does not drop/rebuild it.

## REQUIRED: PDF/image cloud access check

Recognised single Excel invoices use direct extraction and do not require AI. PDFs, photos, mixed uploads and unrecognised workbook layouts still use the already configured provider. No switch to a different provider or broadening of cloud access was made.

If DOC-AI-403 persists, inspect the server/provider error with the actual Cloud Run runtime service account. Verify the target project, enabled service, billing/model availability, organisation policies and inference permission. The deployer's personal login is not the runtime identity. Grant only approved access; do not share Microsoft mailbox passwords or add tenant-wide Microsoft Graph permissions.

Google documents `aiplatform.endpoints.predict` for prompt requests; `roles/aiplatform.user` is a predefined role, but a reviewed custom role can be narrower. Reference: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/access-control

Keep `APOLLO_COMPLIANCE_PROVIDER`, `APOLLO_COMPLIANCE_MODEL`, `APOLLO_COMPLIANCE_LOCATION`, cloud project and service-account settings intact unless IT verifies a configuration correction. The setup helper does not verify AI authorisation.

## Deployment acceptance — do before handing back

1. Deploy to a test revision first. Keep the preceding revision for rollback. Use this package's web assets and server together; asset version is apollo-v29-accounts-20261026.
2. Accounts: choose Khaldoun + DXB, then KWI. Compare count with a database query/export for the same filters. Select all, uncheck two, ensure selected count drops by two. Clear selection.
3. Use disposable test accounts for bulk status/owner/entity updates. Confirm exact selected IDs changed and unselected accounts did not. Verify an ordinary salesperson cannot bulk-update or view another person's accounts.
4. Assign test accounts to an agreed test salesperson. Confirm one real email, correct count, and the link after a fresh login. Reassign away and check the former owner cannot access the batch's account data.
5. Test a small import preview and commit. Confirm a visible saved-count message and no duplicate import. Do not reimport the live KWI/DXB spreadsheets for testing.
6. Customer portal: use the previously failing BFLKWT-2026-00261.xlsm. Expected 164 extracted item rows with feedback and a saved analysis. Test a representative PDF and photograph separately. Test a blocked/missing HS code and verify attention feedback, not false clearance. A 403 or DOC-DB-SETUP is a deployment blocker for the affected format, not a successful test.
7. Smoke-test existing HR approval, shipment email/signature and CRM reviews without changing their configuration.

## Local verification completed

- Isolated PostgreSQL-compatible database: bulk updates, rollback, invalid/unauthorised actions, entity collision guard, current-access batch reads, mail failure/success, single-account notifications.
- Frontend DOM interaction tests: owner filter 80 to 65 accounts, select all 65, uncheck one to 64, submit owner/status values, confirmation/Done and clearing selection.
- Actual provided XLSM through the analysis route: 164 items, result stored, no AI call. SQL042 applied twice successfully; missing table gives DOC-DB-SETUP. Additional header fixture and unknown-code review checked.
- CRM import/export, existing visit scheduling/filter/AI and six MFA/password-reset regression tests passed.
- PDF provider transport/error handling tested with mocked credentials/responses, NOT live Google. Production database, live email delivery, live PDF/image extraction and device-specific visual rendering are not verified here. A local browser engine was unavailable; DOM interactions were tested instead.

## Rollback

Redeploy the preceding V28 revision if required. The optional SQL042 table/index creation is additive and can remain. Bulk changes are audited with prior owner/entity/status; rollback of account assignments is a separate deliberate data action, not achieved by reverting application code. No production data was changed during preparation.
