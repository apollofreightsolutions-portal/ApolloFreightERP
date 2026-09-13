# Apollo Connected — Google Cloud production deployment

This package is designed to run the Apollo Connected UI and API together on one Google Cloud Run service, backed by Cloud SQL for PostgreSQL.

For Apollo's GCC usage, `me-central2` (Dammam) is a sensible default region. `me-central1` (Doha) is also supported. Keep Cloud Run, Cloud SQL and Artifact Registry in the same chosen region. If Apollo already has a Google Cloud region in use, keep that instead of moving resources unnecessarily.

> Important: production code intentionally does **not** auto-run SQL migrations on server startup. Run the migration job explicitly before enabling users.

## 1. Variables

In Google Cloud Shell, set these once for the deployment session:

```bash
export PROJECT_ID="YOUR_GCP_PROJECT_ID"
export REGION="me-central2"
export SERVICE="apollo-connected"
export SQL_INSTANCE="apollo-connected-db"
export DB_NAME="apollo_connected"
export DB_USER="apollo_app"
export REPOSITORY="apollo-connected"
export IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/app:2026-09-12-crm"
export RUN_SA="apollo-connected-run@$PROJECT_ID.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"
```

## 2. Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com
```

## 3. Dedicated runtime service account

```bash
gcloud iam service-accounts create apollo-connected-run \
  --display-name="Apollo Connected Cloud Run"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUN_SA" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUN_SA" \
  --role="roles/secretmanager.secretAccessor"
```

## 4. Artifact Registry

```bash
gcloud artifacts repositories create "$REPOSITORY" \
  --repository-format=docker \
  --location="$REGION"
```

If the repository already exists, do not recreate it.

## 5. Cloud SQL PostgreSQL

Create PostgreSQL in the same region. For a real company deployment, do not treat the smallest shared-core database as a production reliability target. Select a production-appropriate Cloud SQL machine size in the Console, enable automated backups, point-in-time recovery and storage auto-increase. Regional high availability is preferable if Apollo wants the database to survive a zonal failure automatically; it costs more.

Example creation command (IT may choose a different tier):

```bash
gcloud sql instances create "$SQL_INSTANCE" \
  --database-version=POSTGRES_16 \
  --region="$REGION" \
  --tier=db-custom-1-3840 \
  --storage-size=20 \
  --storage-type=SSD \
  --storage-auto-increase

gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"

export DB_PASSWORD="$(openssl rand -hex 24)"
gcloud sql users create "$DB_USER" \
  --instance="$SQL_INSTANCE" \
  --password="$DB_PASSWORD"

export INSTANCE_CONNECTION_NAME="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')"
```

Keep the generated database password securely. Do not put it in source code or commit it to Git.

## 6. Secret Manager

The application expects a PostgreSQL connection URL. The generated password above contains only hexadecimal characters, so it can safely be placed in this URI without URL escaping.

```bash
printf 'postgresql://%s:%s@/%s?host=/cloudsql/%s' \
  "$DB_USER" "$DB_PASSWORD" "$DB_NAME" "$INSTANCE_CONNECTION_NAME" \
  | gcloud secrets create apollo-database-url --data-file=-

openssl rand -hex 32 \
  | gcloud secrets create apollo-session-secret --data-file=-
```

If either secret already exists, add a new secret version instead of trying to create it again. Example:

```bash
printf 'NEW_VALUE' | gcloud secrets versions add apollo-database-url --data-file=-
```

## 7. Build the container

Run this from the repository root containing `Dockerfile`:

```bash
gcloud builds submit --tag "$IMAGE"
```

The Dockerfile installs the Node server and copies the complete `web/` directory into the same image. On Cloud Run, the browser therefore calls the API on the same origin rather than calling Render.

## 8. Run database migrations explicitly

This latest package contains the IT migration `036_hr_weekend_overrides.sql` and the CRM migration `037_crm_module.sql`. Production startup deliberately does not replay all migrations automatically.

Create/update a one-off Cloud Run Job using the same image and database connection:

```bash
gcloud run jobs deploy apollo-connected-migrate \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="$RUN_SA" \
  --set-cloudsql-instances="$INSTANCE_CONNECTION_NAME" \
  --set-secrets="DATABASE_URL=apollo-database-url:latest,CUSTOMER_PORTAL_SECRET=apollo-session-secret:latest" \
  --command=npm \
  --args=run,migrate \
  --max-retries=0 \
  --task-timeout=20m

