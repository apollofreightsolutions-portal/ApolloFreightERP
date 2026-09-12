-- Apply the latest known status event to every shipment sharing an Airway Bill.
-- History rows are authoritative when present; shipment updated_at is the fallback for
-- older records that predate status-history capture.
create index if not exists idx_shipment_status_history_job_updated
  on shipment_status_history (job_no, updated_at desc, id desc);

with awb_events as (
  select
    lower(trim(s.airway_bill_no)) as awb_key,
    h.status,
    h.pod_status,
    h.updated_at,
    1 as source_priority,
    h.id as source_id
  from shipment_status_history h
  join shipments s on lower(trim(s.job_no)) = lower(trim(h.job_no))
  where nullif(trim(s.airway_bill_no), '') is not null

  union all

  select
    lower(trim(s.airway_bill_no)) as awb_key,
    s.status,
    s.pod_status,
    s.updated_at,
    0 as source_priority,
    s.id as source_id
  from shipments s
  where nullif(trim(s.airway_bill_no), '') is not null
), latest_awb_state as (
  select distinct on (awb_key)
    awb_key,
    status,
    pod_status
  from awb_events
  order by awb_key, updated_at desc, source_priority desc, source_id desc
), changed as (
  update shipments s
  set status = latest.status,
      pod_status = latest.pod_status,
      updated_at = now()
  from latest_awb_state latest
  where lower(trim(s.airway_bill_no)) = latest.awb_key
    and (lower(trim(s.status)) <> lower(trim(latest.status))
      or lower(trim(s.pod_status)) <> lower(trim(latest.pod_status)))
  returning s.job_no, s.status, s.pod_status, s.invoice_status
)
insert into shipment_status_history (job_no, status, pod_status, invoice_status, notes, updated_by, updated_at)
select
  changed.job_no,
  changed.status,
  changed.pod_status,
  coalesce(changed.invoice_status, ''),
  'Historical AWB latest-status synchronization',
  'system-awb-latest-backfill',
  now()
from changed
where not exists (
  select 1
  from shipment_status_history h
  where h.job_no = changed.job_no
    and h.updated_by = 'system-awb-latest-backfill'
    and h.status = changed.status
    and h.pod_status = changed.pod_status
);

select 1;
