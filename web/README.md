# Apollo Connected web clien

The web client is served directly by the Node/Express application on Google Cloud Run. `config.js` defaults the API URL to the current browser origin, so Cloud Run serves UI + API as one application.

During the migration period only, if the page is running on a `*.vercel.app` hostname, `config.js` continues to use the existing Render API. A `<meta name="apollo-api-url" content="...">` override still takes precedence when needed.

CRM assets:
- `crm-portal.js`
- `crm-portal.css`

The CRM login option and portal switch are shown only according to the session's CRM permissions. Server-side API authorization remains the security boundary.
