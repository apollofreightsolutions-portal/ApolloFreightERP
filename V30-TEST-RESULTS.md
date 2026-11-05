# V30 local verification — 4 November 2026

- New integration suite passed using Express endpoints and an isolated PostgreSQL-compatible test database: SQL054 is repeatable; direct XLSX reading; 95% threshold; exact, missing, restricted and prohibited codes; clarification preserves original text and row; use suggestion / keep original; XLSX export round-trip; original file retained byte-for-byte; tenant isolation; DXB vs KWI/CRM permissions; duplicate submission and second-reply rejection; customer recommendation export; check-only UI toggle and controls.
- Existing document regression suite passed: the customer's 164-row XLSM plus a 7-row fixture (171 rows), independent file source locations, incomplete PDF/count-mismatch handling, empty-document rejection and DOC-AI-403 error handling. PDF/provider responses were mocked; no live cloud OCR call was made.
- Two new shipped unit tests pass: branch/access gating and XLSX preservation of leading zeroes, original descriptions and formula-like text as literal cells.
- Supplied server suite: 43 of its 44 tests pass. Its customer-token-auth.test.js positive test fails identically in the untouched input ZIP because the fixture uses timestamp session fields while the supplied implementation now requires passwordVersion. A separate positive test using the current passwordVersion contract passes. The production authentication module and original tests were left unchanged.
- Browser UI checks used JSDOM, not real mobile-browser rendering. Production database, real customer/DXB sessions and live PDF/photo provider access still need IT's staging smoke test.

No production data, Microsoft settings, emails or live deployments were changed during verification.
