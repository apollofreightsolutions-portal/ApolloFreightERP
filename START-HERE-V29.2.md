# Apollo Connected V29.2 — START HERE

Full deployment package based on the supplied production V28 plus ALL V29/V29.1 CRM and document fixes. V29/V29.1 have not been deployed: deploy only this combined V29.2 package. Do not deploy the separate V27.2 billing/QuickBooks test build.

## What this release does

### Preserve jobs; separate testing history from live figures

- The cutoff is **created_at before 1 September 2026 at 00:00 Kuwait time (UTC+03)**, not booking date, delivery date, status or TCN number. A job created exactly at the cutoff is live. Unknown creation dates are not guessed as testing.
- No jobs, TCNs, AWBs, documents, charges or invoices are deleted. No statuses are closed automatically. No selling/cost amounts, payments or accounting exports are zeroed or rewritten.
- Pre-cutoff jobs default to **Pre-live / testing period**, excluded from ERP dashboard counts, shipment/status/POD registers, reports and corresponding exports. They remain in the database and can still be opened directly by number.
- **Include pre-live records** is visible on the affected screens. It is off on sign-in/page reload and applies to these reporting screens for the session. When enabled, the banner explicitly warns that historical/testing records are included in figures. Existing ownership/branch visibility is retained.
- In the shipment register, turn the toggle on and find the old job. Administrators get **Restore to live reporting**. A reason is mandatory. This updates only its reporting classification and writes an audit entry. The inverse **Return to pre-live** is available. It does not touch financial values, shipment status or creation timestamp.
- Linked invoices/charges follow the shipment classification, even when the invoice itself was created later. Unlinked old invoices use their own stored creation timestamp. A mixed live/pre-live invoice is excluded as a whole and labelled for billing review; this release does NOT allocate or split its monetary values. A manifest containing both live and old jobs stays visible and is labelled mixed; its original contents/totals remain intact.
- Raw record APIs, customer tracking and historical document access retain the original records. This is a reporting policy, not a security boundary or accounting-ledger deletion. External accounting balances remain unchanged.
- Apollo AI operational summary queries use the live cutoff by default; explicit job references still retrieve permitted historical jobs. Ask to **include pre-live records** when historical aggregate results are wanted. The ERP checkbox is not an AI chat setting.

### Filters and pagination

- Shipment register display and export now use the SAME filter scope (previously different).
- Exact status selectors distinguish Delivered from Partially Delivered. Other text columns remain case-insensitive contains filters; multiple column filters are ANDed. Derived truck/pallet values and both ISO/display date text are supported.
- Global search, applied date/branch changes, column filters and sort changes reset to page 1. Filters remain applied through navigation. Reset Filters also clears column filters.
- First / Previous / page entry + Go / Next / Last, rows per page (15/30/50/100), and filtered totals are available. Print reports include all report rows rather than only the first page.
- Removed the 500-row fetch cap for shipment status history, invoices, charges, manifests and documents used by operational totals/POD checks. Other master-data resources retain their existing caps.
- Removed hard-coded demo shipment alerts. The dashboard no longer truncates the searchable table to 50 rows.
- Report-specific dates use booking dates; invoice screen dates use invoice dates. The pre-live cutoff remains creation timestamp regardless of these filters. Report preview/export uses its own From/To fields plus global search/branch selection.
- Core reporting screens wait for verified live data rather than displaying cached/demo amounts as live on startup/API failure.

### Retained V29/V29.1 functions

- CRM filtered account totals, sequence, checkboxes/select all with exceptions, bulk owner/entity/status edits, import confirmation, assignment emails for individual/bulk changes and secure links.
- Customer document fixes: each file extracted independently, direct recognised Excel reading, master comparison on each extracted line, unknown/missing/invalid/mismatch/restriction/prohibition feedback, source row/file references and incomplete extraction safeguards.
- Read the retained V29/V29.1 notes for detail, but this file controls deployment/version selection.

## Required deployment sequence — IT

