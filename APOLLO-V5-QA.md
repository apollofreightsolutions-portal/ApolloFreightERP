# Apollo Connected V5 QA / Security Checklist

## Static checks completed
- JavaScript syntax checked for server/src/apollo-ai.js
- JavaScript syntax checked for server/src/connected-chat.js
- JavaScript syntax checked for server/src/index.js
- JavaScript syntax checked for web/apollo-ai.js
- JavaScript syntax checked for web/connected-chat.js
- JavaScript syntax checked for web/app-runtime.js
- JavaScript syntax checked for web/app.js
- V5 diff reviewed against the exact latest supplied source package.

## Apollo AI security design
- AI user is reloaded from `app_users` for each AI request.
- `ai_access` remains required.
- Inactive users are denied.
- Shipment retrieval is constrained by Connected branch scope and own-entry/all-entry permissions.
- Explicit requested branch filters are applied in addition to permission scope, never instead of it.
- CRM still uses assigned-account scope unless the user has view-all/admin rights.
- Deterministic operational answers exclude sell, buy cost, revenue and margin.
- TCN actions are returned only for shipments retrieved through the user's authorized shipment scope.
- POD actions are generated only from POD documents linked to already-authorized shipment rows.
- POD viewing has a second server-side permission check before a file URL is returned.
- GCS PODs use the existing short-lived signed URL mechanism.
- Gemini does not receive document contents or financial values in Safe Mode.
- AI remains read-only.

## AI reliability design
- Common factual shipment queries bypass Gemini and use exact SQL results.
- Booking-by-user/type analysis is aggregate SQL, not model inference.
- Business date filters use `APOLLO_BUSINESS_TIMEZONE` (default Asia/Dubai).
- Gemini timeout defaults to 18 seconds and is configurable.
- Browser AI requests time out rather than remaining indefinitely busy.
- If Gemini fails after exact operation rows were retrieved, Apollo AI can return a factual fallback.

## Connected Chat security design
- Uses the existing internal Apollo app Bearer token.
- Both sender and recipient must be active users in `app_users`.
- Users cannot message themselves.
- Message length is limited to 2,000 characters in both application code and database constraint.
- Chat API returns only conversations involving the authenticated user.
- Read receipts can only be updated for messages where the authenticated user is the recipient.
- No customer portal authentication is accepted by `/api/chat` because it requires the internal app token.
- No passwords, HR records, financial data or other ERP records are copied into chat automatically.
- `Share current screen` stores only a short screen label/reference context, not the screen's record contents.

## Required production validation by IT
- Run migration 040 on production Cloud SQL.
- Test with two real temporary internal accounts.
- Confirm branch-restricted AI users cannot retrieve another branch's shipments.
- Confirm own-entry-only users cannot retrieve other users' shipment rows.
- Confirm an authorized POD opens and an unauthorized POD document number is rejected.
- Confirm TCN action only opens a shipment visible to the logged-in user.
- Confirm chat unread/read state across two browsers/devices.
- Confirm inactive user messaging is blocked.

## Limitations of offline QA
No production Cloud SQL database, production Gemini key, GCS bucket, or live user sessions were available in the build environment. Those live integrations must be validated after deployment.
