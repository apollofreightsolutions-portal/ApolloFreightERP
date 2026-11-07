# Apollo Connected V33.1 — HS manual choices and Operations checker

Built from the supplied (33)ApolloFreightERP-main (33).zip, not an older release.
Source SHA256: b16f090255473558e22e5d5174287cc35df8ed9998276cc572a91b891ea4d772

## Changes

- Customer and Operations checkers offer Use alternative HS code for every available saved master-list suggestion, regardless of confidence. Single and bulk actions are supported.
- Confidence stays visible. Explicit selection is recorded separately from an automatic match; restrictions/prohibitions and unresolved clarification warnings remain visible and do not prevent exporting the selected code. Selection is not customs approval.
- Download Excel and Copy results use the chosen codes. Excel retains original descriptions/codes, scores and choice information. The original uploaded invoice is never rewritten.
- Operations has a standalone HS Code Check tab after Shipment / Airway. It uses the same upload, analysis, details, clarification, filtering, bulk choice, optional DXB help and download functions; it does not create a shipment.
- Operations uploads/help requests use separate tables. Staff access is checked on the server; each uploader can access their own checks. Authorized DXB reviewers can handle submitted help requests. Operations users can view replies through My HS help requests.
- Existing Admin/All or Shipment / Airway access includes the tab; HS Code Check can also be assigned explicitly in section access.
- Original theme/assets preserved. No changes to AWB fetching, cargo/job parameters, station account logic, CRM, AI provider, or the supplied Maintenance implementation.

## IT deployment — important

1. Back up the current application and database. Test in staging first.
2. Apply ONLY the new server/sql/058_operations_hs_checks.sql to the same database used by the backend. Existing migrations 042 and 054 must already be present. Use your normal migration identity; ensure the runtime database role has the same required table privileges on the two new tables as on the existing HS tables. This migration creates empty internal tables; it does not reset customer/job data.
3. Deploy the backend and web files below together, preserving production environment variables, secrets and uploaded documents. Restart/redeploy the backend and deploy the web bundle. No package dependency changes.
4. Reload the browser to obtain the new cache version. Confirm HS Code Check appears for an authorized Operations user.
5. Smoke test: upload Excel, choose an alternative below 90%, download Excel and confirm the chosen code. Test a restricted item: its selected code exports but its warning remains. Test optional DXB help and reply. Check customer HS and an existing AWB fetch.

### Exact runtime file list: 8 replacements + 2 new files

Replace:
- server/src/customer-compliance.js
- server/src/customer-hs-help.js
- server/src/index.js
- web/app-runtime.js
- web/app.js
- web/index.html
- web/customer-compliance.js
- web/customer-hs-help.js

Add:
- server/src/operations-hs.js
- server/sql/058_operations_hs_checks.sql

Additional changes are this release note and five test files (three updated, two new). The complete source ZIP includes unchanged source files for normal deployment.

## Verification

60 automated checks passed locally, including database-backed Excel upload/selection/export, 82% and 0% manual choices, ownership/role isolation, optional help/replies, customer regression tests, and existing AWB parity checks (96 scenarios, 132 fields each). Local browser verification confirmed the 82% selection button and updated result count. Live credentials/services and production deployment were not exercised.

## Rollback

Restore the eight replaced files from your pre-deployment application backup and redeploy. The two new tables may remain unused; do not drop them if staff have uploaded checks or requested help. No existing shipment/account tables are migrated by this release.
