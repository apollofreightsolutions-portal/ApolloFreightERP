# Apollo Freight unified architecture

The ERP repository is the single GitHub source of truth. The ERP Vercel project serves the ERP UI and the Maintenance UI at `/maintenance/`. The ERP Render service serves all ERP and Maintenance API routes. Both modules use the single ERP Render PostgreSQL database. Maintenance authentication accepts only an ERP HMAC handoff token and checks `app_users.maintenance_portal_access`.
