# Apollo AI V3 — QA / Security Checklist

## Static checks completed before packaging
- Merged V2 AI fixes into the latest IT package rather than replacing it with the older V2 tree.
- Preserved latest IT Gemini/Vertex provider authentication code.
- Preserved latest IT non-AI application files.
- JavaScript syntax checked for modified files and server entry point.
- Migration 039 included after migration 038.
- No Gemini API key is embedded in source code or documentation.

## Production checks IT must complete
- Cloud Run secret mapping exposes `apollo-gemini-api-key:latest` as `GEMINI_API_KEY`.
- Cloud Run runtime service account can access the secret.
- Migration 039 completes successfully.
- Users sign out/in after deployment.
- Permission regression tests pass for branch, own-entry, CRM account ownership, AI disable switch, and read-only behavior.

## Expected behavior
- Active internal users are AI-enabled by default after migration 039.
- Admin can explicitly disable AI for individual users.
- General work questions are answered normally without inventing Apollo-specific facts.
- Apollo-specific answers use only the server-supplied authorized context.
- Free-Tier Safe Mode excludes financial values, HR personal data, contact PII, notes, document contents, and credentials from provider context.
