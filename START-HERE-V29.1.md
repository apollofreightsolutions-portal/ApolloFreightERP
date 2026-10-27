# V29.1 — customer document follow-up, full deployment package

This supersedes Apollo_Connected_V29_FINAL.zip. It retains ALL V29 CRM changes, including single/bulk reassignment emails. Deploy this full package instead, not both packages. Read START-HERE-V29.md for the required database setup, preservation of imported accounts and rollback guidance.

## Additional document corrections

- Each uploaded file is extracted separately. A recognised Excel workbook remains deterministic when another Excel/PDF/image is attached. Rows are not deduplicated or merged away by AI.
- Every extracted row is checked against the bundled server/data/kuwait-hs-master-2025.json. Unknown/missing/invalid HS codes and weak description matches are attention items. Restrictions require review; prohibitions are blocked. No automatic conversion of letters embedded in an HS code into an apparently valid code. Arabic digit forms are normalised.
- Attention feedback identifies the source filename, worksheet/row or AI-reported page.
- PDF/image extraction must report completeness AND a source row count equal to the extracted row count. Otherwise saved results require review even when all detected codes match. Accepting suggested codes does not remove this document-level review requirement. These are safety checks, not proof that AI can never omit a row.
- A file yielding no item rows or a truncated AI response fails the whole check rather than allowing partial clearance. AI service denial remains an error; it is not disguised as a successful check.
- Multiple documents may repeat invoice/packing-list lines: retain those rows for checking, but do not sum or autofill combined packing figures. Shipment metadata is from the first document and must be reviewed.
- Customer analysis timeout accommodates up to three sequential provider requests (120 seconds client timeout). Configure the deployment/proxy timeout accordingly. Existing limits remain: three files, 10 MB total, up to 500 spreadsheet rows per worksheet, 1,500 extracted items total. Split larger files; there is no silent truncation.

## Checks completed locally

- Existing CRM/reassignment mail tests and the real 164-row XLSM analysis passed again.
- Added fixtures against the actual bundled master: exact match, unknown, missing, invalid format, description mismatch, restricted and prohibited codes all returned their expected statuses.
- Actual XLSM plus a seven-row fixture: 171 rows checked without any AI/network call.
- Mocked PDF responses: mixed Excel+PDF kept all rows; incomplete and count-mismatched extraction stayed REVIEW_REQUIRED; empty file rejected; 403 remained a clear service error. No live Google credential was available for an actual PDF/photo recognition test.

## Mandatory go-live gate

1. Back up the live database. Run the targeted customer-compliance-setup.js diagnostic/SQL042 repair described in START-HERE-V29.md against the actual runtime database and role. Do not reset/reimport the CRM database.
2. Confirm that the bundled Kuwait master is the business-approved list. This update does not change tariff content or claim it is the latest customs publication.
3. On a test revision, use a representative real Excel, PDF and phone scan, individually and together. Manually count item rows and deliberately include a known invalid HS code. Verify the original code and its row appear in attention feedback. Test restricted/prohibited examples using the approved master.
4. Resolve any DOC-AI-403 with the actual runtime service account; the ZIP cannot grant cloud permissions. No new Microsoft permissions are required.
5. Confirm customer isolation, saved analysis retrieval, submission for review, and that incomplete extraction cannot show Ready to Book. Smoke-test CRM assignment email and HR approvals.

Do not promote document checking to customers until these live checks pass. The local tests do not certify production permissions, inbox delivery, real OCR accuracy or customs classification correctness.