1. Back up the production database and retain the V28 application revision. Confirm actual stored `shipments.created_at` values represent original record creation; do not substitute booking dates or rewrite timestamps. Review the preview count before go-live.
2. Review **server/sql/042_customer_compliance.sql** and **server/sql/051_shipment_reporting.sql**. SQL051 adds only `shipments.reporting_mode` with default `auto`. It performs no shipment/billing data reset. SQL042 creates compliance storage if missing.
3. From `server/`, with the SAME live DATABASE_URL/schema/runtime database role:

   ```sh
   node src/setup-v292.js
   ```

   If setup is missing, an authorised DBA runs the additive setup only:

   ```sh
   ALLOW_PRODUCTION_MIGRATIONS=true node src/setup-v292.js --apply
   node src/setup-v292.js
   ```

   The flag applies to that command only; do not enable it permanently. This script applies ONLY SQL042 + SQL051 in a transaction, uses a 5-second lock timeout, validates access with rolled-back temporary probes and prints total/pre-live shipment counts. It does not run historical seeds/backfills. If the runtime role cannot DDL, the DBA applies the two reviewed SQL files separately and ensures runtime privileges before rerunning the diagnostic.
4. **Apply SQL051 before deploying the server.** A missing reporting column now produces a visible setup error, not demo data. Deploy web and server together. Retain deployment timeout sufficient for the customer analysis client’s 120-second allowance.
5. Run the acceptance tests below in a test revision using disposable test records, then promote once passed. Do not reimport the live DXB/KWI CRM database. Do not run the entire historical migration/seed sequence as a shortcut.

## Acceptance gate

- Compare default counts to a database query using the cutoff above and reporting_mode <> 'live'. Verify one pre-cutoff and one post-cutoff shipment plus an exact-boundary test.
- Toggle Include pre-live: older jobs appear with labels and amounts remain unchanged. Restore one genuine old test fixture: it and its linked billing re-enter live reporting; reverse it and verify audit entries. An ordinary user must receive 403 on the override API.
- Test Delivered versus Partially Delivered, branch, date and combined text filters. Export the register and compare its complete row count to the filtered count. Go Last/First, type a page, change rows per page and filter again.
- Verify dashboard drill-down counts, billing totals and all report pages. Do not treat mixed invoices as reconciled: accounts must review them separately.
- Confirm actual reassignment email delivery and link after fresh login. Local tests use a mocked sender; API acceptance is not inbox delivery.
- Customer portal: test the provided 164-row XLSM, a real PDF and a phone scan, individually and mixed. Check a deliberately invalid HS code is flagged. Ensure the actual runtime cloud identity can infer; a DOC-AI-403 is still a permissions/configuration blocker outside the ZIP. Confirm the bundled Kuwait master is your approved version.
- Smoke-test unchanged HR approvals, shipment status email/signature and existing document access.

## Verification performed during preparation

- PostgreSQL-compatible isolated integration: SQL051 repeatability, cutoff boundary/timezone, admin-only override, reason validation, missing job, post-cutoff rejection, restore/reverse, unchanged job/status/sell/notes and transaction rollback when audit insertion fails.
- Actual frontend runtime in DOM tests: creation metadata mapping, pre-live toggle, linked invoice exclusion/restoration, exact-status and derived/date filters, matching exported count, First/Last/Go/page size, all-row printing and preserved source arrays.
- V29 CRM/account email and DOM regressions passed. Customer document tests passed: original XLSM 164 rows and combined workbook fixture 171 rows, no AI call; mocked PDF extraction safety and 403 handling passed. Six existing MFA/password-reset tests passed.
- No production database or service was accessed; no live email was sent. Real PDF/photo recognition, cloud permissions, production counts and device-specific visual appearance remain deployment acceptance checks, not locally proven results.

## Rollback

Redeploy the previous V28 revision. SQL042/051 are additive and can remain. V28 ignores reporting_mode. To reverse a classification while on V29.2, use Return to pre-live with a reason; do not delete the job. Reverting application code does not undo CRM assignments or other deliberate data edits. Audit entries retain the reporting changes.
