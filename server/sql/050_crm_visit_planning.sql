-- Existing records are intentionally unclassified: a date alone is not proof of completion.
ALTER TABLE crm_visits ADD COLUMN IF NOT EXISTS visit_status text NOT NULL DEFAULT 'Unclassified';
ALTER TABLE crm_visits ADD COLUMN IF NOT EXISTS actual_visit_date date;
ALTER TABLE crm_visits ADD COLUMN IF NOT EXISTS salesperson text;
UPDATE crm_visits SET salesperson=created_by WHERE salesperson IS NULL;
CREATE INDEX IF NOT EXISTS crm_visits_plan_idx ON crm_visits(visit_status,visit_date);
