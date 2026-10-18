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

The first execution should report `claimed=0, sent=0` when the queue is empty. That verifies the job starts and can reach its configuration, but it does **not** verify actual email delivery.

## 5. Create a least-privilege Scheduler identity and run every minute

Cloud Scheduler invokes the Cloud Run Jobs v2 `:run` API with an OAuth token. Create a dedicated service account and grant it `roles/run.invoker` on this job only. The account creating the Scheduler job must also be allowed to act as this service account.

```bash
gcloud services enable cloudscheduler.googleapis.com --project="$PROJECT_ID"

export SCHEDULER_SA=apollo-password-reset-scheduler@$PROJECT_ID.iam.gserviceaccount.com
if ! gcloud iam service-accounts describe "$SCHEDULER_SA" \
    --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create apollo-password-reset-scheduler \
    --project="$PROJECT_ID" \
    --display-name='Apollo password reset outbox scheduler'
fi

gcloud run jobs add-iam-policy-binding apollo-password-reset-outbox \
  --project="$PROJECT_ID" --region="$REGION" \
  --member="serviceAccount:$SCHEDULER_SA" \
  --role=roles/run.invoker

gcloud scheduler jobs create http apollo-password-reset-outbox-every-minute \
  --project="$PROJECT_ID" \
  --location="$REGION" \
  --schedule='* * * * *' \
  --time-zone='Etc/UTC' \
  --uri="https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/jobs/apollo-password-reset-outbox:run" \
  --http-method=POST \
  --oauth-service-account-email="$SCHEDULER_SA" \
  --oauth-token-scope='https://www.googleapis.com/auth/cloud-platform'
```

If the Scheduler job name already exists, inspect it first and use `gcloud scheduler jobs update http` instead of creating a duplicate. Cloud Scheduler does not start a second outstanding execution while the earlier execution is still running.

## 6. Enable the portal endpoint after the worker is ready

Only after migration 049, the worker job, and the Scheduler job are in place, enable the API endpoint and make the same encryption secret available to Cloud Run:

```bash
gcloud run services update apollo-freighterp \
  --project="$PROJECT_ID" --region="$REGION" \
  --update-env-vars=PASSWORD_RESET_ENABLED=true \
  --update-secrets=PASSWORD_RESET_OUTBOX_KEY=apollo-password-reset-outbox-key:latest
```

The route returns a generic response for registered and unregistered email addresses. The API only queues encrypted messages; the scheduled worker performs Graph delivery. Reset links expire after 30 minutes, can be used once, and completing a reset invalidates prior ERP and Maintenance Portal sessions.

## IAM checklist

The operator needs permission to create the Cloud Run Jobs, create/use the Secret Manager secret, enable Cloud Scheduler, and create its job. The Cloud Run runtime service account needs `roles/cloudsql.client` and `roles/secretmanager.secretAccessor` for the database, Graph, and outbox secrets. The dedicated Scheduler service account needs `roles/run.invoker` on the worker job; the operator needs `roles/iam.serviceAccountUser` on that Scheduler account to attach it to the Scheduler job. Google documents the Cloud Run Jobs schedule endpoint and these authentication roles in its [Cloud Run scheduling guide](https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule) and [Cloud Scheduler HTTP authentication guide](https://docs.cloud.google.com/scheduler/docs/http-target-auth).

After setup, test one reset using an active registered account and confirm delivery through the no-reply mailbox. Also check the dashboard Live button once with a `KWI` serial shipment and once with an `AFS` serial shipment. No real Graph delivery or live Cloud deployment has been verified by local tests.
