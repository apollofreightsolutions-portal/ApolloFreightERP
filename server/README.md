# Apollo Connected server

Node.js / Express API for Apollo Connected ERP, HR, Maintenance and CRM. Production target is Google Cloud Run with Cloud SQL PostgreSQL.

Commands:

```bash
npm ci
npm run check
npm run migrate   # explicit production migration
npm start
```

Production startup does not auto-run historical SQL migrations. Use the reviewed Cloud Run migration job described in `../GCP_DEPLOYMENT.md`.

The CRM API is mounted at `/api/crm` and requires a CRM portal session. Ordinary sales users are scoped server-side to `crm_accounts.assigned_to = session user`, unless their CRM permissions explicitly allow all-account visibility.
