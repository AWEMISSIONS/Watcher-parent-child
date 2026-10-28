package org.awemissions.watcher

import android.app.AppOpsManager
import android.content.Context
import android.os.Process
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.ExistingWorkPolicy
import androidx.work.workDataOf
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL
import java.util.concurrent.TimeUnit
import javax.net.ssl.HttpsURLConnection

/**
 * Visible, user-enabled background app-usage summaries.
 * WorkManager is opportunistic; Android may delay execution to conserve battery.
 */
class ActivitySyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences("watcher_pairing", Context.MODE_PRIVATE)
        val manual = inputData.getBoolean("manual", false)
        if (!manual && !prefs.getBoolean("autoSync", false)) return Result.success()
        val deviceId = prefs.getString("deviceId", null) ?: return Result.success()
        val token = DeviceSecret.read(prefs) ?: return Result.success()
        val ops = applicationContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val usageAccess = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), applicationContext.packageName) == AppOpsManager.MODE_ALLOWED
        val now = System.currentTimeMillis()
        // Overlap by two minutes for late usage events; server deduplicates by event identity.
        val last = prefs.getLong("lastSync", 0L)
        val since = if (last == 0L) now - 86_400_000L else maxOf(now - 8L * 86_400_000L, last - 120_000L)
        val events = if (usageAccess) ActivitySummary.recent(applicationContext, since, now) else emptyList()
        return try {
            // The server limits each request to 500 records. Advance checkpoint only after all batches succeed.
            val batches = events.chunked(500).ifEmpty { listOf(emptyList()) }
            for (batch in batches) {
                if (DeviceSecret.read(prefs) != token || (!manual && !prefs.getBoolean("autoSync", false))) return Result.success()
                val records = JSONArray()
                batch.forEach { records.put(JSONObject().put("timestamp", it.timestamp).put("packageName", it.packageName)) }
                val daily = JSONArray()
                val day = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date(now))
                if (usageAccess) AppUsageReport.today(applicationContext).take(100).forEach {
                    daily.put(JSONObject().put("day", day).put("packageName", it.packageName)
                        .put("milliseconds", it.milliseconds.coerceIn(0L, 86_400_000L)))
                }
                val payload = JSONObject().put("action", "sync").put("deviceId", deviceId).put("deviceToken", token).put("events", records)
                    .put("platform", "android").put("monitoringEnabled", prefs.getBoolean("autoSync", false))
                    .put("coverage", JSONObject().put("appActivity", usageAccess))
                    .put("acknowledgedRevision", prefs.getInt("policyRevision", 0)).put("dailyUsage", daily)
                val connection = URL("https://heaths-app-hub.heath-tolley.chatgpt.site/api/watcher").openConnection() as HttpsURLConnection
                try {
                    connection.requestMethod = "POST"
                    connection.connectTimeout = 15000
                    connection.readTimeout = 15000
                    connection.doOutput = true
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
                    val status = connection.responseCode
                    if (status == 401 || status == 403) {
                        prefs.edit().putString("syncStatus", "Pairing expired or revoked").putBoolean("autoSync", false).apply()
                        return Result.failure()
                    }
                    if (status !in 200..299) throw IllegalStateException("Server HTTP $status")
                    val response = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                    prefs.edit().putString("familyPolicy", response.getJSONObject("policy").toString())
                        .putInt("policyRevision", response.getInt("revision"))
                        .putString("appRequests", response.getJSONArray("requests").toString()).apply()
                } finally { connection.disconnect() }
            }
            val editor = prefs.edit().putString("syncStatus", (if (usageAccess) "Last successful sync: " else "Usage access missing; family guidelines synced: ") + java.util.Date(now))
            if (usageAccess) editor.putLong("lastSync", now)
            editor.apply()
            Result.success()
        } catch (e: Exception) {
            prefs.edit().putString("syncStatus", "Waiting to retry: " + (e.message ?: "Network unavailable")).apply()
            Result.retry()
        }
    }

    companion object {
        private const val WORK_NAME = "watcher-visible-activity-sync"
        fun syncNow(context: Context) {
            val request = OneTimeWorkRequestBuilder<ActivitySyncWorker>()
                .setInputData(workDataOf("manual" to true))
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
            WorkManager.getInstance(context).enqueueUniqueWork("watcher-manual-sync", ExistingWorkPolicy.KEEP, request)
        }
        fun schedule(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = PeriodicWorkRequestBuilder<ActivitySyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }
        fun stop(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
            WorkManager.getInstance(context).cancelUniqueWork("watcher-manual-sync")
        }
    }
}
