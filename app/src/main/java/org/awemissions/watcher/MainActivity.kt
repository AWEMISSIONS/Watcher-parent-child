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
import android.widget.EditText
import android.widget.Toast
import java.net.URL
import javax.net.ssl.HttpsURLConnection
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
        val prefs = getSharedPreferences("watcher_pairing", MODE_PRIVATE)
        if (prefs.getBoolean("autoSync", false) && prefs.contains("token")) ActivitySyncWorker.schedule(this)
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
        addPairingControls()
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
    private val endpoint = "https://basnmfloksrslqinonaw.supabase.co/functions/v1/watcher-sync"
    private fun addPairingControls() {
        val prefs = getSharedPreferences("watcher_pairing", MODE_PRIVATE)
        label(if (prefs.contains("token")) "Paired device — background sync available" else "Not paired with a parent", true)
        if (!prefs.contains("token")) {
            val codeInput = EditText(this).apply { hint = "Paste parent pairing code"; isSingleLine = true }
            content.addView(codeInput)
            button("Pair with parent") {
                val code = codeInput.text.toString().trim()
                if (!Regex("[0-9a-f]{64}").matches(code)) {
                    Toast.makeText(this, "Enter the full 64-character pairing code", Toast.LENGTH_LONG).show()
                } else request(JSONObject().put("action", "claim").put("code", code)) { response ->
                    prefs.edit().putString("deviceId", response.getString("deviceId"))
                        .putString("token", response.getString("deviceToken")).apply()
                    prefs.edit().putBoolean("autoSync", true).apply()
                    ActivitySyncWorker.schedule(this)
                    refresh()
                }
            }
        } else {
            label("Automatic background sync: " + if (prefs.getBoolean("autoSync", false)) "ON (approximately every 15 minutes)" else "OFF")
            label(prefs.getString("syncStatus", "No automatic sync completed yet") ?: "No automatic sync completed yet")
            button(if (prefs.getBoolean("autoSync", false)) "Turn off automatic sync" else "Turn on automatic sync") {
                val enabled = !prefs.getBoolean("autoSync", false)
                prefs.edit().putBoolean("autoSync", enabled).apply()
                if (enabled) ActivitySyncWorker.schedule(this) else ActivitySyncWorker.stop(this)
                refresh()
            }
            button("Sync recent activity to parent") {
                if (!hasUsageAccess()) {
                    Toast.makeText(this, "Enable usage access first", Toast.LENGTH_LONG).show()
                } else {
                    val now = System.currentTimeMillis()
                    val events = JSONArray()
                    ActivitySummary.recent(this, now - 86_400_000L, now).takeLast(500).forEach {
                        events.put(JSONObject().put("timestamp", it.timestamp).put("packageName", it.packageName))
                    }
                    request(JSONObject().put("action", "sync")
                        .put("deviceId", prefs.getString("deviceId", ""))
                        .put("deviceToken", prefs.getString("token", ""))
                        .put("events", events)) {
                        Toast.makeText(this, "Activity synchronized", Toast.LENGTH_LONG).show()
                    }
                }
            }
            button("Unpair this device") { ActivitySyncWorker.stop(this); prefs.edit().clear().apply(); refresh() }
        }
    }
    private fun request(payload: JSONObject, onSuccess: (JSONObject) -> Unit) {
        Thread {
            try {
                val conn = URL(endpoint).openConnection() as HttpsURLConnection
                conn.requestMethod = "POST"
                conn.connectTimeout = 12000
                conn.readTimeout = 12000
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
                val status = conn.responseCode
                val body = (if (status in 200..299) conn.inputStream else conn.errorStream)
                    .bufferedReader().use { it.readText() }
                val response = JSONObject(body)
                runOnUiThread {
                    if (status in 200..299) onSuccess(response)
                    else Toast.makeText(this, response.optString("error", "Request failed"), Toast.LENGTH_LONG).show()
                }
                conn.disconnect()
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this, "Connection failed: " + e.message, Toast.LENGTH_LONG).show() }
            }
        }.start()
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
