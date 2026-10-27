package org.awemissions.watcher

import android.app.usage.UsageStatsManager
import android.content.Context
import java.util.Calendar

/** Approximate local foreground time as reported by Android usage statistics. */
object AppUsageReport {
    data class AppTime(val packageName: String, val milliseconds: Long, val browser: Boolean)

    fun isBrowser(packageName: String): Boolean {
        val p = packageName.lowercase()
        return p.startsWith("com.opera.") || p == "com.opera.browser" ||
            p == "com.opera.mini.native" || p == "com.android.chrome" ||
            p == "com.chrome.beta" || p == "org.mozilla.firefox" ||
            p == "org.mozilla.firefox_beta" || p == "com.brave.browser" ||
            p == "com.microsoft.emmx" || p == "com.sec.android.app.sbrowser" ||
            p == "com.duckduckgo.mobile.android" || p == "com.vivaldi.browser"
    }

    fun today(context: Context): List<AppTime> {
        val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val start = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        val stats = manager.queryAndAggregateUsageStats(start, System.currentTimeMillis())
        return stats.values.mapNotNull { stat ->
            val duration = stat.totalTimeInForeground
            if (duration > 0) AppTime(stat.packageName, duration, isBrowser(stat.packageName)) else null
        }.sortedByDescending { it.milliseconds }
    }

    fun duration(milliseconds: Long): String {
        val minutes = milliseconds / 60000L
        return if (minutes < 1L) "<1 min" else "${minutes / 60L}h ${minutes % 60L}m"
    }
}
