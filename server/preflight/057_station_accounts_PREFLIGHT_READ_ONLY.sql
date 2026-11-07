-- Run before 057_station_customer_accounts.sql. This file is READ ONLY.
-- Review legacy cross-station blocks: do not move a KWI block to an active DXB account.
select code,name,branch,status,blocked_branches from customers
where lower(trim(status))='blocked' order by branch,name,code;
-- Existing same-station punctuation variants need manual review, not an automatic merge.
select lower(trim(branch)) as stored_branch,regexp_replace(lower(name),'[[:space:][:punct:]]+','','g') as normalized_name,
 count(*) as accounts,string_agg(code,', ' order by code) as account_codes
from customers group by 1,2 having count(*)>1;
-- Historical shared accounts: use this list to prepare the receiving-station accounts.
select distinct s.branch as job_station,s.customer_name,c.code as existing_account,c.branch as account_station
from shipments s left join customers c on lower(trim(c.name))=lower(trim(s.customer_name))
where c.code is null or lower(trim(s.branch))<>lower(trim(c.branch))
order by s.branch,s.customer_name;
