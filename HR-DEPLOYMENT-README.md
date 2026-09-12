# Apollo Freight ERP — HR Portal Completion Package

## Base
This package is based on the current project supplied by the user (`apollo-freighterp-main (27).zip`).

## What is completed
- Employee My Leave application with full application-style form
- Employee leave balance panel
- Employee leave calendar with month grid
- Public holiday / weekend / blackout handling
- Server-side actual working-day calculation
- Self-declaration
- Contact during leave, leave address, emergency contact and rejoining date
- Half-day leave validation
- Supporting document upload and private viewing
- Leave approvals for Admin/HR
- Leave cancellation and rejoining confirmation
- HR calendar/rules panel
- HR leave balances panel
- HR leave policies and employee overrides
- Admin leave type create/update panel
- Admin/HR access to the Employee Portal
- Employee document isolation: Admin can view/upload documents for the selected employee only; employees can access only their own documents

## Important deployment order
1. Back up the currently deployed ERP and database.
2. Deploy the application files from this package.
3. Keep all existing SQL migrations. Do NOT remove 001–020.
4. Run `server/sql/021_hr_leave_management.sql` through the normal migration process.
5. Confirm the server starts successfully.
6. Test an employee login and an Admin/HR login.
7. Test Customer Portal, shipment, manifest and normal ERP functions.

## Files changed for this completion
- `web/hr-portal.js` — completed HR/Employee leave UI and workflow
- `web/app-runtime.js` — existing HR routing remains compatible with the separate HR module
- `web/app.js` — HR module remains dynamically loaded without blocking the core ERP
- `web/styles.css` — HR form/calendar styling
- `server/src/index.js` — HR APIs, leave attachment handling, and employee-document access isolation
- `server/sql/021_hr_leave_management.sql` — HR leave/calendar schema extension

## Existing data
Existing employee records, existing leave requests, payslips, announcements and other ERP records are preserved. The migration uses `IF NOT EXISTS` / upsert patterns and does not drop employee or leave tables.

## Customer Portal
No Customer Portal feature was intentionally redesigned. Shared runtime/server files contain only the HR integration and document-security corrections. Test Customer Portal login, shipment request, tracking and profile after deployment.

## Verification checklist
- Employee: My Leave opens as a real application panel.
- Employee: Leave Balance opens and shows entitlement/used/pending/available/projected.
- Employee: Leave Calendar opens and shows the current month.
- Admin: Leave Approvals opens and shows applications.
- Admin: HR Calendar & Rules opens.
- Admin: HR Leave Balances opens.
- Admin: HR Leave Policies opens.
- Employee documents show only the selected employee's documents.
- Public holiday in a leave range is not deducted.
- Configured weekend is not deducted.
- Half-day requires the same start/end date.
- Rejoining date is required and cannot be before the leave end date.
- Self-declaration is required.
- Existing ERP and Customer Portal continue to work.
