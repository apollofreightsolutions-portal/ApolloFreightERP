# V31 verification — 6 November 2026

## Passed

- Node syntax checks: web/app-runtime.js, web/app.js, web/customer-compliance.js.
- Automated DOM/interaction test using a 65-line fixture: full booking default retained; standalone submit blocked; results outside the document grid; attention/matched/clarification filters; search and empty state; pagination; select visible and all filtered; selection retained across pages/filters; expanded detail; draft persistence; cap starting-detail buttons; keep/clarify/accept requests; help includes all selected indexes and authenticated headers; document-change state reset; unsafe description rendered as text.
- Desktop browser inspection with production stylesheets and the modified renderer, using mocked API/sample data: full-width results, collapsed upload, filter interaction and expanded comparison.
- Phone-width (390px iframe) browser inspection: counters wrap, results render as labelled cards, item actions stay readable.
- Source comparison against V30: only the four listed web runtime files changed. Backend, SQL, shared theme CSS, logo/assets and other modules are byte-identical.
- ZIP integrity checked before handoff.

## Not represented as tested

No access to Apollo's production database, deployed customer/DXB accounts or provider credentials. Browser checks used a local component fixture, not a full logged-in production session. Live upload/extraction, Excel generation, help reply delivery and booking submission must be smoke-tested by IT after deployment. No new backend behaviour was introduced, and the existing backend suite was not rerun for this frontend-only change. Prior V30 test records remain in the ZIP for historical reference, not new V31 results.

## Reproduce the frontend interaction check

Requires Node and jsdom 26 in a separate test environment; jsdom is not a production dependency. With jsdom available on NODE_PATH, run:

    node tests/v31-hs-layout.cjs

The test mocks API responses and uses synthetic data. It sends no live requests and writes no production records.
