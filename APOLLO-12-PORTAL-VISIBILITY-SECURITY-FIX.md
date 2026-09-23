# Apollo Connected 12 — AI / Chat portal visibility security fix

- Apollo AI and Connected Chat are shown only after successful login to the Company ERP or CRM portal.
- They are not created or displayed on the public login screen.
- They are hidden and closed when the user logs out or switches to Customer / Employee portal.
- Customer tokens are already rejected by the internal API authentication.
- Employee Portal sessions are now explicitly rejected by the Apollo AI and Chat server routes.
- Connected Chat user discovery is limited to active Admin / ERP / CRM users.
- No database migration is required.

## Configuration safety

This update does not modify deployment configuration, environment variables, API endpoints, secrets, package manifests, or database migrations.
