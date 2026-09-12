# Maintenance source

This directory contains the Maintenance React/Vite source copied from `nilkalalkw-design/apollo-freight` for the unified ERP code host.

The compiled output is served from `web/maintenance/`. Its API remains the existing Maintenance API configured by the Maintenance frontend, so the Maintenance database is separate in this phase.

The ERP `Switch Portal` panel is the access gate and checks `maintenancePortalAccess` before opening `/maintenance/` in a new tab. The ERP application remains in the original tab.

Future database work should replace the Maintenance API boundary only after the shared schema and migration plan are approved.
