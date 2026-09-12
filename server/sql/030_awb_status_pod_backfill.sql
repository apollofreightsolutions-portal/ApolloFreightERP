-- Synchronize historical shipments that already prove an AWB-level delivery.
create index if not exists idx_shipments_awb_normalized on shipments (lower(trim(airway_bill_no)));

-- Safe rule: only AWB groups with at least one Delivered + POD Uploaded shipment are changed.
-- Groups with no complete delivery evidence are left unchanged for manual review.

with completed_awbs as (
  select lower(trim(airway_bill_no)) as awb_key
  from shipments
  where nullif(trim(airway_bill_no), '') is not null
    and lower(trim(status)) = 'delivered'
    and lower(trim(pod_status)) = 'uploaded'
  group by lower(trim(airway_bill_no))
)
update shipments s
set status = 'Delivered',
    pod_status = 'Uploaded',
    updated_at = now()
where lower(trim(s.airway_bill_no)) in (select awb_key from completed_awbs);

with completed_awbs as (
  select lower(trim(airway_bill_no)) as awb_key
  from shipments
  where nullif(trim(airway_bill_no), '') is not null
    and lower(trim(status)) = 'delivered'
    and lower(trim(pod_status)) = 'uploaded'
  group by lower(trim(airway_bill_no))
), source_documents as (
  select distinct on (d.id)
    d.id,
    d.linked_no,
    d.type,
    d.status,
    d.date,
    d.owner,
    d.file_name,
    d.storage_url,
    d.notes,
    d.created_at,
    lower(trim(s.airway_bill_no)) as awb_key
  from documents d
  join shipments s on lower(trim(s.job_no)) = lower(trim(d.linked_no))
  where d.type = 'POD'
    and lower(trim(d.status)) = 'uploaded'
    and nullif(trim(s.airway_bill_no), '') is not null
    and lower(trim(s.status)) = 'delivered'
    and lower(trim(s.pod_status)) = 'uploaded'
    and lower(trim(s.airway_bill_no)) in (select awb_key from completed_awbs)
  order by d.id, d.created_at desc
)
insert into documents (document_no, linked_no, type, status, date, owner, file_name, storage_url, notes, created_by)
select
  'POD-AWB-BACKFILL-' || target.job_no || '-' || source.id,
  target.job_no,
  source.type,
  source.status,
  source.date,
  source.owner,
  source.file_name,
  source.storage_url,
  source.notes,
  coalesce(source.owner, 'system-awb-backfill')
from source_documents source
join shipments target on lower(trim(target.airway_bill_no)) = source.awb_key
where lower(trim(target.job_no)) <> lower(trim(source.linked_no))
on conflict (document_no) do update set
  file_name = excluded.file_name,
  storage_url = excluded.storage_url,
  notes = excluded.notes,
  status = 'Uploaded',
  date = excluded.date,
  owner = excluded.owner,
  updated_at = now();

with completed_awbs as (
  select lower(trim(airway_bill_no)) as awb_key
  from shipments
  where nullif(trim(airway_bill_no), '') is not null
    and lower(trim(status)) = 'delivered'
    and lower(trim(pod_status)) = 'uploaded'
  group by lower(trim(airway_bill_no))
)
insert into shipment_status_history (job_no, status, pod_status, invoice_status, notes, updated_by, updated_at)
select
  s.job_no,
  'Delivered',
  'Uploaded',
  coalesce(s.invoice_status, ''),
  'Historical AWB backfill: synchronized from existing Delivered + POD Uploaded evidence for AWB ' || trim(s.airway_bill_no),
  'system-awb-backfill',
  now()
from shipments s
where lower(trim(s.airway_bill_no)) in (select awb_key from completed_awbs)
  and not exists (
    select 1
    from shipment_status_history h
    where h.job_no = s.job_no
      and h.updated_by = 'system-awb-backfill'
      and h.status = 'Delivered'
      and h.pod_status = 'Uploaded'
  );

-- Future changes are handled by the transactional AWB endpoints in server/src/index.js.
-- No branch column is consulted: any authenticated Branch user may complete the AWB group.

select 1;

-- End of 030_awb_status_pod_backfill.sql
