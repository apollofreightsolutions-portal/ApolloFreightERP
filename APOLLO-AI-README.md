# Apollo AI — Gemini V3

Apollo AI is integrated into Apollo Connected as a read-only, permission-scoped assistant. V3 is merged into the latest IT source and preserves the current Google Cloud/Gemini provider integration.

## V3 behavior
- Active internal Apollo portal users are AI-enabled after migration `039_apollo_ai_access_workspace_fix.sql`; Admin can disable AI per user.
- Apollo AI supports general work drafting/planning plus permission-scoped Connected context.
- Operations context obeys branch permissions and shipment own-entry/view-all permissions.
- CRM context remains assigned-account-only unless the user has CRM view-all permission or is Admin.
- HR personal data is not sent to the external AI provider by default.
- Free-Tier Safe Mode omits sensitive financial/PII/document fields without rejecting the entire non-sensitive question.
- Apollo AI remains read-only and never executes AI-generated SQL.

## Deployment
Read `APOLLO-AI-V3-DEPLOYMENT.md` and `APOLLO-AI-V3-CHANGED-FILES.txt` before deployment.

Required migration order:
1. `038_apollo_ai.sql` (if not already applied)
2. `039_apollo_ai_access_workspace_fix.sql`

Expected Google Secret Manager / Cloud Run mapping:
`GEMINI_API_KEY=apollo-gemini-api-key:latest`

Keep `APOLLO_AI_FREE_TIER_SAFE_MODE=true` and `APOLLO_AI_ALLOW_HR_DATA=false` for the current free-tier-safe configuration.
