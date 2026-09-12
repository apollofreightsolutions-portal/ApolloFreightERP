-- Maintenance Portal access is an independent Company Management permission.
-- Default false keeps the future portal closed until an administrator enables it.
alter table app_users add column if not exists maintenance_portal_access boolean not null default false;
