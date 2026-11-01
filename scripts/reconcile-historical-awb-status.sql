-- Historical AWB status reconciliation (standalone operational script; not a migration).
-- Run from psql with: \set apply false, then \i scripts/reconcile-historical-awb-status.sql
-- Review the dry-run output. To apply: \set apply true, then run the \i command again.
-- Winner rule: the status on the most recently inserted history row (largest history id)
-- for an AWB group is applied to all shipments in that group, across all branches.
-- Groups with no status-history rows are reported and skipped; blank AWBs are excluded.

\if :{?apply}
\else
\set apply false
\endif
\pset pager off
\set ON_ERROR_STOP on

\if :apply
\echo 'APPLY MODE: shipment statuses will be changed. Confirm a database backup exists.'
\else
\echo 'DRY-RUN MODE: no shipment or history rows will be changed.'
\endif

BEGIN;
LOCK TABLE shipments IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE shipment_status_history IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE awb_reconcile_plan ON COMMIT DROP AS
WITH shipment_rows AS (
  SELECT
    s.job_no,
    s.branch,
    s.status,
    lower(btrim(coalesce(nullif(btrim(s.airway_bill_no), ''), replace(s.job_no, 'AFS', 'AWB')))) AS awb_key
  FROM shipments s
), awb_groups AS (
  SELECT
    awb_key,
    count(*)::integer AS shipment_count,
    count(DISTINCT lower(btrim(coalesce(status, ''))))::integer AS current_status_count,
    string_agg(DISTINCT coalesce(nullif(btrim(branch), ''), '(branch blank)'), ', ' ORDER BY coalesce(nullif(btrim(branch), ''), '(branch blank)')) AS branches,
    string_agg(DISTINCT coalesce(nullif(btrim(status), ''), '(status blank)'), ', ' ORDER BY coalesce(nullif(btrim(status), ''), '(status blank)')) AS current_statuses
  FROM shipment_rows
  WHERE awb_key <> ''
  GROUP BY awb_key
  HAVING count(*) > 1
), latest_history AS (
  SELECT DISTINCT ON (sr.awb_key)
    sr.awb_key,
    h.status AS target_status,
    h.job_no AS source_job_no,
    h.id AS source_history_id,
    h.updated_at AS source_history_date
  FROM shipment_status_history h
  JOIN shipment_rows sr ON lower(btrim(sr.job_no)) = lower(btrim(h.job_no))
  WHERE sr.awb_key <> ''
    AND nullif(btrim(coalesce(h.status, '')), '') IS NOT NULL
  ORDER BY sr.awb_key, h.id DESC
)
SELECT
  g.awb_key,
  g.shipment_count,
  g.current_status_count,
  g.branches,
  g.current_statuses,
  h.target_status,
  h.source_job_no,
  h.source_history_id,
  h.source_history_date
FROM awb_groups g
LEFT JOIN latest_history h ON h.awb_key = g.awb_key;

SELECT
  count(*) AS multi_shipment_awb_groups,
  count(*) FILTER (WHERE target_status IS NOT NULL) AS groups_with_history,
  count(*) FILTER (WHERE target_status IS NULL) AS groups_skipped_no_history,
  count(*) FILTER (WHERE target_status IS NOT NULL AND current_status_count > 1) AS groups_with_different_current_statuses,
  coalesce(sum(shipment_count) FILTER (WHERE target_status IS NOT NULL AND current_status_count > 1), 0) AS shipments_in_groups_to_review
FROM awb_reconcile_plan;

SELECT
  awb_key,
  branches,
  shipment_count,
  current_statuses,
  target_status,
  source_job_no AS latest_history_job_no,
  source_history_id,
  source_history_date
FROM awb_reconcile_plan
WHERE target_status IS NULL OR current_status_count > 1
ORDER BY target_status NULLS FIRST, awb_key;

\if :apply
CREATE TEMP TABLE awb_reconcile_changed (
  job_no text,
  branch text,
  status text,
  pod_status text,
  invoice_status text,
  awb_key text
) ON COMMIT DROP;

WITH changed_rows AS (
  UPDATE shipments s
  SET status = p.target_status,
      updated_at = now()
  FROM awb_reconcile_plan p
  WHERE p.target_status IS NOT NULL
    AND lower(btrim(coalesce(nullif(btrim(s.airway_bill_no), ''), replace(s.job_no, 'AFS', 'AWB')))) = p.awb_key
    AND lower(btrim(coalesce(s.status, ''))) <> lower(btrim(p.target_status))
  RETURNING
    s.job_no,
    s.branch,
    s.status,
    s.pod_status,
    s.invoice_status,
    lower(btrim(coalesce(nullif(btrim(s.airway_bill_no), ''), replace(s.job_no, 'AFS', 'AWB')))) AS awb_key
)
INSERT INTO awb_reconcile_changed (job_no, branch, status, pod_status, invoice_status, awb_key)
SELECT job_no, branch, status, pod_status, invoice_status, awb_key
FROM changed_rows;

INSERT INTO shipment_status_history
  (job_no, branch, status, pod_status, invoice_status, notes, updated_by, updated_at)
SELECT
  c.job_no,
  coalesce(c.branch, ''),
  c.status,
  coalesce(c.pod_status, ''),
  coalesce(c.invoice_status, ''),
  format('Bulk historical AWB reconciliation; latest history row %s (job %s) selected status %s.', p.source_history_id, p.source_job_no, p.target_status),
  'awb-reconciliation',
  now()
FROM awb_reconcile_changed c
JOIN awb_reconcile_plan p ON p.awb_key = c.awb_key;

SELECT count(*) AS shipment_rows_updated FROM awb_reconcile_changed;
SELECT count(*) AS reconciliation_history_rows_inserted FROM awb_reconcile_changed;
COMMIT;
\else
ROLLBACK;
\endif
