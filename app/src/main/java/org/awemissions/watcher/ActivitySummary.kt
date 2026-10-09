package org.awemissions.watcher

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context

/** Device-local activity summary. No network transmission or hidden collection. */
object ActivitySummary {
    data class Entry(val timestamp: Long, val packageName: String)
    fun recent(context: Context, since: Long, until: Long): List<Entry> {
        val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val events = manager.queryEvents(since, until)
        val event = UsageEvents.Event()
        val result = mutableListOf<Entry>()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                result.add(Entry(event.timeStamp, event.packageName))
            }
        }
        return result
    }
    fun counts(entries: List<Entry>): List<Pair<String, Int>> =
        entries.groupingBy { it.packageName }.eachCount().toList().sortedByDescending { it.second }
}
