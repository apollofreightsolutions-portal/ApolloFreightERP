# Apollo AI Gemini V1 — QA / Security Review

Date: 14 Sep 2026

## Static validation completed

- `node --check server/src/index.js` — passed
- `node --check server/src/apollo-ai.js` — passed
- `node --check web/app-runtime.js` — passed
- `node --check web/app.js` — passed
- `node --check web/apollo-ai.js` — passed
- package diff reviewed: only Apollo AI files and the intended integration files changed

## Security controls implemented

1. **Existing Apollo login required**
   - `/api/ai/*` is behind `requireAppAuth`.

2. **Per-user AI permission**
   - `app_users.ai_access` is checked from the database on every AI request.
   - AI access is not trusted from the browser/session object alone.
   - migration defaults normal users to OFF; existing Admin-role users are enabled only for initial testing.

3. **Admin-only user/permission changes**
   - generic create/update/delete operations on the `users` resource are now blocked server-side for non-Admin ERP users.
   - this prevents a normal user from enabling their own `ai_access` or escalating CRM/branch permissions through a direct API call.

4. **No AI-generated SQL**
   - Gemini never receives database credentials and cannot formulate/execute SQL.
   - the server chooses from fixed, parameterized SELECT queries only.

5. **Branch isolation for operations**
   - non-admin users are filtered by their live `branch_access` / `branch_view_scope`.
   - users with only Dashboard/Reports visibility receive aggregate status counts, not detailed shipment/customer rows.
   - detailed shipment rows require an operational module such as Shipment / Airway, Shipment Status, POD / Delivery, or Manifest.

6. **CRM ownership isolation**
   - non-view-all CRM users are restricted to `crm_accounts.assigned_to = current user`.
   - opportunities are joined through the same allowed-account scope.
   - contacts, emails, phone numbers, addresses, notes and exports are not sent to Gemini.

7. **HR privacy boundary**
   - `APOLLO_AI_ALLOW_HR_DATA=false` by default.
   - if later enabled, V1 still reads only the signed-in employee's own basic profile and leave requests, even for HR Admin users.
   - identity documents, payroll, salary, contact details, medical/bank information are explicitly excluded.

8. **Free-tier safe mode**
   - `APOLLO_AI_FREE_TIER_SAFE_MODE=true` by default.
   - financial questions are blocked from the external AI path.
   - HR personal data is disabled by default.
   - email addresses and phone-like numbers in prompts/history are redacted before provider submission.
   - sensitive prior chat turns are omitted from subsequent provider history.

9. **Read-only behavior**
   - Apollo AI has no shipment/status/CRM/HR mutation functions.
   - the only INSERT in the AI server module is the metadata-only audit entry.

10. **Prompt-injection containment**
    - data access is decided before Gemini is called.
    - a prompt such as "ignore permissions" cannot broaden the rows the server supplies.
    - system instructions explicitly treat database text as untrusted data, not instructions.

11. **Browser output safety**
    - AI answers are rendered with `textContent`, not raw HTML.
    - this prevents AI output from becoming an HTML/script injection path.

12. **Abuse / reliability controls**
    - authenticated-user/IP rate limit
    - 2,500-character prompt maximum
    - bounded conversation history
    - bounded database context rows
    - 30-second Gemini timeout
    - bounded AI output length

13. **Secret handling**
    - `GEMINI_API_KEY` is read server-side only.
    - no Gemini key is present in web JavaScript, HTML, or source defaults.
    - deployment guide requires Google Secret Manager.

14. **Audit privacy**
    - audit stores request UUID, user, portal, domain/scope, model, status, prompt SHA-256, character counts, duration and timestamp.
    - prompt text and AI answer are deliberately not stored.

## Live tests IT must run after deployment

Static QA cannot substitute for production authorization tests against Apollo's live Cloud SQL data. IT must run the test matrix in `APOLLO-AI-README.md`, especially:

- Kuwait user vs Dubai shipment isolation
- Sales A vs Sales B CRM account isolation
- `ai_access` OFF returning 403
- prompt-injection attempt
- write-action attempt
- free-tier financial/HR protection
- Gemini key / model connectivity

Do not enable all users until those live tests pass.
