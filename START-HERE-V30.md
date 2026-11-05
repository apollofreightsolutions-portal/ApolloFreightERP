# Apollo Connected V30 — customer HS self-service and optional DXB help

Base: the customer's `(29)ApolloFreightERP-main 29.zip` uploaded 4 November 2026.
This full ZIP retains the supplied shipment/AWB, CRM, HR and billing code. Do not combine it with the separate QuickBooks test package.

## Deploy
1. Back up the application and database. Keep the current ZIP for rollback.
2. Apply **server/sql/054_customer_hs_help.sql** to the SAME production database/schema used by the app, using your normal controlled migration process. This adds one table/index; no existing data is reset. Existing customer_compliance_checks (SQL042) must already exist.
3. Deploy server and web together. No new packages, Graph permissions or email configuration are needed. Cache-busted web imports are included.
4. Verify a DXB ERP user's `branch_access` is DXB/Dubai/Both/All, `section_access` includes Customer or All (Shipment Requests also accepted), and account_status is Active. Admins can oversee the queue. KWI-only, CRM-only and employee-only sessions cannot use the team endpoints.
5. Test with a customer and authorised DXB account: check Excel, select an item, Ask Apollo, open DXB HS help, reply, then view/download the reply as that customer. Confirm another customer and a KWI-only user cannot read it.
6. PDF/photo extraction still needs your existing working cloud service permissions. V30 cannot grant those permissions. Test real documents in staging before promoting.

## Changes
- Check-only mode is the default on the new customer request form: booking/cargo inputs are hidden; uncheck the mode to book normally. No shipment is created by checking or asking for help.
- Original 95% threshold/scoring retained. Scores are text matches, not probabilities or customs approvals.
- All extracted rows shown in original order with original descriptions and source coordinates. Original invoice code and selected code stay separate.
- A short clarification prompt for an unqualified “cap/caps”; optional product-detail input on any row. It reruns the existing matcher without rewriting the original description. This is a targeted ambiguity aid, not a universal AI ambiguity detector.
- Keep invoice code or choose an eligible suggested code. Keeping a code does not turn warnings/restrictions into PASS. Restricted/prohibited suggestions cannot be automatically selected.
- Download Excel summary or copy results immediately; no Finish/approval gate. Incomplete extraction remains visibly flagged.
- Prevent programmatic extracted descriptions from clearing HS fields or showing a conflicting empty autocomplete list; do not prefill an unaccepted suggestion.
- Optional selected-item DXB help, with original uploaded documents and a snapshot of those items. A small in-app HS help button shows pending DXB requests / customer replies, refreshed every 30 seconds. No review emails are sent. Support contact: ops1@apollo-freight.com.
- DXB can enter a master-valid recommendation and/or comment. Restrictions accompany the recommendation. One atomic reply wins if colleagues respond concurrently; the other receives a refresh warning.
- Customer sees the reply and can copy or download recommendations. No mandatory resubmission/acceptance loop. Replies do not silently overwrite the customer's analysis or original invoice.

## Operational notes
- One help request per analysis prevents accidental duplicate submissions. For a genuinely new question/document revision, run a new analysis. Up to 100 recent requests per customer and 200 shared DXB requests are listed.
- Analysis download is available for the existing 24-hour analysis lifetime. Help snapshots and replies remain in the database independently. They retain original documents for staff review; include this table in your existing restricted backup/retention policy. No automatic purge is introduced.
- Original source files are preserved as base64 in server-side analysis storage and in submitted help snapshots. They are not included in ordinary analysis responses or other customers' inboxes. Ensure database storage/backup capacity is monitored.
- The configured Kuwait master is unchanged. A downloaded summary is not a replacement invoice or a customs ruling.
- Rollback: redeploy the prior ZIP; leave the additive table/data in place. Do not drop it or rerun seed/reset scripts.

## Verification boundaries
Automated local checks cover parsing, choices, clarification, XLSX output, source preservation, customer scoping, DXB authorization, duplicate submission/reply protection and UI interaction. Real cloud OCR, production database permissions and two-user production inbox delivery must be checked by IT after deployment; no live tenant was accessed during development.
