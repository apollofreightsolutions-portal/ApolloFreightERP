# V32 verification — 6 November 2026

## Revised station-account build

- tests/v32-station-accounts.cjs: actual PostgreSQL/PGlite SQL 057 migration, duplicate names per station, globally unique codes, unchanged old notes/job numbers, missing-local-account denial, local-code binding, blocked new/existing job writes/deletes, document/POD/history/invoice/charge/manifest guards, unblock, station-user permissions and read-only shared AWB retrieval.
- The same test executes the ACTUAL status-by-AWB Express route from server/src/index.js: Dubai updates successfully while blocked Kuwait remains unchanged; Kuwait's own request fails. A denied synchronization target does not abort the active station transaction.
- SQL 057 preflight rejection for old cross-station blocks is tested.
- tests/v32-station-ui.cjs executes extracted production functions: receiving-station account selection; original source object, weight, dimensions, mode, CBM and AWB preserved; new local job number and cleared old TCN; missing local customer code stays blank; duplicate and block checks are local.
- Existing 46 server regression tests still pass, including concurrent AWB/job numbering. AI tests updated to enforce independent local-account blocking rather than legacy multi-branch status flags.
- No new visual layout was introduced in the station changes. Tests are local/synthetic; IT must test its current database copy before production.

## Passed locally

- Existing server tests: 46/46. Updated only the stale customer-token test fixture to match V31 password-version authentication; production authentication was not changed.
- tests/v32-integration.cjs: actual Express routes with a local PostgreSQL-compatible PGlite engine. Seeded over 1,300 CRM accounts; verified older Sun and Sand KWI lookup does not return Cool Station Plus or DXB. Checked staff isolation, inactive users, single-use/expired/stale confirmations, independent local block/unblock and unchanged overdue flags.
- Same integration suite: 90% threshold, valid 92% master match, bulk suggested-code acceptance, unsafe/low-confidence/clarification skips, and cross-customer analysis isolation.
- OpenAI adapter contract: request model and store:false, parsed text, missing-key/auth/error handling. Network provider mocked; no live OpenAI success claim.
- tests/v32-hs-ui.cjs: 65 synthetic rows; separate flagged/clarification lists, cross-page selection, 32 eligible bulk suggestions, bulk keep, count updates and booking-form isolation.
- tests/v31-hs-layout.cjs: retained layout regression, updated for separate clarification list and confirmation response. Pagination, escaping, clarification draft persistence, authentication, reset and full-width placement.
- tests/v32-ai-ui.cjs: authenticated account detail, branch prompt, prepare-before-confirm, failed-action messaging and stale account-reference reset.
- Browser: desktop and 390px mobile-width HS fixture; selected all filtered rows and verified desktop bulk-action completion. Original theme assets reused.

## Test dependencies (QA only)

Existing server dependencies, jsdom, and @electric-sql/pglite. These QA packages are NOT added to production dependencies or shipped as node_modules. Tests in tests/ can be run with a QA NODE_PATH containing jsdom and PGlite; run node --test tests/v32-integration.cjs and node tests/v32-hs-ui.cjs, node tests/v31-hs-layout.cjs, node tests/v32-ai-ui.cjs. Existing server tests use node --test server/test/*.test.js.

## Must still be verified by IT

Live OpenAI credentials/network/billing; SQL 056 and 057 after the read-only preflight on a database copy; real account lookup and branch behavior; fresh analysis of the customer's full Excel workbook against the deployed Kuwait master; existing PDF/image extraction credentials; actual customer/DXB notifications and end-to-end booking. No production deployment, customer status change, email send or database migration was performed during this build.

Final combined local run: 54 checks passed, zero failures (existing server regressions plus all seven V32/retained HS test files).

## Full V31/V32 AWB parity check
- Corrected the unnecessary local-master overwrite of fetched customer email/mobile/address. Only local account code changes during prefill; the fetched shipment customer label and contact snapshot are retained.
- tests/v32-awb-parity.cjs uses recorded original V31 source functions in tests/fixtures/v31-awb-functions.json and the actual revised source. It compares 132 record fields across 96 scenarios (DXB/KWI, Import/Export, LE/AE/SI, existing/new dialog, active/blocked/missing/ambiguous local accounts).
- Every fetched-record property must equal V31 except customerCode. Original source records must remain unchanged. Includes shipper/consignee, pickup/delivery, customer contacts, billing parties, cargo rows, transport/driver, references, stored document metadata and POD split data.
- The original lookup entry function, shipment/form/cargo builders, collectFormValues, shipmentMetaNotes, createShipment and non-customer form binders are source-identical. Customer autofill remains station-scoped for explicit manual selection; it does not run an automatic contact overwrite at fetch.
- These are local source/differential tests with simulated records and stubbed dialog hooks, not a live browser/cloud storage or live database deployment test. No new attachment-copy behaviour is claimed or introduced.
