# V26.1 Revised — visit planning, CRM filters and grounded sales AI

Use this full package instead of the earlier V26.1 CRM database ZIP. It retains that import/export functionality and the original uploaded project's task-email, HR and shipment workflows. It is separate from V27.2 billing and the separately supplied V26 AI-provider patch. This package does not switch AI providers.

## REQUIRED deployment order
1. Back up the live database and retain the currently deployed ZIP/revision.
2. Against the SAME database/schema used by Connected, apply ONLY `server/sql/050_crm_visit_planning.sql` through your normal approved migration process. Do not run all migrations blindly. This script is repeatable and adds three visit fields and an index; it does not remove rows.
3. Deploy this full project using existing secrets/environment settings; no new dependencies.
4. Refresh the browser. The frontend cache version is `apollo-v262-planning-20261025` (internal asset tag, not the ZIP's product version).
5. Sign in as management, schedule a test visit next week for an account's salesperson, filter that person + Next week, and ask Apollo AI the same question. Mark a test visit Completed with actual date and outcome; confirm the completed view. Verify one restricted salesperson cannot see another's records. Recheck database import/export on a small sample.

Rollback: redeploy the previous application revision if needed. The added database columns can remain; older code ignores them. Do not drop columns containing newly entered planning information.

## Visits
Scheduled date/time is separate from actual visit date. Explicit statuses: Planned, Completed, Cancelled, No-show, Unclassified. Completion requires an actual date and outcome. Salesperson is recorded separately from the immutable creator. Management can assign a visit only to an active CRM user with access to that customer. Existing visits remain Unclassified, with their original creator as salesperson; a past date alone is not treated as completed work. Review these historical entries when appropriate.

Visit shortcuts: This week / Next week (planned, Sunday–Saturday), Overdue planned, Completed. Date-basis selector chooses scheduled or actual completed date. Next-week scheduling requires staff to actually enter their plans; no visits are invented from notes.

## Filters
Dashboard, Accounts, Contacts, Opportunities, Visits, Meetings, Follow-ups, Activity, Reports, Team and Admin have relevant combinations of search, owner/actor, entity, customer, status/action and dates, with Reset filters. Filters combine rather than overwriting one another. Search applies on change/blur. Date labels describe the field: account/contact creation, opportunity expected close, scheduled/actual visits, meeting date, task due date and activity timestamp.

Dashboard/report dates apply separately to each dataset's named business date. Account counts in a dated summary therefore count accounts created in that range. Opportunity ownership, visit salesperson, meeting author and task assignee are used respectively. Pipeline monetary totals are omitted when they would combine non-AED/multiple currencies; counts are still shown. Report visit counts mean explicitly completed visits, not all saved rows. Last Visit on accounts means an actual completed visit.

Original CSV and database XLSX exports remain full permitted exports; panel filters do not alter those exports. The database export still has its own server-side permission and account visibility checks.

Filters load a permission-scoped snapshot of up to 10,000 rows per section. If any section exceeds this limit, the view reports an explicit error instead of showing partial totals; further server pagination is then required. No hidden 1,000/1,500-row list limit is used for the new views. Mutations invalidate the snapshot.

## Apollo AI
Fixed CRM routing for visits/opportunities, and added direct, read-only database answers for sales review questions. These answers do not require the external language-model service. Existing AI access requirements remain enforced; only admin may query all accounts through AI, while non-admin AI users retain assigned-account restrictions.

Examples: “whats ahmad visits for coming week”, “how many opportunities ahmad has”, “sales summary for Ahmad Gameel this week”, “completed visits last week”, “overdue visits”, “sales overview Dubai”. Full names resolve ambiguity; ambiguous first names prompt clarification. Account company names can also be matched. Details are limited to 20 visits / 15 opportunities with accurate counts; record retrieval above 10,000 returns a limit message instead of an incomplete total. Opportunity dates mean expected close dates. Empty results mean no matching accessible records, not proof that staff did no work. General AI / shipment assistance retains the existing implementation and provider.

## Verification
Passed local PostgreSQL-engine tests (PGlite) against existing CRM schema plus the new migration: repeatable migration, historical preservation, actual visit create/update routes, validation, target ownership, unauthorized account rejection, data/AI scoping, exact opportunity counts, calendar week boundaries. Frontend VM tests render all CRM panels and exercise combined salesperson/status/date visit filtering. Existing V26.1 XLS/XLSX/CSV import/export/rollback/duplicate tests rerun against this build. Syntax and ZIP integrity checked.

No live server deployment, external AI-provider call or visual browser test was performed here. IT's staging check above is required before broad rollout.
