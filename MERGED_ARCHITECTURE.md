# Apollo Connected unified architecture

The latest merged repository is the source package for Apollo Connected. The production target is one Google Cloud Run service serving the ERP, HR, CRM and customer web application plus the Node/Express API. Maintenance remains available under the same product and API/database boundary. Cloud SQL PostgreSQL is the single production database.

Authentication is shared, while portal/module permissions remain separate:

- ERP Portal
- Customer Portal
- HR Portal
- Maintenance Portal
- CRM / Sales Portal

CRM access is opt-in. Ordinary sales users are scoped server-side to accounts assigned to their username. Management permissions can separately enable all-account visibility, reassignment, exports, archive/restore, team reports and CRM administration.

Vercel, Render and Neon files remain only for transition/rollback during migration. See `GCP_DEPLOYMENT.md` for the target architecture and cutover order.
