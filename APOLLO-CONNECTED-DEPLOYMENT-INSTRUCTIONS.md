# Apollo Connected - Consolidated Deployment
Date: 22 September 2026

## 1. Deploy this full source
Use this package as the new deployment source. It is based on the IT live ZIP and preserves the existing live modules and migration `041_awb_branch_sequence.sql`.

## 2. Database - apply only the new migration
Apply only:

`server/sql/042_customer_compliance.sql`

Do **not** run the full historical migration chain for this release.

Chat should already have migration `040_connected_chat.sql`. If needed, verify:

`SELECT to_regclass('public.connected_chat_messages');`

## 3. Microsoft Graph - noreply shipment updates
Do not enable SMTP AUTH for this feature.

Cloud Run variables:
- `MAIL_SEND_ENABLED=true`
- `MAIL_PROVIDER=microsoft_graph`
- `M365_TENANT_ID=<tenant id>`
- `M365_CLIENT_ID=<app/client id>`
- `M365_CLIENT_SECRET=<map from Google Secret Manager>`
- `MAIL_FROM=noreply@apollo-freight.com`
- `MAIL_GRAPH_TIMEOUT_MS=15000`

For mailbox-only security, use Exchange Online Application RBAC with role `Application Mail.Send` scoped only to `noreply@apollo-freight.com`. Do not leave an unscoped tenant-wide Entra `Mail.Send` grant on the same app.

Example Exchange Online setup after creating the Entra service principal:

`New-ServicePrincipal -AppId <CLIENT_ID> -ObjectId <SERVICE_PRINCIPAL_OBJECT_ID> -DisplayName "Apollo Connected Mail"`

`New-ManagementScope -Name "ApolloConnected-Noreply" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'noreply@apollo-freight.com'"`

`New-ManagementRoleAssignment -Name "ApolloConnected-Noreply-MailSend" -App <SERVICE_PRINCIPAL_OBJECT_ID> -Role "Application Mail.Send" -CustomResourceScope "ApolloConnected-Noreply"`

Test:

`Test-ServicePrincipalAuthorization -Identity <SERVICE_PRINCIPAL_OBJECT_ID> -Resource noreply@apollo-freight.com`

## 4. Customer Compliance / Apollo Shield
Enable Vertex AI for the project and ensure the Cloud Run runtime service account can call Vertex AI (for example, Vertex AI User role).

Set:
- `APOLLO_COMPLIANCE_PROVIDER=vertex`
- `APOLLO_COMPLIANCE_LOCATION=global`
- `APOLLO_COMPLIANCE_MODEL=gemini-3.1-flash-lite`

The Kuwait HS master is included in `server/data/kuwait-hs-master-2025.json`.

## 5. Redeploy and test
After migration/configuration, rebuild and deploy Cloud Run, then test:
1. Admin AI can query cross-user/cross-branch Operations and CRM.
2. Sales/CRM user cannot query Operations and sees assigned CRM accounts only.
3. Send a shipment update and confirm it arrives from `noreply@apollo-freight.com`.
4. Customer uploads invoice/packing list for Kuwait, runs HS check, sees only exceptions, can accept a suggested HS code, and receives Apollo Shield only when all lines pass.
5. Confirm extracted package/weight/dimensions/CBM values populate the shipment request.
