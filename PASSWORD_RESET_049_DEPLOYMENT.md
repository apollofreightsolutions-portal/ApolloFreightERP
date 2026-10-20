# Password reset deployment — migration 049 and outbox worker

**Target project:** `cs-project-xui8rpt4` (development)
**Region:** `us-central1`
**Cloud SQL instance:** `apollo-freighterp-trial`
**Cloud Run service:** `apollo-freighterp`

Run these commands in **Cloud Shell** while signed in to the intended project account. The commands pin every resource operation to the development project. Do not run the historical migration chain; this runbook applies only `049_password_reset_tokens.sql` through the isolated runner.

## 1. Confirm the project and deployed image

After the GitHub-triggered Cloud Build has completed, confirm the selected project and retrieve the image currently serving the portal:

```bash
export PROJECT_ID=cs-project-xui8rpt4
export REGION=us-central1
export RUNTIME_SA=988838018724-compute@developer.gserviceaccount.com

gcloud config set project "$PROJECT_ID"
gcloud config get-value project
gcloud run services describe apollo-freighterp \
  --project="$PROJECT_ID" --region="$REGION" \
  --format='value(status.latestReadyRevisionName,spec.template.spec.containers[0].image)'

export IMAGE="$(gcloud run services describe apollo-freighterp \
  --project="$PROJECT_ID" --region="$REGION" \
  --format='value(spec.template.spec.containers[0].image)')"
printf 'Migration image: %s\n' "$IMAGE"
```

Check that the returned revision is the one built from this update before continuing.

## 2. Apply only migration 049

This one-task Cloud Run Job uses the deployed application image, the existing database URL secret, and the existing Cloud SQL instance. It runs the guarded script that reads only `049_password_reset_tokens.sql`; it does not rerun migrations 001–048.

```bash
gcloud run jobs create apollo-password-reset-migrate-049 \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --command=node \
  --args=src/migrate-password-reset.js \
  --set-env-vars=NODE_ENV=production,ALLOW_PRODUCTION_MIGRATIONS=true \
  --set-secrets=DATABASE_URL=apollo-freighterp-cloudsql-database-url:latest \
  --set-cloudsql-instances="$PROJECT_ID:$REGION:apollo-freighterp-trial" \
  --service-account="$RUNTIME_SA" \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=0 \
  --task-timeout=10m

gcloud run jobs execute apollo-password-reset-migrate-049 \
  --project="$PROJECT_ID" --region="$REGION" --wait
```

The execution must complete successfully and log that only `049_password_reset_tokens.sql` was applied. If the guarded runner reports a lock timeout or another migration is running, stop and retry later; do not rerun the historical migration chain.

## 3. Create the outbox encryption secret once

The API and worker must use the same secret. Do not put its value in source control, command history, or chat. The command below creates a strong key only if the Secret Manager entry does not already exist. Preserve the existing key on later runs because pending encrypted messages depend on it.

```bash
if ! gcloud secrets describe apollo-password-reset-outbox-key --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud secrets create apollo-password-reset-outbox-key \
    --project="$PROJECT_ID" --replication-policy=automatic
fi

if ! gcloud secrets versions list apollo-password-reset-outbox-key \
    --project="$PROJECT_ID" --filter='state=ENABLED' --format='value(name)' | grep -q .; then
  openssl rand -hex 32 | tr -d '\n' | \
    gcloud secrets versions add apollo-password-reset-outbox-key \
      --project="$PROJECT_ID" --data-file=-
fi

gcloud secrets add-iam-policy-binding apollo-password-reset-outbox-key \
  --project="$PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" \
  --role=roles/secretmanager.secretAccessor
```

The runtime service account also needs Secret Manager access to `apollo-m365-client-secret` and Cloud SQL connectivity. The previously successful isolated Cloud Run migration job used this same runtime account and Cloud SQL attachment; do not change the database credentials or grant broader roles if those permissions remain in place.

## 4. Create and test the outbox worker job

The worker uses the same database and Graph configuration as the portal. The Graph tenant/client identifiers below match the existing configuration; the client secret is read from Secret Manager version 1.

