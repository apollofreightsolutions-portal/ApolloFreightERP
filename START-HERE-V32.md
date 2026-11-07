# Apollo Connected V32 — REVISED STATION-ACCOUNTS BUILD
Build: v32-awb-parity-20261107. This replaces the earlier V32 ZIP. Includes its OpenAI and HS fixes plus independent Operations customer accounts by station. Older version notes in the archive are historical; use THIS checklist.

## AWB fetching verification correction
The earlier V32 station build could overwrite the fetched customer email/mobile/address from the local customer master. That overwrite has been REMOVED. Fetch now preserves the existing shipment contact/address snapshot and every other V31 prefill property; only customerCode maps to the receiving station. No change to the established new-job number, date and cleared-old-TCN handling inherited from V31.

The differential test compares the actual V31 and V32 fetch functions across 96 scenarios and 132 record fields. It also asserts unchanged lookup entry function, shipment constructor, form builder, cargo builder, form collection, metadata serialization, creation function and unchanged non-customer form binders. Missing/ambiguous local accounts still require explicit selection before saving; blocked accounts remain fetchable but cannot transact. Test fixtures simulate records; no production access was used.

## What changed
- DXB and KWI can create the same customer name with DIFFERENT globally unique account numbers. Same-station duplicate names are rejected, including whitespace/punctuation variations. Existing account numbers are never renumbered.
- Customer account station/code are fixed after creation. Existing historical jobs and invoices are not mass-reassigned or deleted.
- New jobs bind to a local customer account code. AWB Fetch retains shipment data and resolves the same-name local account. If no unique local account exists, the user must select/create one before saving. No source account is silently reused in another station.
- A local Blocked account prevents job creation, edits, clearance, POD upload, closing, deletion and linked document/history/invoice/charge/manifest writes. GET/view/AWB Fetch are unchanged. Admin must unblock the account before transacting.
- AWB status and POD synchronization skip blocked or unresolved local accounts, leaving them unchanged; active counterpart jobs can continue. Existing AWB and job-number allocation, service tags and numbering formats are unchanged.
- Customer login remains linked to its own account code; blocking that account stops its linked customer login, not the other station account. Customer portal shipment/history reads and performance views are station-scoped.
- AI now uses OpenAI for chat; direct account searches use live database queries (no latest-1,200 cap). Admin block/unblock operates on the exact local account, with confirmation and audit.
- HS checks use 90% text-match threshold, separate clarification/flagged lists and bulk keep/suggest/Ask Apollo. Restrictions remain flagged. Original invoices remain unchanged.
- No original logos, stylesheets, HR approval workflows or QuickBooks test integration were changed.

## Prepared Cloud Shell SQL sequence — do not run until approved

V32 migrations are renumbered to **056** and **057** because SQL 055 is already in use in the target environment. The read-only preflight is outside `server/sql/`, so the normal migration runner will not execute it accidentally. These commands are preparation only; do not connect to or change a production database until the database copy has been reviewed and migration is explicitly approved.

From the checked-out V32 repository root in Cloud Shell, set the target values and connect:

```bash
export PROJECT_ID="YOUR_GCP_PROJECT_ID"
export SQL_INSTANCE="YOUR_CLOUD_SQL_INSTANCE"
export DB_NAME="YOUR_DATABASE_NAME"
export DB_USER="YOUR_DATABASE_USER"
gcloud config set project "$PROJECT_ID"
gcloud sql connect "$SQL_INSTANCE" --user="$DB_USER" --database="$DB_NAME"
```

At the `psql` prompt, enable stop-on-error and run the read-only preflight first. Review every returned row and resolve exceptions before continuing:

```sql
\set ON_ERROR_STOP on
\i server/preflight/057_station_accounts_PREFLIGHT_READ_ONLY.sql
```

Only after the backup, database-copy review, and approval, apply the two migrations in order. SQL 056 may be omitted only if IT has verified it was already applied:

```sql
\i server/sql/056_ai_account_actions.sql
\i server/sql/057_station_customer_accounts.sql
```

Do not run `npm run migrate` for this task: the general runner processes the entire top-level `server/sql/*.sql` directory, not just these two migrations. Do not run the preflight with `\i` and then continue automatically if it reports unresolved shared-account or block cases.

## Before deployment — mandatory
1. Back up the current deployed files and database. Test this build on a database copy first.
2. Run server/preflight/057_station_accounts_PREFLIGHT_READ_ONLY.sql. Review:
   - Old shared accounts used for jobs in another station.
   - Same-station name duplicates previously created using punctuation.
   - Existing cross-station block settings.
