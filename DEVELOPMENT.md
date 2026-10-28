# Watcher development

## Applications

* Parent: responsive `docs/` web app. GitHub OAuth and paired-device timeline currently use the existing Supabase project. Parent app installation and additional controls are in development.
* Android child: native Kotlin `app/`. Usage Access enables application-open events; WorkManager sends batches of at most 500 about every 15 minutes when Android permits. Enrollment credentials are encrypted with Android Keystore. Manual sync is available.
* Windows child: `windows/Start-Watcher.cmd` opens a visible Windows Forms companion under Windows PowerShell 5.1. Pair with a code from the parent, then explicitly enable monitoring. Closing the window stops collection. Foreground application names are sampled every two seconds and synced every minute. Tokens use current-user Windows DPAPI. An atomic on-disk queue retains failed uploads for seven days or 10,000 events.

Windows must allow locally downloaded PowerShell scripts under the user's policy. Unblock reviewed downloaded files using Windows Properties if needed. No execution-policy bypass is included. Do not run as administrator. The companion collects only the current interactive user's activity and cannot guarantee app blocking or browser coverage.

## SDKs

`sdk/javascript/watcher.mjs` is a dependency-free HTTPS protocol client, with configurable fetch and guardian access-token providers. `windows/Watcher.Protocol.psm1` exposes the same JSON transport and current-user secret protection for PowerShell integrations. Kotlin uses Android's HTTPS API and Keystore.

All companions use the same pairing (`create`, `claim`) and event (`sync`) protocol. A device token is scoped to one device. The client must retry unchanged events after partial failures; server event identity is `(device_id, package_name, occurred_at)` to deduplicate retries. Never expose a backend service-role key to any application.

## Verification

Run `node --test tests/*.test.mjs` for protocol tests. Android CI builds the APK with Java 17. Windows parsing can be checked with PowerShell's language parser; actual foreground collection, DPAPI persistence, reboot behavior, and live sync require a Windows interactive session and active backend.

## Release gates

This is a development preview. Do not describe it as a finished parental-control product. Before a release, verify cross-family isolation, one-time enrollment, revoked device rejection, offline replay, retention/deletion, OAuth recovery, permission loss, and physical Android/Windows pairing against an active backend. App request approvals, managed-device enforcement, and approved screen sharing remain separate work. Ordinary installation cannot provide tamper-proof supervision.

The existing backend was inactive on October 27, 2026. Restore failed because the account already had two active free projects. No other project was paused. The hosting alternative under discussion is Sites / Cloudflare D1; no migration is implicit in this source snapshot.
