# Deploy Patches — ERP Portal Updates

This file documents the latest deployment patches included in the ERP portal.

---

# 1. Split-POD Critical Bug Fixes

This replaces both the "Split / Partial POD generation" patch and the
"POD print layout fixes" patch sent earlier.

## Files

- `web/app-runtime.js` → replace
- `server/src/index.js` → replace
- `server/sql/024_shipment_pod_splits.sql` → add

## Bugs fixed

1. `pod_splits_json` was registered under the wrong server resource.
   It is now correctly registered under `shipments`.

2. Delivery details were not being rebuilt into the shipment `notes`
   JSON before saving. This caused delivery information to revert after
   a page reload.

3. Delivery history was not being loaded back from the database after
   a page reload. Saved split delivery information is now displayed
   correctly.

## Included POD features

- Split/partial POD generation
- Multiple delivery parts for one shipment
- Individual signed POD PDF for each delivery part
- Shipment becomes fully Delivered only after all parts are accounted for
- Receiver Remarks box
- Improved signature block spacing
- Delivery Sequence such as "Delivery 2 of 2"
- Correct delivery address for each split
- Delivery history displayed in the application

---

# 2. Manifest Bulk Status Update Fix

## Files

- `web/app-runtime.js` → replace
- `server/src/index.js` → replace

No additional database changes are required for this fix.

## Bug fixed

The previous customer-block check compared the customer's block status
against the branch of the currently logged-in staff user.

This caused problems with bulk operations such as "Update Manifest Status",
because one operator can update shipments belonging to different branches.

The check now uses the shipment's own stored branch.

For older shipments where the branch cannot be determined, the system no
longer incorrectly blocks the operation simply because the branch is unknown.

A customer that is fully blocked without a branch recorded continues to
remain blocked everywhere.

---

# Deployment

1. Restart/redeploy the server.
2. Ensure the required SQL migrations have been applied.
3. Redeploy/refresh the frontend.
4. Clear CDN/browser cache if required.
5. Test shipment saving, page reload, split POD, delivery history and
   manifest bulk status update.