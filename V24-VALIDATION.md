# V24 local validation

Base: user's fresh live V23 ZIP. Archive integrity verified, path traversal/symlinks rejected before extraction; all 187 source files matched the previously prepared V23. No live database, Microsoft tenant, mailbox or production service was changed.

## Passed local checks

- PostgreSQL-compatible PGlite engine: full application schema fixture (excluding seed and historical maintenance-import scripts), including migrations 047/048; additive migration reruns preserve decisions.
- 32 workflow groups: routing/outbox, supervisor then management approval, self-approval rejection, permission checks, stale versions, forward/return/resubmit, deactivation, balance validation, retries, scheduler protection, same-branch assignment/read/action/forward checks, stale branch routing, explicit override permissions and comments, overturning rejection, audit/notifications, one-save rollback, new-account combined save, concurrent/repeated decisions and one deduction, guarded deletion/permission cleanup.
- Existing review-screen DOM suite (5 scenarios), integrated user form/save tests (2 groups), and override-screen test (1 group). Confirmed email GET links do not mutate decisions, comments/version/confirmation are submitted, untrusted text is escaped, branch options filter, and failed account creation does not create a local phantom user.
- Actual index.js user SQL writer exercised against PGlite: insert/update savepoints preserve legacy optional-MFA fallback; required-MFA changes fail atomically on an old schema; modern MFA persists; passwords remain hashed/hidden.
- 12 Excel tests: real XLSX/legacy XLS, independent openpyxl XLSX fixture, multiple worksheets, leading zeros, formatted numeric codes, empty columns, cached formulas, corrupt-file errors, size/auth limits, mixed PDF+Excel, and actual customer browser analyze function through local HTTP to real parser/HS matching.
- Existing Graph sender test plus branded-message tests: app-only credentials, noreply sender, sending-disabled gate, original logo bytes identical to approved builder, inline Graph attachment/CID, no Reply-To, FZCO/footer separation, escaped greeting/fallback, internal-history-note suppression.
- Static JavaScript syntax checks and archive/changed-file inventory.
- Email HTML visually inspected with an HTML-to-PDF renderer at 760px and 390px widths. This is a layout sanity check, **not** Outlook/iOS browser certification. Browser-based rendering was unavailable because the Chromium download did not complete. Preview embeds the same original PNG for viewing; sent emails use CID.

## Important limits

Microsoft Graph/SMTP delivery and document-AI responses were mocked locally. No real email was sent and no customer documents were transmitted. The live database, deployed auth/environment, scheduler, actual AI provider, link destinations and recipient inbox delivery must be smoke-tested by IT. Local tests do not prove these live dependencies work.

The Excel parser and customer portal upload implementation are unchanged from the fresh V23 source because the real workbook/upload tests passed. V24 does not claim to fix an unknown live-only configuration or file-specific issue; if a particular customer workbook still fails, retain its visible error and a safe sample for diagnosis.

Queue semantics remain at-least-once: a provider acceptance followed by a process crash may duplicate a notification, but approval versioning/transactions prevent duplicate leave deductions. The tests use a serialised connection fixture; production PostgreSQL enforces the explicit row/advisory locks.

Status: V24 ZIP issued at the owner's request for IT handoff. Confirm email appearance with the owner during the live test. See V24-IT-SETUP.md for migration, manual live tests and rollback controls.
