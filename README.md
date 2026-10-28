# Watcher Parent–Child

A transparent parental-safety suite for a guardian dashboard and supervised Android and Windows devices.

## Connected development preview (October 27, 2026)

Watcher now uses Sites / Cloudflare D1 inside [Heath’s existing App Hub](https://heaths-app-hub.heath-tolley.chatgpt.site/watcher). No replacement hub was created. Sign in with ChatGPT, create a pairing code, and enroll the Android or Windows child companion. Previous Supabase enrollments must be paired again.

- **Parent:** responsive, installable web app for Android and Windows; device activity, daily Android estimates, advisory family guidelines, app-request decisions, stale coverage, revocation, export, retention, and deletion.
- **Android child:** native Kotlin app; Keystore-protected enrollment, batch/retry sync, daily screen-time estimates, received family guidelines, and app requests. Debug APK builds successfully with Java 17.
- **Windows child:** visible Windows Forms app launched by `windows/Start-Watcher.cmd`; current-user DPAPI enrollment, an on-disk retry queue, foreground process activity, received guidelines and app requests. Collection stops when the window closes.
- **SDKs and server source:** `sdk/javascript`, `windows/Watcher.Protocol.psm1`, and `backend/sites`. The previous Supabase Edge Function is retained under `supabase/` as legacy reference; clients no longer use it.

This is a development preview, not a completed production parental-control release. Physical Android/Windows pairing, background behavior, and release signing still require testing. Advisory approval does not enforce app restrictions. Managed blocking, browser URL/history collection, and screen sharing remain unimplemented.

See [DEVELOPMENT.md](DEVELOPMENT.md) for setup, testing and remaining release work. The product direction below distinguishes intended features from implemented coverage.

## Product direction

The guardian can review device activity, approve app requests, configure an allowlist, receive safety alerts, and start a visible screen-sharing session where the operating system supports it. Monitoring is disclosed on the child device. No hidden capture, keylogging, or attempts to defeat private-browsing protections.

## First release

- **Guardian app:** Android app plus a responsive web dashboard; family/device enrollment, approval inbox, activity timeline, rules, alerts, and retention controls.
- **Android companion:** app request flow, approved-app policy, timestamped app activity where permission allows, and child-visible screen sharing initiated by the guardian and approved on the device.
- **Windows companion:** visible status, timestamped app activity, and managed-browser activity. Unmonitored applications/browsers are blocked only when enforceable through an administrator-configured allowlist; otherwise report the coverage gap.
- **Policy-managed browsing:** disable private browsing through supported device/browser policies. Log search terms only in a managed browser that clearly discloses this behavior. Do not inspect encrypted traffic or collect keystrokes.

## Current Android monitoring coverage (October 2026)

- The Android child app collects timestamped foreground application launches with Usage Access and can sync them to a paired guardian when its backend is available.
- The child app also shows approximate daily foreground time per app and flags known browsers, including Opera and Opera Mini. Up to 100 daily app summaries are synced to the parent dashboard through D1.
- **Website URLs, pages, search terms, incognito tabs, and incognito history are NOT collected.** Usage Access tells us that a browser was foregrounded, not which website it visited.
- Domain-level web filtering/reporting would require a separately consented and visible Android VPN/DNS component or a managed browser. DNS domains are not exact URLs or proof that the child opened a webpage, and encrypted DNS, VPNs, and browser-specific networking can create gaps.
- For a strict policy, use a supported managed-device/browser configuration to disable private browsing or restrict unsupported browsers, showing any gap in the parent dashboard. Do not promise tamper-proof enforcement on a normally installed companion.
- Existing automatic sync is opportunistic (approximately 15-minute WorkManager scheduling, subject to Android restrictions); a paused/unavailable backend means the parent has no new records.
- Do not ship as production-ready without testing build, backend enrollment, child disclosure, reports, and data-retention controls.

## Platform constraints to design around

- Android screen capture requires user approval for each capture session. App suspension/allowlisting through Android Enterprise device policy requires device/profile-owner management; ordinary app installation alone cannot guarantee that every installed app launch is gated.
- Windows app allowlisting depends on Windows application-control policy and administrator configuration. Build and test setup/rollback tooling before claiming enforcement.
- Private browsing must be disabled through supported supervision or browser management. If a browser/device is outside management, the product must show that it is outside coverage rather than claim to monitor it.
- Apple Screen Time integration is a later, limited extension, not part of the first Android/Windows release.

## Safety and privacy requirements

1. Show monitoring status and the categories of data collected on every enrolled child device.
2. Require guardian authentication for policy changes and live-view requests; require visible child-device approval for screen sharing.
3. Collect the minimum event data needed. Encrypt transport and stored records; define retention, export, and deletion controls before launch.
4. Provide a clear setup/coverage check and fail visibly if a device policy, permission, service, or browser integration stops working.
5. Complete platform policy and children's privacy legal review before public release.

## Decisions for implementation

- Confirm whether initial customers may enroll fully managed devices (which can require administrator setup and, on Android, managed-device provisioning) or whether the product must support personal devices without reset. This choice determines whether app-by-app enforcement can be promised.
- Choose backend, account recovery, hosting region, retention defaults, and subscription model after the enrollment and enforcement feasibility prototype.

## Official platform references

- [Android MediaProjection](https://developer.android.com/media/platform/av-capture)
- [Android Enterprise app suspension](https://developer.android.com/work/dpc/security)
- [Microsoft AppLocker](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/applocker/what-is-applocker)
- [Apple Screen Time frameworks](https://developer.apple.com/documentation/screentimeapidocumentation)
- [FTC COPPA Rule](https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa)
