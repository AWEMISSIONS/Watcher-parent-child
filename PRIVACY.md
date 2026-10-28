# Watcher privacy and safety specification

## Current implementation
The connected development preview uses ChatGPT sign-in for guardians and a Sites / Cloudflare D1 backend within Heath’s App Hub. Paired Android devices send foreground app openings and estimated daily screen time when Usage Access is granted. Windows sends foreground process names and timestamps while its visible companion is enabled. Neither collects URLs, keystrokes, location, window titles, screenshots, or private-browser content.

Children see monitoring status, pause controls, the received advisory family note and approved-app list, and app-request decisions. Android schedules opportunistic background sync; Windows stops collecting when its window closes. Device tokens use Android Keystore or Windows current-user DPAPI locally and SHA-256 hashes on the server. Requests use HTTPS.

The guardian can revoke enrollment, export activity, clear records, remove a device, and choose 1-, 7-, or 30-day retention. Expired records are immediately excluded from reads and cleaned in bounded batches on sync/dashboard requests; no scheduled physical deletion is guaranteed while there is no traffic. Clearing records while a device remains paired may allow recent events to be replayed. Revoke first if uploads must stop. Local Windows retry data is limited to seven days or 10,000 records and is erased when unpaired.

Only the signed-in guardian can access their enrolled devices. Existing Supabase records are not automatically migrated. The production release still needs device testing, recovery/release procedures, and privacy review.

## Requirements before enabling remote parent access
- Authenticate guardians and prove device enrollment with a one-time pairing challenge.
- Show enrollment and monitoring status continuously on the supervised device.
- Encrypt communications and stored activity; define retention and deletion controls.
- Restrict all device records to their authorized family; test cross-family isolation.
- Require an Android MediaProjection consent prompt for every screen-sharing session.
- Provide pause, unenroll, and data deletion flows subject to appropriate guardian controls.
- Audit security and applicable children's privacy requirements before public launch.

## Limitations
Usage access does not reveal browser search terms or private browsing history. A normal app cannot guarantee app blocking, disable incognito, or capture the screen without OS-mediated consent. Never claim otherwise.
