# Watcher privacy and safety specification

## Current implementation
Version 0.1 is an on-device activity viewer. Android usage-access permission is optional and must be granted in Settings. Events are queried when the screen is refreshed; no background monitoring, cloud uploads, screenshots, location tracking, or account creation are implemented.

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
