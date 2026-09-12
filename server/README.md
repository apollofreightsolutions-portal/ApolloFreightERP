# Apollo Freight Solutions Portal Server

This is a separate backend service for the new `Apollo Freight Solutions Portal` project only.

It is intended to run independently from any older live project, with:

- a separate Render service
- a separate PostgreSQL database
- separate environment variables
- separate deployment credentials

## Local setup

1. Copy `.env.example` to `.env`
2. Install packages:

```powershell
npm install
```

3. Create/update the database tables and seed data:

```powershell
npm run db:setup
```

4. Start the API:

```powershell
npm run dev
```

5. Test health:

```text
GET http://localhost:4000/api/health
```

## Render setup

1. Create a new Render Blueprint from this repo
2. Render reads the root `render.yaml`
3. Render creates a separate Node web service and PostgreSQL database
4. During setup, set `ALLOWED_ORIGIN` to your Vercel web URL

```text
https://apollo-freighterp.vercel.app
```

5. Render runs the SQL files automatically on startup when `AUTO_MIGRATE=true`
6. After the first deploy, confirm `GET /api/health` returns `"database":"connected"`

If your existing Render service was created manually instead of from the repo-root Blueprint, Render will not create the database or wire `DATABASE_URL` automatically. In that case:

- create the PostgreSQL database first
- copy its internal connection string into the web service as `DATABASE_URL`
- or recreate the service from the root `render.yaml`

The `DATABASE_URL` value is provided by Render from the database connection string in `render.yaml`.

The server also accepts these fallback variable names if you already use them elsewhere:

- `POSTGRES_URL`
- `POSTGRESQL_URL`
- `PG_CONNECTION_STRING`
- `RENDER_DATABASE_URL`

## HR leave email notifications

After a leave request is successfully saved, the server sends an email notification to every active `app_users` account whose `is_hr_admin` flag is enabled or whose role is `Admin` or `HR`. Configure these server environment variables to enable delivery through Resend:

```text
RESEND_API_KEY=re_...
EMAIL_FROM=HR Portal <hr@your-verified-domain.example>
```

The `EMAIL_FROM` domain must be verified in the email provider. If these variables are not configured, leave requests continue to save normally and the server logs that notification delivery was skipped. If the provider is temporarily unavailable, the leave request remains saved and the failure is logged; the employee does not lose the submitted request.

## Database files

- `sql/001_init.sql` creates the full ERP schema, indexes, triggers, and upgrade-safe columns.
- `sql/002_seed.sql` inserts starter customers, suppliers, jobs, consolidations, tariffs, invoices, users, settings, and audit rows.
- `sql/003_views.sql` creates reporting views for financials, pending POD, unbilled shipments, and consolidation manifests.
- `npm run db:setup` applies all SQL files in order.

Live API URL:

```text
https://apollo-freighterp-f9kt.onrender.com
```

## API routes

- `GET /api/health`
- `GET /api/shipments`
- `POST /api/shipments`
- `GET /api/consolidations`
- `POST /api/consolidations`
- `GET /api/customers`
- `POST /api/customers`
- `GET /api/suppliers`
- `POST /api/suppliers`
- `GET /api/tariffs`
- `POST /api/tariffs`
- `GET /api/documents`
- `POST /api/documents`
- `GET /api/invoices`
- `POST /api/invoices`
- `GET /api/users`
- `POST /api/users`
- `GET /api/unblock-requests`
- `POST /api/unblock-requests`
- `GET /api/audit`
- `POST /api/audit`
- `GET /api/settings`
- `POST /api/settings`
- `PUT /api/:resource/:id`
