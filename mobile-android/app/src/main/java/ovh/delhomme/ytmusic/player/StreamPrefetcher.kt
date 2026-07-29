package ovh.delhomme.ytmusic.player

import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Chauffe le cache format côté API (`/api/stream/:id/url`) pour que le
 * prochain `prepare()` trouve un 302 immédiat au lieu d’attendre youtubei.
 */
object StreamPrefetcher {
    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    private val inFlight = ConcurrentHashMap.newKeySet<String>()
    private val recent = object : LinkedHashMap<String, Long>(32, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?): Boolean =
            size > 40
    }

    fun warm(resolveUrl: String) {
        if (resolveUrl.isBlank()) return
        synchronized(recent) {
            val last = recent[resolveUrl]
            if (last != null && System.currentTimeMillis() - last < 120_000L) return
        }
        if (!inFlight.add(resolveUrl)) return
        val req = Request.Builder()
            .url(resolveUrl)
            .header("X-YTM-Client", "android")
            .get()
            .build()
        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                inFlight.remove(resolveUrl)
            }

            override fun onResponse(call: Call, response: Response) {
                response.close()
                inFlight.remove(resolveUrl)
                synchronized(recent) {
                    recent[resolveUrl] = System.currentTimeMillis()
                }
            }
        })
    }

    fun warmMany(resolveUrls: List<String>) {
        resolveUrls.distinct().take(3).forEach { warm(it) }
    }
}
