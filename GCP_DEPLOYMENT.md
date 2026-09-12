# Deploying Apollo FreightERP to Google Cloud only

This replaces the current Vercel (frontend) + Render (API) + Neon (database) setup with a single
Cloud Run service (serving both the app and the API) backed by Cloud SQL for PostgreSQL.

You'll run these commands yourself from a machine with the `gcloud` CLI installed and logged in
(`gcloud auth login`) - they can't be run from here.

## 0. One-time setup (new project)

Make sure a **billing account** is linked to the project first (Cloud Console → Billing →
Link a billing account) - Cloud Run, Cloud SQL, and Cloud Build all require this even if you
stay within free-tier usage.

```bash
gcloud config set project YOUR_PROJECT_ID

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com
```

Create a place to store your container image (Artifact Registry - the current standard, replaces
the older `gcr.io` Container Registry):

```bash
gcloud artifacts repositories create apollo-freighterp \
  --repository-format=docker \
  --location=us-central1
```

## 1. Create the Cloud SQL for PostgreSQL instance

```bash
gcloud sql instances create apollo-freighterp-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --storage-auto-increase

gcloud sql databases create apollo_freighterp --instance=apollo-freighterp-db

gcloud sql users set-password postgres \
  --instance=apollo-freighterp-db \
  --password="CHOOSE_A_STRONG_PASSWORD"
```

Note the **instance connection name** printed by:
```bash
gcloud sql instances describe apollo-freighterp-db --format="value(connectionName)"
# looks like: YOUR_PROJECT_ID:us-central1:apollo-freighterp-db
```

`db-f1-micro` is the cheapest tier, fine to start with a small team - resize later with
`gcloud sql instances patch` if needed.

## 2. Build and push the container image

From the repo root (where the `Dockerfile` is):

```bash
gcloud builds submit --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/apollo-freighterp/app
```

## 3. Deploy to Cloud Run

```bash
gcloud run deploy apollo-freighterp \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/apollo-freighterp/app \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --add-cloudsql-instances YOUR_PROJECT_ID:us-central1:apollo-freighterp-db \
  --set-env-vars NODE_ENV=production,AUTO_MIGRATE=true \
  --set-env-vars DATABASE_URL="postgresql://postgres:CHOOSE_A_STRONG_PASSWORD@/apollo_freighterp?host=/cloudsql/YOUR_PROJECT_ID:us-central1:apollo-freighterp-db" \
  --set-env-vars CUSTOMER_PORTAL_SECRET="$(openssl rand -hex 32)"
```

Notes:
- `--add-cloudsql-instances` is what makes Cloud Run mount the Cloud SQL Unix socket - the app's
  `server/src/db.js` already detects this connection format automatically and skips TLS for it
  (Cloud SQL and Neon need opposite TLS settings; this repo now handles both correctly).
- `--allow-unauthenticated` makes the app publicly reachable (like it is today on Vercel/Render).
  Cloud Run's own access control is separate from the app's own login system - keep this unless
  you specifically want to put the whole app behind Google IAM as well.
- Generate `CUSTOMER_PORTAL_SECRET` once and reuse the same value on every future deploy - if it
  changes, everyone's login session is invalidated (not dangerous, just means everyone has to log
  in again).
- On first boot, `AUTO_MIGRATE=true` runs all the SQL migrations automatically against the new,
  empty database - no manual migration step needed.
- Want secrets out of your deploy command/history entirely? Store them in Secret Manager instead
  (`gcloud secrets create ...`) and reference with `--set-secrets` instead of `--set-env-vars` -
  optional, `--set-env-vars` above works fine to start.

Cloud Run prints a URL like `https://apollo-freighterp-xxxxx-uc.a.run.app` when deploy finishes.
That's your app - it serves both the UI and the API from that one URL.

## 4. Verify

