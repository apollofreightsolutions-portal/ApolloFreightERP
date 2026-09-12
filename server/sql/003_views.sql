create or replace view v_shipment_financials as
select
    job_no,
    branch,
    customer_name,
    origin,
    destination,
    status,
    booking_date,
    sell,
    buy_cost,
    sell - buy_cost as gross_profit,
    case
        when sell = 0 then 0
        else round(((sell - buy_cost) / sell) * 100, 2)
    end as margin_percent,
    pod_status,
    invoice_status
from shipments;

create or replace view v_pending_pod as
select
    job_no,
    customer_name,
    origin,
    destination,
    status,
    pod_status,
    booking_date
from shipments
where pod_status <> 'Uploaded';

create or replace view v_unbilled_shipments as
select
    job_no,
    customer_name,
    sell,
    buy_cost,
    pod_status,
    invoice_status,
    booking_date
from shipments
where invoice_status in ('Unbilled', 'Draft', 'Missing rate');

create or replace view v_consolidation_manifest as
select
    load_no,
    trip_date,
    route,
    transporter,
    vehicle_no,
    status,
    pieces,
    actual_kg,
    cbm,
    chargeable_kg,
    job_numbers
from consolidations;
