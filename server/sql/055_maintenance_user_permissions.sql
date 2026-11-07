ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS maintenance_can_create boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_can_view_all boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_can_update_own boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_can_edit_all boolean NOT NULL DEFAULT false;

-- Keep the current access assignment as the only basis for migration backfill.
-- Users without explicit Maintenance access remain outside the portal, including Admins.
UPDATE app_users
SET maintenance_can_create = (
      maintenance_portal_access = true
      OR can_view_all_entry = true
      OR can_edit_all_entry = true
      OR lower(trim(role)) IN ('admin', 'administrator')
    ),
    maintenance_can_view_all = (
      lower(trim(role)) IN ('admin', 'administrator', 'accountant', 'accounts')
      OR can_view_all_entry = true
      OR can_edit_all_entry = true
    ),
    maintenance_can_update_own = (
      lower(trim(role)) IN ('admin', 'administrator')
      OR maintenance_portal_access = true
      OR can_view_only_self_entry IS DISTINCT FROM true
    ),
    maintenance_can_edit_all = (
      lower(trim(role)) IN ('admin', 'administrator')
      OR can_edit_all_entry = true
    )
WHERE maintenance_portal_access = true;
