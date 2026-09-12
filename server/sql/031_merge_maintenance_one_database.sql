BEGIN;

-- Preserve the complete legacy identity data for audit and rollback.
CREATE TABLE IF NOT EXISTS maintenance_user_archive (
  maintenance_user_id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  username varchar(80) NOT NULL,
  email varchar(160),
  role varchar(20) NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  password_hash text NOT NULL,
  reset_otp_hash text,
  reset_otp_expires_at timestamptz,
  source_archived_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO maintenance_user_archive
  (maintenance_user_id, name, username, email, role, permissions, password_hash, reset_otp_hash, reset_otp_expires_at)
SELECT id, name, username, email, role, permissions, password_hash, reset_otp_hash, reset_otp_expires_at
FROM maintenance_legacy.users
ON CONFLICT (maintenance_user_id) DO NOTHING;

-- ERP is the sole active identity system. Only the four approved ERP users
-- receive Maintenance access; their ERP roles and passwords remain authoritative.
UPDATE app_users
SET maintenance_portal_access = false,
    updated_at = now()
WHERE account_status = 'Active';

UPDATE app_users
SET maintenance_portal_access = true,
    updated_at = now()
WHERE account_status = 'Active'
  AND lower(trim(user_name)) IN ('habeeb', 'anish', 'nilesh', 'khaldoun');

CREATE TABLE IF NOT EXISTS maintenance_user_map (
  maintenance_user_id uuid PRIMARY KEY REFERENCES maintenance_user_archive(maintenance_user_id),
  erp_user_id bigint NOT NULL REFERENCES app_users(id),
  matched_by text NOT NULL CHECK (matched_by IN ('username', 'email', 'created_erp_user')),
  mapped_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (erp_user_id)
);

INSERT INTO maintenance_user_map (maintenance_user_id, erp_user_id, matched_by)
SELECT m.maintenance_user_id, e.id,
       CASE
         WHEN lower(trim(e.user_name)) = lower(trim(m.username)) THEN 'username'
         ELSE 'email'
       END
FROM maintenance_user_archive m
JOIN app_users e
  ON lower(trim(e.user_name)) = lower(trim(m.username))
  OR (nullif(trim(m.email),'') IS NOT NULL AND lower(trim(e.email)) = lower(trim(m.email)))
WHERE lower(trim(m.username)) IN ('habeeb', 'anish', 'nilesh', 'khaldoun')
ON CONFLICT (maintenance_user_id) DO NOTHING;

-- Maintenance-only operational data is moved into public tables with distinct
-- names, avoiding numeric/UUID collisions with ERP operational tables.
CREATE TABLE IF NOT EXISTS maintenance_vehicles (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  plate_number varchar(50) NOT NULL UNIQUE,
  type varchar(50) NOT NULL,
  driver_name varchar(120),
  route_name varchar(160),
  status varchar(30) NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES app_users(id)
);

CREATE TABLE IF NOT EXISTS maintenance_expenses (
  id uuid PRIMARY KEY,
  vehicle_id uuid NOT NULL REFERENCES maintenance_vehicles(id) ON DELETE CASCADE,
  type varchar(80) NOT NULL,
  amount numeric(12,3) NOT NULL,
  currency varchar(10) NOT NULL,
  expense_date date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_status varchar(10) NOT NULL DEFAULT 'unpaid',
  created_by bigint REFERENCES app_users(id)
);

CREATE TABLE IF NOT EXISTS maintenance_vehicle_history (
  id uuid PRIMARY KEY,
  vehicle_id uuid NOT NULL REFERENCES maintenance_vehicles(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_row jsonb NOT NULL,
  new_row jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS maintenance_expense_history (
  id uuid PRIMARY KEY,
  expense_id uuid NOT NULL REFERENCES maintenance_expenses(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_row jsonb NOT NULL,
  new_row jsonb NOT NULL
);

INSERT INTO maintenance_vehicles
  (id, name, plate_number, type, driver_name, route_name, status, created_at, updated_at, created_by)
SELECT v.id, v.name, v.plate_number, v.type, v.driver_name, v.route_name, v.status,
       v.created_at, v.updated_at, um.erp_user_id
FROM maintenance_legacy.vehicles v
LEFT JOIN maintenance_user_map um ON um.maintenance_user_id = v.created_by
ON CONFLICT (id) DO NOTHING;

INSERT INTO maintenance_expenses
  (id, vehicle_id, type, amount, currency, expense_date, notes, created_at, updated_at, paid_status, created_by)
SELECT e.id, e.vehicle_id, e.type, e.amount, e.currency, e.expense_date, e.notes,
       e.created_at, e.updated_at, e.paid_status, um.erp_user_id
FROM maintenance_legacy.expenses e
LEFT JOIN maintenance_user_map um ON um.maintenance_user_id = e.created_by
ON CONFLICT (id) DO NOTHING;

INSERT INTO maintenance_vehicle_history (id, vehicle_id, changed_at, old_row, new_row)
SELECT h.id, h.vehicle_id, h.changed_at, h.old_row, h.new_row
FROM maintenance_legacy.vehicle_history h
ON CONFLICT (id) DO NOTHING;

INSERT INTO maintenance_expense_history (id, expense_id, changed_at, old_row, new_row)
SELECT h.id, h.expense_id, h.changed_at, h.old_row, h.new_row
FROM maintenance_legacy.expense_history h
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_maintenance_vehicles_created_by_created_at
  ON maintenance_vehicles(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_expenses_created_by_created_at
  ON maintenance_expenses(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_vehicle_history_vehicle_id_changed_at
  ON maintenance_vehicle_history(vehicle_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_expense_history_expense_id_changed_at
  ON maintenance_expense_history(expense_id, changed_at DESC);

COMMIT;
