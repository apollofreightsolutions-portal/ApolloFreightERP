# V24 IT handoff

This build uses the supplied live `(23)ApolloFreightERP-main (23).zip` as its base. Its source files matched the previously prepared V23. Issued at the owner's request for IT handoff. The email preview was supplied separately; confirm its appearance with the owner during the test-email check before customer rollout. Local checks passed; live deployment and delivery still require the checks below.

## Before deployment

1. Back up the live database and retain the current Cloud Run revision/ZIP. Test on a non-production database copy first. Do not paste secrets into chat or commit them to source.
2. Use the existing database and Microsoft Graph configuration. No Entra permission, sender mailbox, client secret, Reply-To mailbox or Graph scope change is required for V24. Keep the existing noreply-only Exchange Application RBAC restriction. Do not re-grant tenant-wide Graph Mail.Send.
3. Run the **isolated HR migration**, using the same DATABASE_URL as the deployed application. From the project root:

   ```sh
   ALLOW_PRODUCTION_MIGRATIONS=true node server/src/migrate-hr-approvals.js
   ```

   From the `server` directory use `node src/migrate-hr-approvals.js` with the same migration-job environment. Set the production-approval flag only on the reviewed migration job, not as a reason to enable automatic full migrations on the live service.

   The runner applies only `047_hr_approval_workflow.sql` and `048_hr_branch_override.sql`. Both are additive/rerunnable; they preserve requests, balances, audits and queued email. 048 adds `management_override` (default false) and strengthens new/resubmitted request routing. No account is promoted automatically. Do not run all historical SQL files for this update.
4. Confirm the runner reports both 047 and 048 applied. A missing-table/column message is a deployment prerequisite failure, not an instruction to reset the database.
5. Deploy the approved final V24 source. Build from the included Dockerfile: it now copies `server/assets` for the inline email logo. For another build process, include that directory unchanged. Dependencies and the lockfile are unchanged from the live V23 ZIP.
6. Keep the existing mail provider, Secret Manager references, scheduler and APP_PUBLIC_URL. The HR outbox still needs the existing minute-by-minute drain job on Cloud Run (see V23-IT-SETUP.md). Do not create a duplicate scheduler. Emails accepted by Graph still require an inbox/spam-folder check.

## Configure users in one window

In ERP User Management, Create/Edit User now contains the leave controls. One Save writes the user account and leave settings in one database transaction. A failed validation rolls back both, and the dialog stays open.

- Supervisors: active account, valid email, HR Portal access, **one specific Branch Access**, and Leave Approver checked. Do not give HR Admin access simply to approve leave; HR Admin has separate broader HR access.
- Employees: choose their branch and their supervisor from that branch. The supervisor must be created/enabled first. `All`/`Both` cannot be used as a supervisor's own branch.
- Khaldoun's actual personal login: enable HR Portal access, Management Final Approver and Management Override. Do not assume the management email recipient is the login; the administrator must select the correct user. Override is not granted to every admin automatically.
- Management Final Approver works across branches. Management Override allows final approval while a supervisor review is pending, or after rejection/return. It requires an explicit action, comment and confirmation. It cannot approve the user's own request, re-approve an already approved/cancelled request, ignore insufficient balance/document requirements, or bypass other ERP permissions.
- Normal routing remains supervisor recommendation then management final approval. If there is no eligible same-branch supervisor, new/resubmitted requests go directly to management. Existing pending requests keep their assignment; management can use Forward to an eligible approver in the employee's branch.
- Branch changes immediately restrict supervisor request/document access and future notification delivery. Reassign a supervisor's employees and forward their pending requests before changing that supervisor's branch/access or deleting them. Remove final-approver permission before deleting a final approver; the last active final approver cannot be removed without a replacement.
- The older leave-settings screen remains compatible for administration/email queue inspection, but is no longer required for a new user's leave permissions.

## Notification and signature behaviour

- Submission queues messages to management@apollo-freight.com, the assigned supervisor (if eligible), and the employee. Management does not have to wait for supervisor approval to receive the submission notification.
- Decisions, including overrides, queue notifications. The audit records who acted and the override comment. Forwarded-away or no-longer-eligible supervisors do not receive queued private details.
- The central Graph sender and no-reply address are unchanged. Messages do not set Reply-To. The approved original logo is attached inline with a CID; remote image fetching is not required. Email clients may still hide images. Text buttons remain readable/clickable.
- Shipment emails use a company signature, FZCO wording, NAFL/insurance footer, shipment/tracking details and the no-reply/contact-your-representative note. Internal shipment-history notes are intentionally omitted, not keyword-filtered. Original notes remain in the database.
- Tracking and Customer Portal links are the existing signature-builder URLs (`https://www.apollo-freight.com/tracking.html` and `/customer.html`); no internal ERP endpoint is exposed. Verify these destinations in your live smoke test.
- HR emails use a separate confidentiality/no-reply footer and authenticated action links. Opening a link never approves or denies a request. HR emails do not include freight-insurance/NAFL wording.

## Required live smoke test (use test accounts/data)

1. Create a supervisor and employee in the same branch using the combined form; reopen both and verify values persisted. Verify a supervisor in another branch cannot be assigned or forwarded the request.
2. Submit a small leave request. Confirm emails arrive at the employee, supervisor and management. Confirm the supervisor sees only assigned own-branch requests.
3. Supervisor recommends approval: request stays Pending/Management and no leave is deducted. Management approves: one ledger deduction only. Refresh/repeat the action: no second deduction.
4. Test Forward, Return with comments and employee resubmission. Verify original and new supervisor access changes correctly.
5. With the owner's explicitly configured override account, approve before supervisor review, then separately test overturning a supervisor rejection. Confirm mandatory comment, audit and notifications. Verify another final approver without Override cannot bypass the supervisor.
6. Send a shipment update to a test customer address. Check desktop Outlook and iPhone: original logo, FZCO wording, working buttons, no internal technical note, no personal staff signature, no Reply-To.
7. Customer Portal: upload an unprotected `.xlsx` and legacy `.xls` invoice/packing sheet and run HS checks. Verify extracted descriptions/HS codes/quantities. Also test PDF plus Excel together. Existing analysis limits remain: up to three files, 10 MB combined, up to 10 worksheets/500 rows per sheet with text limits; AI output must still be reviewed. Encrypted or corrupt Excel is not supported.

## Reversible controls / rollback

- Disable Management Override in User Management to remove that capability immediately; existing audit/approved decisions remain intact.
- To stop application mail without changing the tenant, set MAIL_SEND_ENABLED=false. HR requests still save and notifications remain queued/retried; use the queue retry action after restoring mail if entries reach Failed. Shipment mail sends will report disabled.
- IT may roll application traffic back to the retained V23 revision if necessary. Do **not** drop the new tables/columns or erase audit/ledger entries. The additive schema is compatible with V23, but V23 does not contain the new same-branch enforcement or override UI. Review access before returning to that older behaviour.
- A rollback does not undo approvals already made. Any leave correction must be a deliberate HR adjustment with an audit, not deletion/re-running approval SQL.
- None of these steps changes Microsoft tenant permissions. Credential revocation/Exchange role removal remains a separate Microsoft-admin control if needed.

Mobile app work is separate and is not included in V24.
