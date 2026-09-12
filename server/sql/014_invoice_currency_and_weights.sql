alter table invoices add column if not exists gross_weight numeric(12, 3) not null default 0;
alter table invoices add column if not exists volume_weight numeric(12, 3) not null default 0;
alter table invoices add column if not exists currency text not null default 'KD';
