-- V32 revised: additive identity column, no renumbering, no historical backfill.
begin;
alter table shipments add column if not exists customer_code text not null default '';
create or replace function apollo_station(v text) returns text language sql immutable as $$
 select case lower(trim(coalesce(v,''))) when 'dxb' then 'Dubai' when 'dbx' then 'Dubai' when 'dubai' then 'Dubai' when 'branch 2' then 'Dubai' when 'dubai 2' then 'Dubai' when 'kwi' then 'Kuwait HO' when 'kuwait' then 'Kuwait HO' when 'kuwait ho' then 'Kuwait HO' when 'branch 1' then 'Kuwait HO' when 'kuwait 1' then 'Kuwait HO' else trim(coalesce(v,'')) end
$$;
create or replace function apollo_customer_name(v text) returns text language sql immutable as $$
 select regexp_replace(lower(trim(coalesce(v,''))), '[[:space:][:punct:]]+', '', 'g')
$$;
create index if not exists customers_station_name_lookup on customers(apollo_station(branch),apollo_customer_name(name));
-- Do not silently reinterpret old cross-station blocks as local blocks.
do $$ begin
 if exists(select 1 from customers c where lower(trim(status))='blocked' and trim(coalesce(blocked_branches,''))<>'' and (lower(trim(blocked_branches))='both' or not exists(select 1 from unnest(string_to_array(blocked_branches,',')) b where apollo_station(b)=apollo_station(c.branch)) or cardinality(string_to_array(blocked_branches,','))>1)) then
  raise exception 'V32 preflight: legacy cross-station customer blocks exist. Review code/branch/blocked_branches and split those accounts before applying SQL 057. No changes from this migration were committed.';
 end if;
end $$;
create or replace function apollo_customer_identity_guard() returns trigger language plpgsql as $$
begin
 if TG_OP='UPDATE' and (NEW.code is distinct from OLD.code or apollo_station(NEW.branch) is distinct from apollo_station(OLD.branch)) then
   raise exception 'Customer code and station cannot be changed. Create a separate station account; existing jobs must retain their identity.' using errcode='P0001';
 end if;
 if TG_OP='INSERT' or apollo_customer_name(NEW.name) is distinct from apollo_customer_name(OLD.name) then
   if apollo_station(NEW.branch) not in ('Dubai','Kuwait HO') then raise exception 'Choose DXB or KWI for the customer account.'; end if;
   perform pg_advisory_xact_lock(hashtext(apollo_station(NEW.branch)||':'||apollo_customer_name(NEW.name)));
   if exists(select 1 from customers c where c.id<>NEW.id and apollo_station(c.branch)=apollo_station(NEW.branch) and apollo_customer_name(c.name)=apollo_customer_name(NEW.name)) then
     raise exception 'A customer with this name already exists in this station. Use the existing account number.' using errcode='P0001';
   end if;
 end if;
 return NEW;
end $$;
drop trigger if exists apollo_customer_identity on customers;
create trigger apollo_customer_identity before insert or update on customers for each row execute function apollo_customer_identity_guard();

-- Exact local code is authoritative; names only resolve legacy/cross-station templates.
create or replace function apollo_local_customer(station text, customer_name text, customer_code text) returns customers language plpgsql stable as $$
declare c customers; n integer;
begin
 if apollo_station(station) not in ('Dubai','Kuwait HO') then raise exception 'The job needs an explicit DXB or KWI station.'; end if;
 select * into c from customers where lower(trim(code))=lower(trim(coalesce(customer_code,''))) and apollo_station(branch)=apollo_station(station);
 if found then return c; end if;
 select count(*) into n from customers where apollo_station(branch)=apollo_station(station) and apollo_customer_name(name)=apollo_customer_name(customer_name);
 if n<>1 then raise exception 'Select or create the local % customer account. Missing or ambiguous account: %',apollo_station(station),customer_name; end if;
 select * into c from customers where apollo_station(branch)=apollo_station(station) and apollo_customer_name(name)=apollo_customer_name(customer_name);
 return c;
