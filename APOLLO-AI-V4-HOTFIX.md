# Apollo AI V4 hotfix

## Root cause fixed
V3 used `gemini-2.5-flash`. Google now limits Gemini 2.5 text-model access for many new projects, which can return HTTP 404 even though the model still appears in the catalog. V3 also routed Gemini 3.x text models to the `/interactions` endpoint instead of the standard `generateContent` endpoint.

## V4 changes
- Default model: `gemini-3.1-flash-lite` (Gemini Developer API free tier supported).
- Legacy Cloud Run settings `gemini-2.5-flash` and `gemini-2.5-flash-lite` are automatically normalized to `gemini-3.1-flash-lite`.
- Gemini 3.x text calls now use `v1beta/models/{model}:generateContent`.
- No permission, CRM, HR, shipment, database, or write-access logic was loosened.

## IT deployment
1. Deploy this V4 package.
2. Recommended Cloud Run env: `GEMINI_MODEL=gemini-3.1-flash-lite`. V4 will still self-correct the old 2.5 value if it remains.
3. Keep `GEMINI_API_KEY` mapped from Secret Manager.
4. Keep `APOLLO_AI_FREE_TIER_SAFE_MODE=true`.
5. No new database migration is required beyond V3 migrations 038 and 039.
6. After deploy, sign out/in and confirm the Apollo AI header shows `gemini-3.1-flash-lite`.
