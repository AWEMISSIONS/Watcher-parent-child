package org.awemissions.watcher

import android.app.Activity
import android.app.AppOpsManager
import android.content.Intent
import android.os.Bundle
import android.os.Process
import android.provider.Settings
import android.app.usage.UsageStatsManager
import android.content.Context
import android.graphics.Typeface
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var content: LinearLayout
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val scroll = ScrollView(this)
        content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 36, 32, 32) }
        scroll.addView(content)
        setContentView(scroll)
        refresh()
    }
    private fun label(text: String, heading: Boolean = false) {
        content.addView(TextView(this).apply {
            this.text = text
            textSize = if (heading) 22f else 16f
            if (heading) setTypeface(null, Typeface.BOLD)
            setPadding(0, 12, 0, 12)
        })
    }
    private fun button(text: String, action: () -> Unit) {
        content.addView(Button(this).apply { this.text = text; setOnClickListener { action() } })
    }
    private fun hasUsageAccess(): Boolean {
        val ops = getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        return ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), packageName) == AppOpsManager.MODE_ALLOWED
    }
    private fun refresh() {
        content.removeAllViews()
        label("WATCHER • Child device", true)
        label("This app is visible to the device user. No hidden monitoring or recording.")
        label("Usage access: " + if (hasUsageAccess()) "Granted" else "Not granted")
        button("Open usage-access settings") { startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)) }
        button("Refresh activity") { refresh() }
        if (hasUsageAccess()) button("Share activity report with parent") { shareReport() }
        if (!hasUsageAccess()) {
            label("Grant usage access in Android Settings to display this device's recent foreground app activity. Nothing is uploaded.")
            return
        }
        label("Recent app activity (last 24 hours)", true)
        val manager = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val end = System.currentTimeMillis()
        val events = manager.queryEvents(end - 86_400_000L, end)
        val event = android.app.usage.UsageEvents.Event()
        val items = mutableListOf<Pair<Long, String>>()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == android.app.usage.UsageEvents.Event.ACTIVITY_RESUMED) {
                items.add(event.timeStamp to event.packageName)
            }
        }
        val formatter = SimpleDateFormat("MMM d, h:mm a", Locale.getDefault())
        items.takeLast(40).asReversed().forEach { (time, app) -> label("${formatter.format(Date(time))} — $app") }
        if (items.isEmpty()) label("No activity available for this period.")
    }
    private fun shareReport() {
        if (!hasUsageAccess()) return
        val now = System.currentTimeMillis()
        val entries = ActivitySummary.recent(this, now - 86_400_000L, now).takeLast(500)
        val records = JSONArray()
        entries.forEach { entry ->
            records.put(JSONObject().put("timestamp", entry.timestamp).put("packageName", entry.packageName))
        }
        val report = JSONObject()
            .put("schemaVersion", 1)
            .put("generatedAt", now)
            .put("events", records)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/json"
            putExtra(Intent.EXTRA_TEXT, report.toString())
        }
        startActivity(Intent.createChooser(intent, "Share Watcher report"))
    }
    override fun onResume() { super.onResume(); if (::content.isInitialized) refresh() }
}