```bash
gcloud run jobs create apollo-password-reset-outbox \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --command=node \
  --args=src/process-password-reset-outbox.js \
  --set-env-vars=NODE_ENV=production,PASSWORD_RESET_ENABLED=true,MAIL_PROVIDER=microsoft_graph,MAIL_SEND_ENABLED=true,M365_TENANT_ID=8d8f1875-1195-4f41-a0ea-ae177e503e89,M365_CLIENT_ID=3596aff6-15d9-4399-aeba-641d640782b5,MAIL_FROM=noreply@apollo-freight.com,APP_PUBLIC_URL=https://connected.apollo-freight.com \
  --set-secrets=DATABASE_URL=apollo-freighterp-cloudsql-database-url:latest,M365_CLIENT_SECRET=apollo-m365-client-secret:1,PASSWORD_RESET_OUTBOX_KEY=apollo-password-reset-outbox-key:latest \
  --set-cloudsql-instances="$PROJECT_ID:$REGION:apollo-freighterp-trial" \
  --service-account="$RUNTIME_SA" \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=0 \
  --task-timeout=5m

gcloud run jobs execute apollo-password-reset-outbox \
  --project="$PROJECT_ID" --region="$REGION" --wait
```

The first execution should report `claimed=0, sent=0` when the queue is empty. That verifies the job starts and can reach its configuration, but it does **not** verify actual email delivery. The worker job is optional after the updated API is deployed.

## 5. Keep the recurring Scheduler paused

The updated API sends each newly requested reset email immediately after its encrypted outbox row commits. It invokes the existing outbox processor for that request's token, so Cloud Scheduler does not need to run every minute. If `apollo-password-reset-outbox-every-minute` already exists, leave it paused; do not create or resume a recurring Scheduler for reset delivery.

Migration `049_password_reset_tokens.sql` is a one-time schema change. It does not run when a user requests a password reset and must not be scheduled. The outbox worker is a separate, optional Cloud Run Job. Run it manually only if you need to drain older queued mail or clean up expired rows:

```bash
gcloud run jobs execute apollo-password-reset-outbox \
  --project="$PROJECT_ID" --region="$REGION" --wait
```

## 6. Configure the portal service for on-demand delivery

After migration 049 and the outbox encryption secret exist, configure the **Cloud Run service** with the same Microsoft Graph mail settings and secrets as the optional worker. The service must have Graph mail access because it sends the requested email from the API request flow.

```bash
gcloud run services update apollo-freighterp \
  --project="$PROJECT_ID" --region="$REGION" \
  --update-env-vars=PASSWORD_RESET_ENABLED=true,MAIL_PROVIDER=microsoft_graph,MAIL_SEND_ENABLED=true,M365_TENANT_ID=8d8f1875-1195-4f41-a0ea-ae177e503e89,M365_CLIENT_ID=3596aff6-15d9-4399-aeba-641d640782b5,MAIL_FROM=noreply@apollo-freight.com,APP_PUBLIC_URL=https://connected.apollo-freight.com \
  --update-secrets=PASSWORD_RESET_OUTBOX_KEY=apollo-password-reset-outbox-key:latest,M365_CLIENT_SECRET=apollo-m365-client-secret:1
```

The route returns a generic response for registered and unregistered email addresses. For a registered, active user it queues an encrypted message and attempts Graph delivery during that request. If Graph is temporarily unavailable, the outbox retains the message for a later manual worker run or a newly requested link. Reset links expire after 30 minutes, can be used once, and completing a reset invalidates prior ERP and Maintenance Portal sessions.

## IAM checklist

The operator needs permission to update the Cloud Run service and create/use the Secret Manager secrets. The Cloud Run runtime service account needs `roles/cloudsql.client` and `roles/secretmanager.secretAccessor` for the database, Graph, and outbox secrets. No Scheduler service account or recurring Scheduler is required for on-demand password-reset delivery.

After setup, test one reset using an active registered account and confirm delivery through the no-reply mailbox. Also check the dashboard Live button once with a `KWI` serial shipment and once with an `AFS` serial shipment. No real Graph delivery or live Cloud deployment has been verified by local tests.
