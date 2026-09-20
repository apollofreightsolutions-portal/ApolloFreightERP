# Apollo Connected V5 — AI Reliability + Connected Chat

## Base
This package was built directly from the latest supplied IT source: `KHD-ApolloFreightERP-main (5).zip`.

## What V5 changes

### Apollo AI
- Uses deterministic server-side SQL retrieval for factual operational questions before Gemini is involved.
- Applies the logged-in user's live branch, entry and module permissions before any data is returned.
- Correctly handles common filters such as Dubai/Kuwait, today/yesterday/this week/this month/last N days, service type and shipment status.
- Supports exact shipment lists such as “What shipments were created today by Dubai branch?”
- Supports aggregate booking analysis such as “Who booked which type of shipments this month?” using `created_by`, shipment direction/service and branch. No financial data is used.
- Supports TCN copy requests. The AI returns an `Open TCN` action that uses the existing Connected TCN document renderer for the authorized shipment.
- Supports uploaded POD retrieval. The AI returns permission-checked `Open POD` actions; GCS objects are opened through short-lived signed URLs.
- Gemini is no longer responsible for deciding which Apollo records exist. Gemini only interprets server-filtered context for questions that actually need language-model assistance.
- Provider timeout reduced/configurable. If Gemini times out but exact shipment rows were already retrieved, Apollo AI returns a factual server-only fallback instead of hanging.
- UI requests have an explicit timeout and recover cleanly after failure.
- Responses show scope/source information and exact-data queries are labeled `Exact query`.

### Connected Chat
- Floating `Chat` button available while an internal Apollo user is logged in.
- One-to-one internal messaging between active Connected users.
- Searchable colleague list, recent conversations, unread badge, timestamps and read receipts.
- Messages update by lightweight polling; no external messaging service is required.
- Chat stays on top of the current Connected screen so users do not leave Operations/CRM/HR to communicate.
- `Share current screen` adds the current Connected screen name as message context.
- Disabled/inactive users cannot send or receive new messages through the API.
- Chat uses the existing Connected authentication token; no separate usernames/passwords.

## Deployment
1. Deploy this full V5 source over the current Cloud Run source using the normal Apollo Connected deployment pipeline.
2. Run database migrations. V5 adds:
   - `server/sql/040_connected_chat.sql`
3. Existing Apollo AI migrations `038_apollo_ai.sql` and `039_apollo_ai_access_workspace_fix.sql` must remain applied.
4. Keep the existing Gemini secret mapping:
   - `GEMINI_API_KEY`
5. Recommended environment values:
   - `GEMINI_MODEL=gemini-3.1-flash-lite`
   - `APOLLO_AI_FREE_TIER_SAFE_MODE=true`
   - `APOLLO_AI_ALLOW_HR_DATA=false`
   - `APOLLO_AI_TIMEOUT_MS=18000`
   - `APOLLO_BUSINESS_TIMEZONE=Asia/Dubai`
6. Redeploy/restart Cloud Run.
7. Users should refresh Connected. A sign-out/sign-in is recommended after deployment if permissions were recently changed.

## Minimum live tests

### AI
- Admin: `What shipments were created today by Dubai branch?`
- Admin: `Who booked which type of shipments this month?`
- User with limited branch scope: ask for the other branch and confirm zero inaccessible records are exposed.
- Ask for a known TCN: `Open the TCN copy for <TCN/JOB>` and confirm the TCN action opens the existing Connected TCN renderer.
- Ask for a known delivered job: `Get the POD for <JOB>` and confirm only authorized uploaded PODs are offered.
- Temporarily block Gemini outbound access and confirm exact shipment queries still answer directly rather than hanging.

### Chat
- User A sends a message to User B.
- User B receives an unread badge and opens the conversation.
- User A sees `Read` after User B opens it.
- User A shares the current Connected screen in a message.
- Disable a test user and confirm the API no longer allows new messages to/from that inactive account.

## Rollback
Application rollback: redeploy the previous source package. The new `connected_chat_messages` table can safely remain; older application versions ignore it.
