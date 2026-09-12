alter table shipment_requests drop constraint if exists shipment_requests_status_check;
alter table shipment_requests add constraint shipment_requests_status_check
    check (status in ('SUBMITTED','AUTO_APPROVED','PENDING_REVIEW','APPROVED','SENT_BACK','REJECTED','CANCELLED','COMPLETED'));
