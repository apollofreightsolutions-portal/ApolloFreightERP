# Apollo Freight ERP — HR Portal Update

This package is based on the original `apollo-freighterp-main (24).zip` supplied for this update.

## Safety / existing data

- Existing `employees`, `leave_requests`, `payslips`, `hr_announcements`, and employee profile data are preserved.
- No existing ERP shipment, manifest, billing, customer portal, or authentication data is deleted by the HR migration.
- The HR changes are additive.
- The main ERP runtime remains the application shell; the new leave/calendar UI is loaded from `web/hr-portal.js`.

## Changed / new files

### New
- `web/hr-portal.js` — Employee leave application, balance, calendar, HR approvals, HR calendar rules, HR balances, and leave policy UI/API client.
- `server/sql/021_hr_leave_management.sql` — Additive database migration for HR calendar, leave types, policies, balances and leave ledger.
- `HR-PORTAL-UPDATE.md` — This deployment guide.

### Modified
- `web/app.js` — Loads the HR module separately after the core ERP runtime.
- `web/app-runtime.js` — Adds HR navigation entries and delegates the new HR leave screens to `window.ApolloHR`; the existing ERP modules remain in place.
- `web/styles.css` — Adds HR portal styling.
- `server/src/index.js` — Adds server-side HR leave/calendar/balance/policy endpoints and calculation rules.

## Database migration

The next migration is **021**. Do not rename it to 016; the original project already contains migrations through 020.

The server normally auto-runs migrations unless `AUTO_MIGRATE=false` is configured.

If you run migrations manually:

```bash
cd server
npm install
npm run migrate
```

Then start the API:

```bash
npm start
```

## Leave calculation rule

Actual leave days are calculated on the server:

`Calendar days - configured public holidays = actual leave days`

Configured weekend days count as leave days. When a weekend is also marked as a public holiday, it is counted once as a public holiday exclusion and not as leave. The public holiday is therefore deducted from the total leave days.

Blackout/restricted dates prevent a leave request from being submitted until HR changes the calendar rule.

Half-day requests deduct 0.5 day from the calculated working-day total.

## Leave balance

`Available = Entitlement + Carry Forward + Adjustment - Approved Leave`

Pending leave is shown separately and produces a projected balance.

HR can configure employee-specific entitlement/carry-forward/adjustment through **HR Leave Policies**.

## Employee application fields

- Leave type
- Full day / first-half / second-half
- Start date
- End date
- Rejoining date
- Contact number during leave
- Address/location during leave
- Emergency contact
- Reason
- Mandatory self-declaration

## HR controls

- Public holidays
- Weekend rules
- Blackout/restricted dates
- Leave type defaults
- Employee-specific leave policy overrides
- Employee leave balances
- Pending/approved/rejected applications
- Rejection reason
- Leave cancellation
- Rejoining confirmation

## Recommended deployment order

1. Back up the production PostgreSQL database.
2. Deploy the server code and SQL migration.
3. Allow migration 021 to complete.
4. Deploy the web files.
5. Hard refresh the browser (`Ctrl+F5`) and log in again.
6. Test the existing ERP shipment workflow first.
7. Test Employee Login and HR Leave.
8. Test HR Admin calendar and one leave approval.

## Verification checklist

- Existing company login works.
- Existing shipment creation works.
- Existing shipment register works.
- Employee Login works.
- Existing employee profile still appears.
- Existing leave history still appears.
- HR can add a public holiday.
- HR can configure weekends.
- Leave application excludes weekends/holidays.
- Leave balance shows entitlement/used/pending/available.
- HR can approve/reject.
- Rejected leave does not consume balance.
- Approved leave consumes actual working leave days.
- Employee can cancel an eligible request.
- Employee can mark rejoining.

## Rollback

If a deployment problem occurs, restore the previous application files. Do not delete the new HR tables from production while investigating. The migration is additive, so existing ERP/employee data remains intact.
