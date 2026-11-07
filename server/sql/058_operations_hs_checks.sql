-- Additive, isolated internal HS workspace. Run after existing SQL 042 and 054.
begin;
create table if not exists operations_hs_checks (like customer_compliance_checks including all);
create table if not exists operations_hs_help (like customer_hs_help including all);
commit;