end $$;
create or replace function apollo_assert_account_active(station text, customer_name text, customer_code text) returns text language plpgsql as $$
declare c customers;
begin
 c:=apollo_local_customer(station,customer_name,customer_code);
 select * into c from customers where id=c.id for share;
 if lower(trim(c.status))='blocked' then raise exception 'Account % (%) is blocked in %. Unblock it before changing this job, clearance, POD or related records.',c.name,c.code,apollo_station(station) using errcode='P0001'; end if;
 return c.code;
end $$;
create or replace function apollo_notes_customer_code(v text) returns text language plpgsql immutable as $$
begin return coalesce(v::jsonb->>'customerCode',''); exception when others then return ''; end $$;
create or replace function apollo_assert_job_active(job text) returns void language plpgsql as $$
declare s shipments;
begin
 select * into s from shipments where lower(trim(job_no))=lower(trim(job));
 if not found then raise exception 'Shipment % not found.',job; end if;
 perform apollo_assert_account_active(s.branch,s.customer_name,coalesce(nullif(s.customer_code,''),apollo_notes_customer_code(s.notes)));
end $$;
create or replace function apollo_job_writable(station text, customer_name text, customer_code text) returns boolean language plpgsql as $$
begin perform apollo_assert_account_active(station,customer_name,customer_code); return true;
exception when sqlstate 'P0001' then return false; end $$;
create or replace function apollo_shipment_account_guard() returns trigger language plpgsql as $$
begin
 if TG_OP<>'INSERT' then
   perform apollo_assert_account_active(OLD.branch,OLD.customer_name,coalesce(nullif(OLD.customer_code,''),apollo_notes_customer_code(OLD.notes)));
 end if;
 if TG_OP='DELETE' then return OLD; end if;
 if TG_OP='UPDATE' and apollo_station(NEW.branch) is distinct from apollo_station(OLD.branch) then raise exception 'Do not move an existing job between stations. Fetch its AWB to create the receiving station job.'; end if;
 NEW.customer_code:=apollo_assert_account_active(NEW.branch,NEW.customer_name,coalesce(nullif(NEW.customer_code,''),apollo_notes_customer_code(NEW.notes)));
 return NEW;
end $$;
drop trigger if exists apollo_shipment_account on shipments;
create trigger apollo_shipment_account before insert or update or delete on shipments for each row execute function apollo_shipment_account_guard();

-- Cover generic mutation routes too; a blocked account cannot be bypassed through documents/history/charges/invoices/manifests.
create or replace function apollo_related_job_guard() returns trigger language plpgsql as $$
declare doc jsonb; job text; refs text; pass integer;
begin
 for pass in 1..2 loop
   if pass=1 and TG_OP='INSERT' then continue; end if;
   if pass=2 and TG_OP='DELETE' then continue; end if;
   doc:=case when pass=1 then to_jsonb(OLD) else to_jsonb(NEW) end;
   refs:=case TG_TABLE_NAME when 'consolidations' then doc->>'job_numbers' when 'documents' then doc->>'linked_no' when 'invoices' then doc->>'shipment_no' when 'additional_charges' then doc->>'shipment_no' else doc->>'job_no' end;
   for job in select trim(x) from unnest(string_to_array(coalesce(refs,''),',')) x loop
     if exists(select 1 from shipments where lower(trim(job_no))=lower(job)) then perform apollo_assert_job_active(job); end if;
   end loop;
 end loop;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
do $$ declare t text; begin
 foreach t in array array['documents','shipment_status_history','invoices','consolidations','additional_charges'] loop
  if to_regclass(t) is not null then
   execute format('drop trigger if exists apollo_related_account on %I',t);
   execute format('create trigger apollo_related_account before insert or update or delete on %I for each row execute function apollo_related_job_guard()',t);
  end if;
 end loop;
end $$;
commit;
