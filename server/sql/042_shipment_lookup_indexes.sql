-- Speeds up AWB group synchronization when saving/updating a shipment. The sync query joins
-- shipment_status_history to shipments on lower(trim(job_no)); without an index on that exact
-- expression it scans the whole history table on every save. Safe to re-run.
create index if not exists idx_shipments_job_no_normalized on shipments (lower(trim(job_no)));
create index if not exists idx_shipment_status_history_job_no_normalized on shipment_status_history (lower(trim(job_no)));
