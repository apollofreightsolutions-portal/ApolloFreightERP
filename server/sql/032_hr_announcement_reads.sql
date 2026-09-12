create table if not exists hr_announcement_reads (
    announcement_id integer not null references hr_announcements(id) on delete cascade,
    user_name text not null,
    read_at timestamptz not null default now(),
    primary key (announcement_id, user_name)
);

create index if not exists idx_hr_announcement_reads_user
    on hr_announcement_reads (lower(user_name));

create index if not exists idx_hr_announcement_reads_announcement
    on hr_announcement_reads (announcement_id);


-- This migration is intentionally additive. Existing announcements remain visible
-- in the Announcements panel; this table only records each user's explicit read action.
