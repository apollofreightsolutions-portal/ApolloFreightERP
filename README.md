# Apollo Freight Solutions Portal - Cargo Shipments

Tagline: We Bring Continents closer...

Brand mark: A F S in orange.

Web console and Render API for land freight shipment operations.

## Deployment

- Backend API: `server/` on Render
- Web console: `web/` on Vercel
- Database: Neon PostgreSQL

Keep this project fully isolated from any older live project:

- do not reuse the old database
- do not reuse the old backend
- do not reuse old environment variables
- do not reuse old Vercel or Render projects

## Included Modules

- Dashboard
- Shipments / Jobs
- Consolidation
- Customers
- Suppliers / Transporters
- Tariffs / Rate Master
- Documents
- Billing / Invoices
- POD / Delivery
- Reports
- User Management / Settings
- Audit Log

## Current Version

This build uses the live Render API and Neon PostgreSQL database for shipments, consolidations, customers, suppliers, tariffs, documents, invoices, additional charges, users, admin requests, settings, and audit data.

## Test Login

- User name: `admin`
- Password: `admin123`

## Render And Vercel

Render deploys the API from the root `render.yaml`.

Vercel deploys the static web console from `web/`.

Important: set the Neon pooled PostgreSQL connection string in Render. Preferred key is `NEON_DATABASE_URL`; using `DATABASE_URL` also works. Use the pooled Neon URL and keep `sslmode=require`.

Recommended GitHub deployment settings:

```text
Render Blueprint: use render.yaml from the repo root
Vercel Root Directory: web
Vercel Framework Preset: Other
Vercel Build Command: empty
Vercel Output Directory: .
```

Live deployment URLs:

```text
GitHub: https://github.com/nilkalalkw-design/apollo-freighterp
Render API: https://apollo-freighterp-f9kt.onrender.com
Vercel Web: https://apollo-freighterp.vercel.app
Neon DB: set in Render as `NEON_DATABASE_URL`
```

The new backend is in `server/`, and the web console is in `web/`.

Database setup is now included:

- `server/sql/001_init.sql`
- `server/sql/002_seed.sql`
- `server/sql/003_views.sql`
- `npm run db:setup` from `server/`

See:

```text
Apollo Freight Solutions Portal\server\README.md
Apollo Freight Solutions Portal\web\README.md
```

It is prepared as a separate Node.js API service for Render with its own PostgreSQL connection and SQL starter schema.
