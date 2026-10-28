# Sites / Cloudflare D1 backend

The production application is part of **Heath’s existing App Hub**, project `appgprj_6aa68598e9bc8191a255b0333eb6bd37`.

Parent: https://heaths-app-hub.heath-tolley.chatgpt.site/watcher

Protocol endpoint: https://heaths-app-hub.heath-tolley.chatgpt.site/api/watcher

This directory preserves authored parent-dashboard, API, schema, and migration source. The complete supported Sites framework, hosting manifest, static App Hub assets, archive, and dependency lockfile remain in that same Site’s source repository. Do not create a replacement hub from this directory. Use the Sites source workflow to open the existing project before applying updates; preserve all other hub content and the public audience.

The Site uses the supported Vinext starter, with `d1: "DB"` and no `static` deployment field. Drizzle migrations are applied by Sites before the Worker deploys. Native clients use the JSON API; a service-role key, Supabase account, or Sites access-bypass token is never distributed to clients.

Guardian routes accept dispatch-owned ChatGPT identity and require same-origin JSON POST requests. Anonymous callers can only claim an unexpired 256-bit enrollment secret or authenticate with a device-scoped 256-bit token. Only SHA-256 token hashes are stored in D1. Every guardian operation filters by its stable Site-specific user ID. Parent identity is never accepted from request JSON. One-time claims are atomic. Cross-family authorization, CSRF, replay deduplication, malformed batches, retention, export pagination, revocation and deletion are tested in `tests/backend.test.mjs`.

## Protocol version 2

* Guardian: `create`, `snapshot`, `policy`, `decide`, `revoke`, `clear`, `delete`, `export`.
* Device: `claim`, `sync`, `request`.
* Sync: `deviceId`, `deviceToken`, `events` (maximum 500 `{packageName,timestamp}`), `platform`, `monitoringEnabled`, `coverage.appActivity`, `acknowledgedRevision`, optional `dailyUsage` (maximum 100 `{day,packageName,milliseconds}`).
* Response: `serverTime`, `revision`, advisory `policy`, and app `requests`. Persist received policy before acknowledging its revision on the next sync.
* Events deduplicate on device, app and timestamp. Android daily estimates replace each device/day/app snapshot, rather than adding it twice on retries. No website history or enforcement is claimed.
* Export uses `beforeId` and returns `nextBeforeId` for a stable keyset traversal. Device removal erases its retained records and enrollment.

Retention defaults to seven days and supports 1, 7 or 30 days. Expired data is filtered from reads immediately. Cleanup deletes bounded batches on sync and dashboard access; it is not a guaranteed time-based purge while the service receives no requests. Clearing stored activity does not prevent a companion replaying recent events; revoke before clearing when uploads must stop.

Existing Supabase records and enrollments are not automatically migrated. Enroll devices again in the ChatGPT-authenticated dashboard. The old Supabase project stays paused and the other projects stay active.
