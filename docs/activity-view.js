"use strict";
// Pure helpers shared by the dashboard and its boundary tests.
(function(root) {
  const WINDOW_MS = 15 * 60 * 1000;
  function recent(events, now = Date.now()) {
    return events.filter(e => {
      const time = Date.parse(e.occurred_at);
      return Number.isFinite(time) && time >= now - WINDOW_MS && time <= now;
    }).sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
  }
  function freshness(lastSeen, now = Date.now()) {
    const time = Date.parse(lastSeen);
    if (!Number.isFinite(time)) return "No successful sync recorded — coverage unknown";
    if (time > now + 60000) return "Device clock is ahead — freshness unknown";
    const minutes = Math.max(0, Math.floor((now - time) / 60000));
    return (now - time > WINDOW_MS ? "Sync overdue — activity may be missing. " : "Recently connected. ") +
      "Last seen " + minutes + " minute(s) ago.";
  }
  const api = {WINDOW_MS, recent, freshness};
  if (typeof module !== "undefined") module.exports = api;
  else root.WatcherActivity = api;
})(globalThis);
