# V33.2 — Excel invoice reader fix

This full ZIP includes all V33.1 changes, including manual alternative selection at any score and the standalone Operations HS Code Check tab. No UI redesign or changes to AWB fetching, jobs, station accounts, CRM, HR, AI chat, or existing permissions.

## Deployment

If V33.1 is already deployed, replace ONLY server/src/compliance-spreadsheet.js and restart/redeploy the backend. No new SQL, dependency or frontend changes in V33.2. Additional changed files are tests and this note.

If upgrading from the uploaded (33) source or an earlier version, deploy the full V33.2 package and follow START-HERE-V33.1.md, including migration 058. Keep production secrets, environment settings and data. Back up first. Test the supplied KRO invoice after deployment in both Customer and Operations HS Code Check.

## Reader changes

- Recognises HSCODE-12 and full-length aliases; prioritises an explicitly Kuwait-labelled code or the full-length generic code over its short form. Other-country columns are not substituted for Kuwait codes.
- Recovers full numeric codes when Excel displays scientific notation; preserves formatted leading zeros.
- Ignores stale values underneath merged cells and stops item extraction at totals, preventing footer text becoming products.
- Recognises structured loading/pallet summaries without unnecessarily sending the whole workbook to AI.
- Uses explicitly named invoice sheets as the primary source. Linked packing/internal-table duplicates are excluded with visible warnings. Unlinked supporting items remain in the results; unknown layouts still require AI rather than silently declaring completeness.
- Reports conflicting source codes. Original documents, descriptions, and scores are not rewritten.

## Actual file verification

KRO-106389.xlsx: all five Custom Invoice product rows, source rows 5–9, read with 330300100001. Supporting-sheet conflict 33073000 remains visible. Verified upload, persisted results and Excel download through both Customer and Operations routes with AI credentials/project disabled locally. The customer's invoice is not included in this release archive.

65 automated checks passed, including the existing AWB/job/account/permissions regression suite and new extraction cases. No live deployment or live provider test performed.

## Separate service issue — not fixed by this ZIP

DOC-AI-403 is a deployed AI-service access denial. This fix avoids that service for the supplied readable Excel layout, but PDF/images and unknown Excel layouts can still need it. IT must inspect the existing backend log for the provider error and correct the configured service account/project/API/model access. Do not broaden permissions blindly or share secret keys. No cloud IAM/configuration changes were made by this release.

## Rollback

From V33.2 to V33.1: restore the prior server/src/compliance-spreadsheet.js and restart the backend. No database rollback or record deletion is necessary.
