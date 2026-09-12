# Maintenance Portal Module

This is the compiled Maintenance frontend from the `apollo-freight` project, hosted under `/maintenance/` inside the ERP web project.

The Maintenance frontend continues to use its existing Maintenance API and database for this first code-side merge. The ERP portal controls entry through the existing `maintenancePortalAccess` permission, and the Switch Portal action opens this module in a new tab so the ERP portal remains available.

The databases are intentionally not merged in this phase. A later migration can move the Maintenance vehicle, expense, and user data into the selected shared schema after field mapping, duplicate handling, permission mapping, and rollback testing are complete.
