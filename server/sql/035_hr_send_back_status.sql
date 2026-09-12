-- The HR workflow supports sending a pending request back for correction.
-- The original status constraint predates that workflow and must be widened
-- without changing or deleting any existing leave records.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'leave_requests_status_check'
          AND conrelid = 'leave_requests'::regclass
          AND pg_get_constraintdef(oid) ILIKE '%Sent Back%'
    ) THEN
        IF EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'leave_requests_status_check'
              AND conrelid = 'leave_requests'::regclass
        ) THEN
            ALTER TABLE leave_requests DROP CONSTRAINT leave_requests_status_check;
        END IF;

        ALTER TABLE leave_requests
            ADD CONSTRAINT leave_requests_status_check
            CHECK (status in ('Pending', 'Approved', 'Rejected', 'Cancelled', 'Sent Back'))
            NOT VALID;
    END IF;
END $$;
