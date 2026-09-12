alter table employees add column if not exists nationality text not null default '';
alter table employees add column if not exists date_of_birth date;
alter table employees add column if not exists civil_id_no text not null default '';
alter table employees add column if not exists passport_no text not null default '';
alter table employees add column if not exists passport_expiry date;
alter table employees add column if not exists current_address text not null default '';
alter table employees add column if not exists permanent_address text not null default '';
alter table employees add column if not exists emergency_contact_name text not null default '';
alter table employees add column if not exists emergency_contact_phone text not null default '';
