package ovh.delhomme.ytmusic.player

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import okhttp3.Cache
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import ovh.delhomme.ytmusic.YtMusicApp
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Prefetch streams :
 * 1) POST /api/stream/warm (batch) → chauffe le déchiffrement API
 * 2) Range bytes=0–512K du prochain titre (Wi‑Fi / non-métré uniquement)
 * Annulé à la pause. Cache disque 150 Mo (complète le SimpleCache ExoPlayer).
 */
object StreamPrefetcher {
    private const val HEAD_BYTES = 512 * 1024L
    private const val MAX_WARM = 6
    private const val DISK_CACHE_MB = 150L
    private val JSON = "application/json; charset=utf-8".toMediaType()

    private val client: OkHttpClient by lazy {
        val dir = File(YtMusicApp.instance.cacheDir, "stream-prefetch").apply { mkdirs() }
        OkHttpClient.Builder()
            .cache(Cache(dir, DISK_CACHE_MB * 1024L * 1024L))
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .followRedirects(true)
            .build()
    }

    private val inFlight = ConcurrentHashMap.newKeySet<String>()
    private val recent = object : LinkedHashMap<String, Long>(48, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?): Boolean =
            size > 48
    }

    /** Coupe les téléchargements prefetch en cours (pause / idle). */
    fun cancelIdle() {
        client.dispatcher.cancelAll()
        inFlight.clear()
    }

    private fun isUnmetered(): Boolean {
        val cm = YtMusicApp.instance.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) ||
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }

    private fun authHeader(): String? =
        YtMusicApp.instance.container.tokenStore.peekAccess()?.let { "Bearer $it" }

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
            .tag("ytm-prefetch")
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

    /** Batch resolve formats côté API (1 requête au lieu de N). */
    private fun warmBatch(baseApi: String, trackIds: List<String>) {
        val ids = trackIds.distinct().filter { it.length == 11 }.take(MAX_WARM)
        if (ids.isEmpty()) return
        val key = "warm:${ids.sorted().joinToString(",")}"
        synchronized(recent) {
            val last = recent[key]
            if (last != null && System.currentTimeMillis() - last < 90_000L) return
        }
        if (!inFlight.add(key)) return
        val body = JSONObject().put("ids", JSONArray(ids)).toString().toRequestBody(JSON)
        val builder = Request.Builder()
            .url("${baseApi.trimEnd('/')}/api/stream/warm")
            .header("X-YTM-Client", "android")
            .header("Content-Type", "application/json")
            .tag("ytm-prefetch")
            .post(body)
        authHeader()?.let { builder.header("Authorization", it) }
        client.newCall(builder.build()).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                inFlight.remove(key)
                // Fallback : resolve unitaire
                ids.take(3).forEach { id ->
                    warm("${baseApi.trimEnd('/')}/api/stream/$id/url")
                }
            }

            override fun onResponse(call: Call, response: Response) {
                response.close()
                inFlight.remove(key)
                if (!response.isSuccessful) {
                    ids.take(3).forEach { id ->
                        warm("${baseApi.trimEnd('/')}/api/stream/$id/url")
                    }
                    return
                }
                synchronized(recent) {
                    recent[key] = System.currentTimeMillis()
                }
            }
        })
    }

    /** Chauffe format + début audio (Range) pour un id. */
    fun warmTrack(baseApi: String, trackId: String) {
        if (trackId.length != 11) return
        warmBatch(baseApi, listOf(trackId))
        if (isUnmetered()) {
            warmHead("${baseApi.trimEnd('/')}/api/stream/$trackId")
        }
    }

    private fun warmHead(streamUrl: String) {
        if (streamUrl.isBlank()) return
        val key = "head:$streamUrl"
        synchronized(recent) {
            val last = recent[key]
            if (last != null && System.currentTimeMillis() - last < 150_000L) return
        }
        if (!inFlight.add(key)) return
        val req = Request.Builder()
            .url(streamUrl)
            .header("X-YTM-Client", "android")
            .header("Range", "bytes=0-${HEAD_BYTES - 1}")
            .tag("ytm-prefetch")
            .get()
            .build()
        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                inFlight.remove(key)
            }

            override fun onResponse(call: Call, response: Response) {
                response.body?.use { it.bytes() }
                inFlight.remove(key)
                synchronized(recent) {
                    recent[key] = System.currentTimeMillis()
                }
            }
        })
    }

    fun warmMany(resolveUrls: List<String>) {
        resolveUrls.distinct().take(MAX_WARM).forEach { warm(it) }
    }

    fun warmTracks(baseApi: String, trackIds: List<String>) {
        val ids = trackIds.distinct().filter { it.length == 11 }.take(MAX_WARM)
        if (ids.isEmpty()) return
        warmBatch(baseApi, ids)
        if (isUnmetered()) {
            // Premier suivant seulement en Range (économie data)
            ids.firstOrNull()?.let { warmHead("${baseApi.trimEnd('/')}/api/stream/$it") }
        }
    }

    fun warmAround(
        baseApi: String,
        queueIds: List<String>,
        index: Int,
        ahead: Int = 3,
        behind: Int = 1,
    ) {
        if (queueIds.isEmpty()) return
        val unmetered = isUnmetered()
        val aheadN = if (unmetered) ahead else 1
        val behindN = if (unmetered) behind else 0
        val idx = index.coerceIn(0, queueIds.lastIndex)
        val ids = buildList {
            for (i in 1..aheadN) {
                val t = queueIds.getOrNull(idx + i) ?: break
                add(t)
            }
            add(queueIds[idx])
            for (i in 1..behindN) {
                val t = queueIds.getOrNull(idx - i) ?: break
                add(t)
            }
        }
        warmTracks(baseApi, ids)
    }
}
