# Apollo Connected 11 — Cloud Run startup memory hotfix

## Why
The Kuwait compliance module previously loaded the 17 MB HS master during server startup and expanded all 13,428 HS rows into per-row token/trigram Sets. That preprocessing can consume several hundred MB before normal application memory is counted and can abort a constrained Cloud Run instance.

## Fix
- Kuwait HS master is now lazy-loaded only when the compliance endpoint is used.
- Matching keeps a compact normalized search string per HS row instead of persistent token/trigram Sets.
- Exact HS lookup, description matching, alternative suggestion, confidence %, restrictions/prohibitions, and Apollo Shield behavior remain enabled.
- No SQL migration is required for this hotfix.

## Runtime file changed
- server/src/customer-compliance.js
