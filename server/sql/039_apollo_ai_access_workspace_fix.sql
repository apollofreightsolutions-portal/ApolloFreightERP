-- Apollo AI V2 hotfix
-- 1) Make AI usable by active internal users by default.
-- 2) Keep the existing ai_access flag so Admin can explicitly disable Apollo AI per user.
-- 3) This changes feature availability only; data visibility is still enforced server-side by
--    each user's branch, ERP section, CRM ownership, and HR permissions.

alter table app_users alter column ai_access set default true;

update app_users
set ai_access = true
where lower(coalesce(account_status, 'Active')) = 'active'
  and (
    coalesce(erp_portal_access, true) = true
    or coalesce(hr_portal_access, false) = true
    or coalesce(crm_portal_access, false) = true
  );
