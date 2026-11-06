# Apollo Connected V31 — customer HS layout

Base: Apollo_Connected_V30_Customer_HS.zip delivered 4 November 2026.
This is a complete source ZIP, not a database backup. Deploy using your existing process. Do not replace secrets, environment configuration, databases, or uploaded files.

## Scope

- Customer New Shipment opens the existing complete booking form. The default check-only checkbox is removed.
- A separate customer navigation entry, HS Code Check, opens an upload-only checker. It cannot submit a shipment.
- HS results occupy the full form width, outside the booking step's two-column grid.
- Total, matched, clarification and flagged counts filter the results. Needs attention excludes matched items. Search is available.
- Twenty items per page with First/Previous/Next/Last controls. Selections survive filter/page changes; select visible, select all filtered, and clear selection are provided.
- Expand an item for invoice/alternative comparison, optional clarification and keep/use controls. Cap clarification offers wearable/container starting text, which the customer can edit before rechecking.
- Copy and Excel download still use the V30 results. Optional selected-item DXB help uses the same V30 backend. Replies remain under the existing HS help control. No email change.
- Standalone upload collapses after results arrive. Mobile results become vertical item cards; desktop actions remain accessible in sticky toolbars.
- Original logo files, shared stylesheets, fonts, colours, sidebar styling, and all backend code are unchanged. No new logo from the mockups is included.

## Files changed from V30

Replace these FOUR runtime files together:

1. web/app-runtime.js — one customer menu entry and its renderer only.
2. web/customer-compliance.js — separated checker, full-width responsive renderer and interaction state.
3. web/app.js — cache-version references for the two modified modules.
4. web/index.html — cache-version reference for app.js.

New documentation/test files (not needed to serve the app):

- START-HERE-V31.md
- V31-TEST-RESULTS.md
- tests/v31-hs-layout.cjs

No new npm dependencies for production. No new SQL migration for V31. The V30 migration server/sql/054_customer_hs_help.sql is still required if it has not already been applied. Do not reset the database or blindly rerun unrelated migrations.

## Deploy safely

1. Back up the currently deployed web files. If IT changed these four files after V30, merge those changes rather than overwriting them. This ZIP cannot contain unshared IT edits.
2. Deploy the four runtime files atomically, or deploy the full source through the existing pipeline. Keep live environment settings and user data.
3. Hard-refresh/reopen the portal so V31 cache references load. All four files must be from this version.
4. Sign in as a customer. Confirm New Shipment shows booking/delivery, documents, and cargo as before (the existing item section still appears after documents are selected).
5. Open HS Code Check. Upload a known Excel invoice; confirm no booking/cargo fields and no shipment submission. Test PDF separately where live document-service access is configured.
6. Check All/Matched/Needs attention/Clarification/Flagged filters, search, and page navigation. Select items on two pages and verify the total selection count.
7. Expand an item, recheck detail, retain invoice code or select an eligible alternative. Download Excel and compare selected codes to the page; source invoice must remain untouched.
8. Send selected items to Apollo; verify an authorised DXB team member can reply and the originating customer can read/download that response. Existing V30 help limits (one request per analysis) are unchanged.
9. Test a genuine booking with your normal controlled test procedure and verify the request reaches operations. Do not bulk-create production test shipments.

Rollback: restore the previous FOUR web files together. No V31 database rollback is needed. Keep migration 054 and existing review data.

## Boundaries

This update does not alter HS scoring, master data, the 95% threshold, AI/OCR provider permissions, shipment approval rules, CRM, HR, billing, mail configuration or cloud sizing. It does not resolve a provider-side DOC-AI-403. Matched is a text-match result, not a customs approval. Changing selected codes changes the summary, not the customer's original invoice.
