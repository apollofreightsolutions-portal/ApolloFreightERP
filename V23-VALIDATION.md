# Version 23 validation

## Passed locally
- 24 workflow tests against the PostgreSQL engine in PGlite: routing, transactional outbox, separate permissions, supervisor vs final approval, self-approval prevention, unrelated-user privacy, forwarding, revoked reviewer access, required comments, return/resubmit, version conflicts, no-supervisor routing, duplicate approvals, live account deactivation, insufficient-balance rollback, failed-mail retention/retry, recipient/link checks and migration rerun safety.
- 5 DOM test scenarios: login requirement, no action on opening an email link, Forward selection and explicit POST/PUT confirmation with version, escaped user text, returned-request response form, and User Management settings.
- 12 Excel parser/HTTP/frontend checks, including real XLS and XLSX, independently generated XLSX, preserved HS leading zeros and empty columns, cached formulas, multi-sheet data, corrupt/oversized files, authentication, and mixed Excel/PDF.
- Microsoft Graph configuration and send-flow checks with no SMTP or mailbox password: application-client-credentials request, correct sender endpoint and disabled-mail rejection.
- Clean production dependency installation; existing server syntax checks and new/edited JavaScript syntax checks.

The relevant existing migrations and new 047 migration were executed in an isolated database fixture. Historical maintenance import 031 requires a live legacy schema and was excluded; it is unchanged. Use the supplied isolated migration script rather than replaying historical migrations.

Live Microsoft delivery and Gemini document extraction were simulated. No actual staff/customer messages, production data changes, Microsoft permissions or deployment actions were performed. DOM tests are not a full browser visual audit. IT must run the acceptance checks in V23-IT-SETUP.md after deployment.
