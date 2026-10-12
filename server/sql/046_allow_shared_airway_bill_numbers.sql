-- Multiple shipment jobs may intentionally share one Airway Bill number.
-- Status synchronization is performed by the application at AWB-group level;
-- an AWB must not be unique per branch.
drop index concurrently if exists shipments_branch_airway_bill_no_unique;
