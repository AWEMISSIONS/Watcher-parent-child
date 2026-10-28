# Watcher development

## Applications

* Parent: installable responsive web app at `https://heaths-app-hub.heath-tolley.chatgpt.site/watcher`, inside the existing App Hub. ChatGPT sign-in and D1-backed records replace GitHub OAuth and Supabase. The parent can manage enrollment, advisory guidelines, requests, activity export, revocation, deletion, and retention. Source is preserved under `backend/sites/app/watcher`; the complete Sites source repository remains attached to that existing project.
* Android child: native Kotlin `app/`. Usage Access enables application-open events and daily app-time estimates; WorkManager sends batches of at most 500 about every 15 minutes when Android permits. Enrollment credentials are encrypted with Android Keystore. Manual sync retries batches rather than truncating them. Received guidelines and request decisions are displayed in the app. Turning sync off reports a paused status when the connection is available.
* Windows child: `windows/Start-Watcher.cmd` opens a visible Windows Forms companion under Windows PowerShell 5.1. Pair with a code from the parent, then explicitly enable monitoring. Closing the window stops collection. Foreground application names are sampled every two seconds and synced every minute. Tokens use current-user Windows DPAPI. An atomic on-disk queue retains failed uploads for seven days or 10,000 events.

Windows must allow locally downloaded PowerShell scripts under the user's policy. Unblock reviewed downloaded files using Windows Properties if needed. No execution-policy bypass is included. Do not run as administrator. The companion collects only the current interactive user's activity and cannot guarantee app blocking or browser coverage.

## SDKs

`sdk/javascript/watcher.mjs` is a dependency-free HTTPS protocol client with configurable fetch. Guardian calls rely on the browser’s same-origin ChatGPT session; native device calls use their device-scoped token in the request body. `windows/Watcher.Protocol.psm1` exposes the same JSON transport and current-user secret protection for PowerShell integrations. Kotlin uses Android's HTTPS API and Keystore.

All companions use the same pairing (`create`, `claim`) and event (`sync`) protocol. A device token is scoped to one device. The client must retry unchanged events after partial failures; server event identity is `(device_id, package_name, occurred_at)` to deduplicate retries. Never expose a backend service-role key to any application.

## Verification

Run `node --test tests/*.test.mjs` with Node 24 for protocol and SQLite-backed authorization/sync tests. Android CI builds the APK with Java 17. The Android debug build succeeds locally. Windows parsing, current-user DPAPI round trips, and the actual background-sync functions pass against local D1. Foreground collection and restart behavior still require interactive device testing. The Sites local D1 preview has been verified with a simulated enrollment, duplicate event upload, daily summary, request, and parent decision. Local mock-auth data is never deployed.

## Release gates

This is a development preview. Do not describe it as a finished parental-control product. Before a release, verify physical Android/Windows pairing, Android battery restrictions, permission loss, Windows background-job completion, account recovery and signed releases. Automated cross-family isolation, one-time enrollment, revoked-device rejection, retry deduplication, retention, export pagination and deletion tests pass. App-request decisions are advisory; managed-device enforcement and approved screen sharing remain separate work. Ordinary installation cannot provide tamper-proof supervision.

The old Supabase backend was inactive on October 27, 2026. The user chose Sites / Cloudflare D1. No other Supabase project was paused. Existing Supabase enrollments and data are not migrated; generate new codes in the ChatGPT-authenticated parent dashboard. Native clients use `https://heaths-app-hub.heath-tolley.chatgpt.site/api/watcher`.
