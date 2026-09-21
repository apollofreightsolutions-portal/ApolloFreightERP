# Apollo AI V6 hotfix

This release is based on Apollo Connected V5 and fixes deterministic shipment analysis for load type and booking questions.

## Fixed

- LTL and FTL are now treated as shipment **Load Type** values, not as Land Export / Land Import service codes.
- Load Type is read from the existing `shipments.notes` JSON metadata where Apollo Connected already stores `loadType`.
- Requests such as "how many shipments booked from Dubai this month, segregate LTL and FTL" now run an exact server-side grouped query by branch/date/load type.
- "Who booked which type of shipments" now includes both service type and load type in the deterministic breakdown.
- Count/summary questions are evaluated before the broad shipment-list matcher, avoiding accidental list-mode answers.
- No financial columns are used by these summaries.

## Deployment

Replace/deploy the updated application normally. There is **no new SQL migration for V6**.

If Connected Chat still reports `relation connected_chat_messages does not exist`, separately apply the existing V5 migration:

`server/sql/040_connected_chat.sql`
