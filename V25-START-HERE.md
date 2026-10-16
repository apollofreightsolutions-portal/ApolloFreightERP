# Connected V25 — shipment email signature fix only

Base: the deployed `(24.1)ApolloFreightERP-main (24).zip` supplied on 16 October 2026. This is a complete project, not a mobile-app build or a rebuild from an older release.

## Change

Only production file changed: `server/src/email-templates.js`.

The shipment signature previously put two text buttons side by side inside the logo column, which occupies only 48% of the signature width. Outlook mobile squeezed the labels into multiple short lines. V25 moves the shipment buttons below the two-column signature into separate full-width rows. Inline nowrap rules, non-breaking spaces and HTML nowrap prevent the labels from fragmenting. No media query or external stylesheet is required for the fix. The orange Track Shipment button and dark Customer Portal button remain live links, and the existing logo/brand block is retained.

Unchanged: original CID logo artwork and attachments, tracking/customer URLs, shipment data, disclaimers including FZCO, no-reply wording, Microsoft mail configuration, HR email output, approval permissions/routes/database, customer Excel processing, and all frontend files. No mobile-app changes were introduced.

## IT deployment

1. Retain the current deployed build for rollback.
2. Deploy the backend containing the changed email template through the normal existing release process. If your pipeline deploys the whole project, use this full ZIP. No frontend-only deployment can fix server-generated email.
3. Keep the live database, secrets and environment variables exactly as configured. No migration, package/dependency update, Microsoft permission change or database reset is required.
4. Send one authorised TEST shipment notification to an internal address, then check the new email in Outlook mobile and desktop. Do not notify real customers merely to test the layout.
5. Both labels should appear on one line, in two separate coloured rows below the signature. Check both links and the embedded logo.

Already-delivered emails do not change. Verify a NEW email generated after deployment, not the old screenshot/email.

## Verification

Local structural/template checks passed: full-width independent button rows, non-wrapping labels, original URLs, embedded logo attachment equality, escaped customer text, FZCO/no-reply wording. HR email HTML was compared byte-for-byte with the uploaded deployed source for Pending, Approved, Rejected and Sent Back notifications and was unchanged. The packaging check compares every original project file; only the email template differs, with this deployment note added.

The ZIP includes a sample shipment HTML preview and test output under V25-verification. Preview uses sample data and embeds the logo locally; production still uses its original CID attachment. A live Outlook/mobile send was not performed here, so the post-deployment test remains required.

Rollback: restore the previous backend image or the previous email-templates.js and redeploy. No database or permission changes need reversing.
