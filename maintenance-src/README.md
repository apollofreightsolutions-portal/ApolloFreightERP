# Apollo-Freight Solutions Platform

Production starter for a global transport vehicle management and expense system.

## Structure

- `client/`: React frontend
- `server/`: Express API with PostgreSQL-ready data layer
- `index.html`, `app.js`, `styles.css`: existing local prototype kept for reference

## Planned Production Features

- Secure authentication
- Admin and staff roles
- Vehicle management
- Expense tracking with per-record currency
- Search and history
- Azure-ready deployment structure

## Local Development

1. Install Node.js 20+
2. Run `npm install`
3. Copy `server/.env.example` to `server/.env`
4. Start the API with `npm run dev:server`
5. Start the frontend with `npm run dev:client`

## Reports (Excel/PDF)

The React dashboard supports date-range totals and exports.

1. Set start/end dates in the `Reports` panel
2. Optionally select vehicle and expense type
2. Use `Export Excel` or `Export PDF`

## Azure Direction

- Frontend: Azure Static Web Apps or App Service
- Backend: Azure App Service
- Database: Azure Database for PostgreSQL
- Domain: `app.apollo-freight.com`

## Render Deployment

The backend now runs on Render and connects to the migrated Neon PostgreSQL database.

Render service:

- URL: `https://apollo-freight-pst1.onrender.com`
- Build command: `npm install && npm --workspace server run build`
- Start command: `npm run start:render`
- Health check path: `/api/health`

Render variables:

- `DATABASE_URL`: Neon PostgreSQL connection string
- `JWT_SECRET`: secure random string
- `APP_ORIGIN`: `https://apollo-freight-client.vercel.app,https://apollo-freight-pst1.onrender.com`
- `NODE_ENV`: `production`
- `DATABASE_SSL`: `require`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: email sender settings for forgot-password OTP
- `ADMIN_EMAIL`: optional admin email used when seeding/resetting the first admin account

Vercel frontend variable:

- `VITE_API_URL`: `https://apollo-freight-pst1.onrender.com`

After the first Render deployment, run this once against the Neon database to create the first admin login:

```powershell
npm run setup:prod
```

## Railway Deployment

The old Railway deployment configuration is still present for reference. New production backend deployments should use Render.

## Windows Desktop App

The project can also be packaged as a Windows desktop application using Electron. The desktop app opens the live Apollo-Freight Solutions web application and uses the same online login, data, and permissions.

Commands:

1. Install desktop dependencies:

```powershell
npm install
```

2. Run the desktop app locally:

```powershell
npm run desktop:dev
```

3. Build a Windows installer:

```powershell
npm run desktop:dist
```

The generated installer will be created in the `dist-desktop` folder.

## Mobile App

The project is prepared for Android and iPhone using Capacitor. The mobile app packages the same React dashboard and connects to the live Render API.

Main mobile commands:

```powershell
npm run mobile:sync
```

Open Android Studio:

```powershell
npm run mobile:open:android
```

Open Xcode on a Mac:

```bash
npm run mobile:open:ios
```

## Current Status

This repo is now scaffolded for the real hosted version. Database wiring and full production auth are next steps.
