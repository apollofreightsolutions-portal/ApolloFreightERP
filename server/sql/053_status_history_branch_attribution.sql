alter table shipment_status_history
  add column if not exists branch text not null default '';

-- Backfill history only when the job number has belonged to one branch. If job numbers overlap
-- across branches, the old history did not record enough information to determine its origin.
update shipment_status_history h
set branch = unique_jobs.branch
from (
  select lower(trim(job_no)) as job_key, min(branch) as branch
  from shipments
  group by lower(trim(job_no))
  having count(distinct lower(trim(branch))) = 1
) unique_jobs
where lower(trim(h.job_no)) = unique_jobs.job_key
  and trim(coalesce(h.branch, '')) = '';

create index if not exists idx_status_history_branch_job_updated
  on shipment_status_history (branch, job_no, updated_at desc, id desc);
