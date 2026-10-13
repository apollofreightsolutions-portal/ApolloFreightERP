# Apollo Connected (23) — IT handover

Base: the live `ApolloFreightERP-main (22).zip` supplied on 13 October 2026.
IT's shipment/AWB changes, `046_allow_shared_airway_bill_numbers.sql`, and migration-runner changes are retained.
The V21 Excel fix was absent from this live ZIP. Its tested reader and SheetJS dependency have been restored.

## 1. Email: no mailbox password is needed

The existing `server/src/microsoft-graph-mail.js` already supports Microsoft Graph application authentication. Google Cloud Run hosts the application; the mailbox remains in Microsoft 365. Do not connect it to Gmail or provide its login password.

Use a dedicated Microsoft Entra app registration for Apollo Connected mail. The current code supports an app client secret (not the mailbox password). A Microsoft 365/Exchange administrator should:

1. Register a single-tenant application and create a time-limited app client secret. Record expiry and arrange rotation.
2. Register its service principal in Exchange Online and assign `Application Mail.Send` using Exchange Application RBAC, scoped to the exact no-reply mailbox only.
3. Do not also grant unscoped tenant-wide Entra `Mail.Send` or full-mailbox permissions: grants are additive and an unscoped grant defeats the intended restriction. No mail-reading permission is required for sending.
4. Test the Exchange application authorization against the allowed mailbox and against a different mailbox; the second must be out of scope. Then verify an actual Graph send under that app identity. Confirm the mailbox's exact primary address before setting MAIL_FROM.
5. Store the app secret in Google Secret Manager. Give the Cloud Run runtime service account Secret Accessor only on that secret and reference a pinned version as `M365_CLIENT_SECRET`. No secrets belong in the ZIP, repository, email, or chat.

Cloud Run configuration for the existing code:

| Variable | Value |
|---|---|
| MAIL_SEND_ENABLED | `true` |
| MAIL_PROVIDER | `microsoft_graph` |
| M365_TENANT_ID | Tenant ID from Entra |
| M365_CLIENT_ID | Application/client ID from Entra |
| M365_CLIENT_SECRET | Secret Manager reference to the application secret value |
| MAIL_FROM | Exact existing no-reply Microsoft 365 mailbox address (expected `noreply@apollo-freight.com`; verify) |
| APP_PUBLIC_URL | `https://connected.apollo-freight.com` |

SMTP_PASSWORD and the mailbox's normal password are not needed in Graph mode. This release does not configure your tenant or cloud secrets. Protect deployment and secret-administration access too: a person able to change the running application may be able to exercise its app credential. Restrict the app to the sender mailbox.

Primary references:
- Microsoft app-only authentication: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow
- Exchange Application RBAC and additive permissions: https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac
- Graph sendMail: https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0
- Cloud Run Secret Manager configuration: https://cloud.google.com/run/docs/configuring/services/secrets

## 2. Deploy HR workflow

1. Back up the database and retain the current revision. Build the full ZIP normally (`npm ci` is required for the restored Excel dependency).
2. On the isolated migration job, use the current database and `ALLOW_PRODUCTION_MIGRATIONS=true`; run `node src/migrate-hr-approvals.js`. From a repository checkout, use `node server/src/migrate-hr-approvals.js`. It applies only the new additive `047` migration and uses the existing migration advisory lock. It does not replay historical imports.
3. Deploy the new application revision after the migration succeeds. Keep normal request-serving auto-migrations off according to existing deployment practice.
4. In Company User Management, edit an existing user and follow **Configure Leave Approver, Management Final Approver and assigned supervisor**. The same setup link appears in Employee profiles. Only an active ERP Admin can save these settings.
5. Enable HR Portal access and register a valid account email for each approver. Give Khaldoun's own login **Management Final Approver**. The address `management@apollo-freight.com` receives management notifications but does not itself grant login or approval authority. No account is automatically promoted.
6. Give selected supervisors **Leave Approver**, without HR Admin. Assign the appropriate supervisor to each employee. Save new user accounts before configuring leave settings. The old free-text Reporting Manager field is descriptive; the new account assignment controls leave routing.
7. Users sign in through Employee/HR Login. My Leave now links to **My requests / Assigned leave review inbox**. Existing HR review buttons open the secure review page. Links in emails return to the requested page after Employee login, in the same tab.

Workflow: submitted request stays Pending → supervisor recommends approval → management final approval → Approved and leave deduction. Both supervisor and management receive submission notifications; employees also receive updates. Forward requires a comment and another authorised approver, resets the supervisor stage, and never removes final management approval. The prior supervisor loses access. Deny and Return require comments. No self-approval and no one person performing both approval stages.

An employee can respond to a returned request and replace its supporting document, then resubmit; supervisor routing is recalculated and review restarts. To change dates/type, cancel and submit a new request through the existing validated application form. Employee-request cancellation, extensions and approved-leave cancellation retain existing rules. New extensions are routed through the same submission trigger.

Existing pending requests default to Management review; they are not automatically redistributed and no historical email blast is sent. Management may Forward them to a supervisor. New supervisor assignments apply to new/resubmitted requests. To reroute a pending request, use Forward. Old broad leave delegations do not bypass these new assigned-review/final-approval checks.

## 3. Reliable notification dispatch on Cloud Run

Each leave event creates durable outbox rows in the same database transaction. Failed attempts are retried with backoff, up to eight attempts; failures remain visible. Dispatch uses the same central Microsoft Graph/SMTP helper as shipment-status email.

Cloud Run instances may suspend background CPU, so do not rely only on the one-minute in-process timer. Configure Cloud Scheduler every minute to POST `{}` to:

`https://connected.apollo-freight.com/api/hr/workflow/mail/drain`

Set a cryptographically random `HR_MAIL_JOB_SECRET` of at least 32 characters via Secret Manager on Cloud Run; set the same value in the scheduler's `x-hr-mail-secret` header. Restrict who can view/edit the scheduler job and do not log this header. Use a 180-second attempt deadline. If Cloud Run also requires IAM invocation, retain the required service-account OIDC authorization in addition to this header. The endpoint is POST-only and denies missing/wrong secrets.

User Management → Leave permissions → Email delivery shows recent queue states and central mail configuration. **Retry failed / Send due emails** is available to an ERP Admin. Missing recipient email addresses are visible failures, not silently skipped. Delivery is at least once; an interruption after provider acceptance can cause a repeated notification, but never a repeated approval/deduction. Microsoft acceptance does not prove inbox delivery; use Exchange message trace if needed.

## 4. Acceptance checks after configuration

- Send one shipment-status update using the existing button; check sender, intended customer recipient and received email. No shipment code change was necessary for password-free Graph sending.
- Submit a test employee request with a supervisor: both management and supervisor receive emails.
- Supervisor approves: still Pending, no deduction. Management confirms: Approved, exactly one ledger deduction.
- Try self-approval, an unrelated account, an old link and a repeat confirmation: blocked appropriately.
- Forward: new supervisor can review, previous supervisor cannot. Return with comments: employee responds and resubmits.
- Temporarily disable mail sending in a test environment: request remains saved, queue records the failure; restore and retry.
- Recheck .xls and .xlsx customer compliance upload after rebuilding.

Local tests use synthetic accounts and workbooks, a PostgreSQL-compatible PGlite engine for SQL, and simulated Microsoft delivery. Production Microsoft permissions, credentials, email receipt and Google Cloud execution must be verified by IT; no real emails were sent during development.