gcloud run jobs execute apollo-connected-migrate \
  --region="$REGION" \
  --wait
```

Review the job logs. Do not proceed if a migration fails.

For migration from the existing Neon database, restore the live data into Cloud SQL **before** the final reviewed migration run, or restore data-only after schema creation. Do not blindly restore an old schema on top of a migrated schema. Keep the original Neon database untouched until the cutover is fully validated.

## 9. Deploy Cloud Run

```bash
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="$RUN_SA" \
  --allow-unauthenticated \
  --add-cloudsql-instances="$INSTANCE_CONNECTION_NAME" \
  --set-secrets="DATABASE_URL=apollo-database-url:latest,CUSTOMER_PORTAL_SECRET=apollo-session-secret:latest" \
  --set-env-vars="NODE_ENV=production" \
  --memory=1Gi \
  --cpu=1 \
  --concurrency=40 \
  --timeout=300
```

`--allow-unauthenticated` means the Cloud Run URL is reachable on the internet; Apollo Connected's own login and permissions still protect the application. If IT wants an additional identity perimeter later, add it deliberately rather than mixing it into this migration.

For consistently fast login/dashboard response, IT can set a minimum instance of 1. That reduces cold starts but creates an ongoing Cloud Run charge.

## 10. Verify before DNS cutover

Get the service URL:

```bash
export SERVICE_URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
echo "$SERVICE_URL"
curl "$SERVICE_URL/api/health"
```

The health response should show the database as connected/ready. Then test in the browser using real production Admin credentials stored in the database. The historical `admin / admin123` fallback is disabled in production.

Minimum live CRM security test:

1. Enable CRM for two temporary sales users, Sales A and Sales B.
2. Assign a test account to Sales A.
3. Confirm Sales A sees it.
4. Confirm Sales B does not see it.
5. Attempt the account API URL using Sales B's token and the known account ID; it must return not found/denied, not the record.
6. Remove export permission from Sales A; export must return 403.
7. Reassign the account to Sales B; it must disappear from Sales A and appear for Sales B, with the handover recorded in CRM activity/audit.

## 11. `connected.apollo-freight.com`

Do **not** rely on Cloud Run's direct domain-mapping command for a Middle East region. Google's direct Cloud Run domain mapping has limited regional availability and is not the recommended production option. For a service in Dammam/Doha, use a **global external Application Load Balancer** with a Google-managed certificate, then point the GoDaddy DNS record for `connected.apollo-freight.com` to the load balancer.

The recommended production path is:

Cloud Run (`me-central2`) → serverless NEG → global external HTTPS load balancer → Google-managed TLS certificate → `connected.apollo-freight.com`.

This also gives Apollo a clean path to add Cloud Armor later if desired.

Do not switch DNS until the Cloud Run URL passes the full login/CRM/ERP/HR/Maintenance tests.

## 12. CORS lockdown after cutover

The application currently allows configurable origins. After the final hostname is live and rollback testing is complete, set:

```bash
gcloud run services update "$SERVICE" \
  --region="$REGION" \
  --update-env-vars="ALLOWED_ORIGIN=https://connected.apollo-freight.com"
```

If IT still needs the raw Cloud Run URL for browser testing, include both origins separated by a comma until testing is complete.

## 13. Cloud Storage for future real attachments

The present ERP/CRM stores links/filenames; it does not yet upload binary documents into cloud storage. Create a private bucket only when the upload feature is implemented, and serve downloads through authorized server endpoints or short-lived signed URLs. Never make customer documents publicly readable.

## 14. Cutover / rollback rule

Keep Vercel, Render and Neon running during migration. Only decommission them after:

- live data counts are reconciled
- login works for all portal types
- CRM account isolation passes
- ERP/HR/Maintenance smoke tests pass
- backups are confirmed
- DNS/TLS is stable
- IT has a tested rollback path

`vercel.json` and `render.yaml` remain in this ZIP only for transition/rollback compatibility.