```bash
curl https://YOUR-CLOUD-RUN-URL/api/health
```
should return `"database": "connected"`. Then open the URL in a browser and log in with
`admin` / `admin123` (or whichever seeded credentials you're using).

## 5. Redeploying after code changes

```bash
gcloud builds submit --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/apollo-freighterp/app
gcloud run deploy apollo-freighterp --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/apollo-freighterp/app --region us-central1
```
(env vars and the Cloud SQL connection persist across redeploys automatically - you only need to
pass `--set-env-vars`/`--add-cloudsql-instances` again if you're changing them.)

## 6. Cloud Storage (for uploaded files — setup for later)

Important: the app doesn't actually save uploaded file content anywhere today (not even on your
current Vercel/Render/Neon setup) — it only stores the filename as text. Real upload support isn't
built yet. These are just the one-time GCP setup steps so it's ready whenever that feature gets
built - running them now doesn't turn uploads on by itself.

```bash
gcloud services enable storage.googleapis.com

gcloud storage buckets create gs://YOUR_PROJECT_ID-apollo-documents \
  --location=us-central1 \
  --uniform-bucket-level-access
```

Let Cloud Run write to it, without making the bucket itself public:
```bash
# Find the Cloud Run service's runtime service account
gcloud run services describe apollo-freighterp --region us-central1 \
  --format="value(spec.template.spec.serviceAccountName)"

# Grant that service account write access to the bucket
gcloud storage buckets add-iam-policy-binding gs://YOUR_PROJECT_ID-apollo-documents \
  --member="serviceAccount:THE_SERVICE_ACCOUNT_FROM_ABOVE" \
  --role="roles/storage.objectAdmin"
```

Keep the bucket private (recommended) and serve files through short-lived signed URLs generated
by the server, rather than making the bucket public - avoids exposing customer/shipment documents
to anyone with a guessable link.

When this feature does get built, it will need:
- A server-side upload endpoint (multipart handling, e.g. `multer` or `busboy`) that streams the
  file to this bucket using the `@google-cloud/storage` npm package.
- The client's file input actually reading and sending file content (right now it only reads the
  filename) - `web/app-runtime.js` would need a real `FileReader`/`fetch` upload step wherever
  `data.fileUpload` is currently just read for its `.name`.
- A bucket name env var (e.g. `DOCUMENTS_BUCKET=YOUR_PROJECT_ID-apollo-documents`) passed to Cloud
  Run the same way `DATABASE_URL` is today.

## 7. Optional: custom domain

```bash
gcloud run domain-mappings create --service apollo-freighterp --domain your-domain.com --region us-central1
```
Follow the DNS records it gives you.

## 8. Decommissioning Vercel / Render / Neon

Once you've confirmed the Cloud Run deployment works end-to-end:
- Delete the Vercel project.
- Delete the Render service.
- Export/verify your data is fully migrated, then delete the Neon project.
- `vercel.json` and `render.yaml` in this repo are no longer used - safe to delete once you're
  fully cut over (left in place for now in case you want to roll back).

## Migrating existing data from Neon to Cloud SQL (if you have real data already)

```bash
# Dump from Neon
pg_dump "YOUR_NEON_CONNECTION_STRING" --no-owner --no-privileges -f apollo_dump.sql

# Restore into Cloud SQL via the Cloud SQL Auth Proxy
cloud-sql-proxy YOUR_PROJECT_ID:us-central1:apollo-freighterp-db &
psql "postgresql://postgres:CHOOSE_A_STRONG_PASSWORD@127.0.0.1:5432/apollo_freighterp" -f apollo_dump.sql
```
Do this BEFORE flipping `AUTO_MIGRATE` on for the Cloud Run service against this database, or
run migrations first and then restore only the data (not the schema) to avoid conflicts.

## Quick reference: products used

| Product | Role |
|---|---|
| Cloud Run | Hosts the app (UI + API, one service) |
| Cloud SQL | PostgreSQL database |
| Artifact Registry | Stores the built container image |
| Cloud Build | Builds the Docker image (`gcloud builds submit`) |
| Cloud Storage | Stores uploaded documents (setup ready, feature not built yet - see section 6) |
| Secret Manager (optional) | Stores DB password / session secret securely |