3. Existing shared accounts are NOT automatically split. Create the counterpart station account with its own unused code. Historical jobs keep their numbers/data; subsequent writes resolve/bind the correct local account.
4. SQL 057 deliberately stops if a legacy block spans stations or targets a station different from the account's owner. IT must map those exceptions explicitly: retain the original code/station, create the intended local counterpart, and preserve the intended block on that counterpart. Do not simply clear old blocks to make the migration pass. Agree the mappings with Khaldoun first.
5. Existing same-station duplicates need review; do not merge/delete jobs automatically. New duplicates are prevented. Missing/ambiguous local accounts remain readable but cannot be transacted until resolved.

## Deployment
1. Apply SQL 056_ai_account_actions.sql if not already applied.
2. Apply SQL 057_station_customer_accounts.sql to the SAME production PostgreSQL database/schema used by the backend. This adds a shipment customer_code column, validation functions and triggers. It does not backfill or renumber existing jobs.
3. Ensure the application DB role can execute the new functions and SELECT/INSERT/UPDATE the AI audit table. Use the application's normal schema/search_path. Deploy during a short maintenance window so an older backend is not writing while migration is applied.
4. Deploy all listed runtime files together, restart backend and refresh browser. Do not overwrite live secrets, database configuration or uploads. No production npm dependencies were added.
5. Configure server OPENAI_API_KEY and optional OPENAI_MODEL=gpt-5.4-mini. API billing/network access must work. Never place the key in web files.
6. KEEP existing Google credentials: PDF/image document extraction still uses the existing service. This replaces chat's provider, not document extraction. Excel parsing remains local.
7. Run a NEW HS analysis after deployment; stored older results are not automatically rescored.

## Exact changed deployment files versus V31
Replace these 8 files:
- server/src/index.js
- server/src/apollo-ai.js
- server/src/customer-compliance.js
- web/app-runtime.js
- web/app.js
- web/index.html
- web/apollo-ai.js
- web/customer-compliance.js

Add these 3 runtime files:
- server/src/station-accounts.js
- server/src/ai-accounts.js
- server/src/apollo-openai.js

SQL files (copying alone is not execution):
- server/sql/056_ai_account_actions.sql — execute once
- server/sql/057_station_customer_accounts.sql — execute once after preflight
- server/preflight/057_station_accounts_PREFLIGHT_READ_ONLY.sql — review before migration

The full ZIP also includes QA tests and release notes. Replace the earlier V32 package; do not combine it with the separate V27.2 QuickBooks test build.

## Acceptance test — use designated test accounts
1. DXB creates Company X, e.g. 0021. KWI creates Company X, e.g. 1212. Same-station duplicate, including a trailing dot, is rejected. Same account code cannot be reused.
2. Create DXB job/AWB. Fetch that AWB into KWI. Verify weight, pallet dimensions, mode, CBM and reference; KWI customer code must be 1212. DXB source job/code/TCN must not change.
3. Block KWI 1212. Viewing/fetching remain available. KWI creation, edit, clearance, POD upload and closure must fail. DXB 0021 still works. Dubai AWB synchronization must not change the blocked KWI job.
4. Unblock 1212. Kuwait can work again. Neither station's account number changes.
5. Verify a KWI-only user cannot bypass the block by posting against a Dubai job. Admin can access both but still must unblock before operational writes.
6. Test ordinary existing AWB lookup, new unique job/TCN numbering, POD and active-account synchronization. Verify each station's invoice/customer details.
7. AI: find Sun and Sand KWI/DXB, open exact account, block/unblock test account with confirmation. Test a general question to verify the live OpenAI key (direct search works without it).
8. HS: reanalyse the actual Excel, check eligible 90–94% matches, separate clarification/restriction rows, select 30+ lines across pages, deselect some, keep/use suggestions and download summary.
9. Verify existing customer booking and optional DXB help notifications.

## Rollback and limitations
No production change was performed during this build. Local tests passed, including the actual status-by-AWB route against a local PostgreSQL engine, existing numbering regressions and source-record preservation. Live data, OpenAI credentials and cloud storage still require IT's staging test.

This database change introduces triggers: restoring old JavaScript alone is NOT a complete rollback. Before test transactions, IT can restore the backed-up database and matching deployed code. After real transactions or new same-name station accounts exist, do not restore an old database over new work and do not revert to name-only V31 lookups. Use a reviewed forward correction or a coordinated migration that preserves new records. Unblocking is reversible in the normal account screen; it does not delete any jobs.

Unlinked legacy accounts require deliberate mapping. New local accounts use separate credentials/profile ownership; shared customer portal access across entities is not automatically granted. Arbitrary AI writes/deletion/SQL are not enabled.

## OpenAI reference
https://developers.openai.com/api/docs/models/gpt-5.4-mini
