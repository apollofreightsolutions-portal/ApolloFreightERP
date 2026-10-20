# Apollo Connected V26 — Excel checks and CRM management review

Release: 20 October 2026. Built from the newly supplied `(25)ApolloFreightERP-main (25).zip`, not from the older V24.1 source. This complete ZIP supersedes the earlier held V26 and Excel-only V26.1 packages. Keep the mobile application separate.

## Customer Excel fix

- Accept XLS, XLSX and XLSM in the customer picker, HS analysis and shipment attachment endpoint. Macros are never executed by the reader.
- Read recognizable single-workbook invoice tables directly, including the preferred 12-digit HS column, instead of relying on AI to reproduce each row.
- Test invoice BFLKWT-2026-00261.xlsm: all 164 lines, 86 distinct HS codes and 552 units preserved; invoice number and gross weight 304.21 kg extracted. Existing master/matching thresholds produce 140 attention flags and 24 passes. Review flags include vague descriptions, not just genuinely mismatched classifications.
- Remove the silent 60-item cut-off. More than 1,500 items, oversized worksheets, incomplete AI responses or omitted known Excel rows produce an explicit error rather than a partial completed check.
- Show worksheet row and master description in review cards. Describe match percentages honestly as text-match scores, not classification probabilities. No automatic HS replacement.
- Existing PDF/image and unfamiliar/mixed-document analysis uses Google AI. Correct the global Vertex hostname and expose useful service error references. Recognized single Excel invoices work without calling Google AI. Verify other shipment/packing fields manually; absent dimensions are not inferred.

## CRM additions

1. **Opportunities / Pipeline:** Salesperson selector uses the opportunity owner (account owner as fallback). Board counts, amounts and lost-opportunity list follow the filter. Existing CSV export also respects it. Export permission is unchanged.
2. **Sales Visits:** Salesperson selector uses the original `created_by` user, showing who actually logged the visit even after account reassignment. Clearing the selector restores all records the logged-in user is already permitted to view.
3. **Comments / Review:** Available on opportunity cards, lost opportunities and visit rows. Opens the record's dated review history. Management can enter a comment and optional follow-up date, then click **Send comment**.
4. Sending saves an append-only comment and creates an Open CRM follow-up in one database statement. The salesperson sees the task in the existing Follow-ups queue/dashboard and can read the comment on the record. Existing task completion remains available. Ordinary sales users read management comments; only authorized management users send them.
5. Email goes through the existing central mail sender to the salesperson's configured company email. The interface distinguishes provider acceptance from failure. If mail fails or the email address is missing, the comment and in-app follow-up remain saved; the sender is explicitly told email was not sent. There is no automatic email retry in this release.
6. The recipient is resolved on the server, not accepted from the browser. For historic visits or reassigned opportunities, a previous salesperson who no longer has access will not receive account details. The current active account owner is used instead and is shown in the review window. If no authorized active recipient exists, assign one first.

## Permissions and preserved behavior

- All CRM list, review, filter and export endpoints retain the existing account-access scope. Selecting another salesperson does not grant access to their accounts.
- Review-sending uses existing management capabilities: CRM Admin, Manage Assignments, or View Team Reports; an application Admin has those capabilities automatically. These capabilities do not broaden account access.
- HR approvals, HR notifications, shipment emails/signatures, CRM account/visit/opportunity editing, stage handling, branch edits from the uploaded source, and other existing features are preserved.
- No new database tables, migrations, dependencies, credentials or permissions required. Review history uses the existing `crm_audit_log`; in-app delivery uses `crm_tasks`. The standard CRM and `customer_compliance_checks` tables must already exist.

## IT deployment

1. Retain the current working revision for rollback. Deploy this backend and frontend together through the existing deployment process. Use this ZIP only; do not combine it with the earlier V26/V26.1 archives.
2. Keep current database, storage and mail environment settings unchanged. No database migration is needed for this release. Browser asset version identifiers were updated; reload the page after deployment.
3. Customer acceptance: upload the original BFLKWT-2026-00261.xlsm alone with Kuwait selected. Expect 164 checked, 140 attention and 24 pass. Confirm the Trolley Bag item appears at worksheet row 144 and the last item at row 173 is included. Submit for Apollo Review and confirm the attachment saves.
4. Management CRM acceptance: select a salesperson on Opportunities and Visits; confirm lists and pipeline totals follow the filter and clearing restores the permitted view. Visits are filtered by the person who logged them.
5. Send one opportunity comment and one visit comment with a follow-up date. Confirm history remains on each record; log in as the receiving salesperson and verify the Follow-ups tasks and company email delivery. If mail is not sent, check the existing sender configuration and recipient's user email; do not resend the same comment repeatedly, as that creates another task.
6. Check an ordinary salesperson cannot access another person's account/review by URL. Check one existing HR approval and a shipment notification as normal deployment smoke tests.

Rollback: restore the previous backend/frontend revision. No schema rollback is needed. New review comments remain in the audit log and tasks remain in Follow-ups.

## Changed files compared with the uploaded working V25

Modified:
- `server/src/customer-compliance.js` — Excel/direct analysis, limits, performance, Vertex errors.
- `server/src/index.js` — XLSM attachment allowlist and injection of existing mail sender into CRM only.
- `server/src/crm.js` — scoped salesperson filtering, review-module registration, filtered opportunity export.
- `web/customer-compliance.js` — XLSM upload and clearer review results.
- `web/app-runtime.js` — customer XLSM picker and MIME mapping only.
- `web/crm-portal.js` — salesperson selectors and record review/comments interface.
- `web/app.js` and `web/index.html` — asset version identifiers only.

Added:
- `server/src/compliance-spreadsheet.js`
- `server/src/crm-reviews.js`
- This deployment note and verification files at ZIP root.

Every other original project file is byte-identical to the supplied V25. The original Excel customer document and credentials are not bundled.

## Verification limits

Local tests ran the actual customer workbook through the HTTP analysis route and browser analysis function. CRM tests ran the actual Express routes and frontend functions, covering filtered results/export, permission boundaries, comment persistence payloads, task creation, recipient resolution, reassignment, date/text validation, HTML escaping and mail failure handling. Database, mail and DOM adapters were simulated. No real email was sent. Production PostgreSQL/storage, Google AI, customer login and visual browser rendering were not tested here. IT must complete the acceptance checks above after deployment. Full logs and repeatable test scripts are included.
