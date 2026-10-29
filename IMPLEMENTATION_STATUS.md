# Watcher continuation — implementation status

Implemented in this change:
- Authenticated parent web dashboard displays the rolling last 15 minutes of received Android app-opening events.
- Refresh every 30 seconds while the page is visible, plus manual refresh.
- Missing/overdue device sync and unsupported collection categories are disclosed.
- Account changes invalidate pending activity requests; text renders without interpreting device names as markup.
- Five automated tests; run `node --test tests/activity.test.cjs`.

Not implemented or verified:
- Native parent Android login/dashboard and push notifications.
- Website URLs on Android or computers; no computer companion currently exists.
- SMS/MMS and Instagram/Snapchat chat content. Usage Access cannot provide those records.
- Safety classification, alert delivery, acknowledgements and escalation.
- Managed enrollment, uninstall restrictions, policy recovery or guardian-controlled removal.
- Live backend verification: the Supabase query returned "Database is possibly not accessible at the moment".
- Android build: Java/Gradle tooling is unavailable in this environment.

Next integration sequence:
1. Restore backend access; verify guardian ownership policies on device/event records and check the deployed sync function before changing ingestion.
2. Build the parent Android application with authenticated device access and push-token registration. Keep sensitive content out of lock-screen notification payloads.
3. Add a visible managed-browser integration on Android and a disclosed browser extension/computer companion. Report exact collection coverage and last upload time per source. Use authenticated, revocable enrollment and bounded offline queues.
4. Evaluate permitted SMS/MMS access separately from third-party chat coverage. Any notification-based integration must state that notifications are partial and are not conversation history. Do not promise complete Instagram/Snapchat message access.
5. Implement server-side safety rules, deduplicated alerts, push delivery retries and parent acknowledgement. Lack of detected alerts must not be represented as proof of safety.
6. Add supported managed-device enrollment for guardian-owned devices, authenticated policy changes, and documented recovery/removal. An ordinary install cannot guarantee a child cannot disable or uninstall the app.
7. Test end to end on real Android and computer devices, including offline recovery, permission revocation, stale sync, multi-family isolation and notification delivery.

A rolling 15-minute view is different from guaranteed delivery within 15 minutes. Current Android WorkManager scheduling is approximate and may be delayed.
