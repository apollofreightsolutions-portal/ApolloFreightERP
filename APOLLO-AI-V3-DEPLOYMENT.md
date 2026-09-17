# Apollo AI V3 — IT Deployment

## Base package
V3 was merged into the latest source supplied by IT: `ai-3-ApolloFreightERP-main (3).zip`.
It is **not** based on the older V2 full package, so newer IT changes remain intact.

## Runtime files changed
- `server/src/apollo-ai.js`
- `web/app-runtime.js`

## Database file added
- `server/sql/039_apollo_ai_access_workspace_fix.sql`

## Required deployment steps
1. Back up the currently deployed Apollo Connected revision/database.
2. Deploy the V3 source over the current Cloud Run source using the existing Apollo Connected deployment process.
3. Ensure migration `038_apollo_ai.sql` has already run. Then run `039_apollo_ai_access_workspace_fix.sql`.
4. Keep the Gemini secret server-side. Expected Cloud Run mapping:
   - environment name: `GEMINI_API_KEY`
   - Secret Manager secret: `apollo-gemini-api-key:latest`
5. The Cloud Run runtime service account must have **Secret Manager Secret Accessor** permission for that secret.
6. Keep the existing AI safety settings unless management deliberately changes them:
   - `APOLLO_AI_FREE_TIER_SAFE_MODE=true`
   - `APOLLO_AI_ALLOW_HR_DATA=false`
   - `APOLLO_AI_MAX_CONTEXT_ROWS=25`
7. After deployment, users should sign out and sign back in.

## What V3 fixes
### User blocked / "not allowed"
Migration 039 enables Apollo AI for active internal Apollo portal users and makes AI enabled by default for new users. The per-user `ai_access` flag remains available to Admin and can still be turned off.

### Work questions not answered
Apollo AI now recognizes broader operations, CRM, and general-work language. Questions such as "What needs attention today?", "Summarize my work", "What is pending?", and "Give me an operations overview" can receive a permission-scoped workspace snapshot.

### Permission boundaries remain server-side
- Operations: branch scope plus the user's own-entry/view-all rule.
- CRM: assigned-account scope unless `crm_view_all_accounts=true` or Admin.
- HR: protected; external-AI HR data remains disabled by default.
- Financial fields: omitted in Free-Tier Safe Mode; Apollo AI can still answer the non-sensitive part of the question.
- Apollo AI remains read-only; it cannot change records or execute model-generated SQL.

## Provider configuration preserved from latest IT source
The latest IT source added Gemini API / Vertex AI provider support and Google authentication handling. V3 preserves that work. If `GEMINI_API_KEY` is present, the server prefers the Gemini API key. Vertex AI remains a fallback when configured by IT.

## Minimum post-deployment test
1. Normal active user: `GET /api/ai/me` should return enabled, not 403.
2. Ask: `What needs attention today?` — should return authorized work context or general work assistance.
3. Kuwait-only user asks for Dubai shipments — Dubai rows must not be supplied.
4. Sales A asks for Sales B's CRM account — it must not be supplied.
5. Admin disables AI for a user — `/api/ai/me` and `/api/ai/chat` must return 403 for that user.
6. Ask Apollo AI to change a shipment status — it must remain read-only.
