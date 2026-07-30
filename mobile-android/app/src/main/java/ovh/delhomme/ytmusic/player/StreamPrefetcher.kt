package ovh.delhomme.ytmusic.player

import okhttp3.Cache
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import ovh.delhomme.ytmusic.YtMusicApp
import java.io.File
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Prefetch léger des streams (énergie) :
 * 1) GET /api/stream/:id/url → chauffe le déchiffrement API
 * 2) Range bytes=0–384K du prochain titre → démarrage rapide au skip
 * Annulé automatiquement à la pause / idle.
 */
object StreamPrefetcher {
    private const val HEAD_BYTES = 384 * 1024L
    private const val MAX_WARM = 4
    private const val DISK_CACHE_MB = 80L

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
    private val recent = object : LinkedHashMap<String, Long>(32, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?): Boolean =
            size > 32
    }

    /** Coupe les téléchargements prefetch en cours (pause / idle). */
    fun cancelIdle() {
        client.dispatcher.cancelAll()
        inFlight.clear()
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

    /** Chauffe format + début audio (Range) pour un id. */
    fun warmTrack(baseApi: String, trackId: String) {
        if (trackId.length != 11) return
        val base = baseApi.trimEnd('/')
        warm("$base/api/stream/$trackId/url")
        warmHead("$base/api/stream/$trackId")
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
        trackIds.distinct().filter { it.length == 11 }.take(MAX_WARM).forEach { id ->
            warmTrack(baseApi, id)
        }
    }

    fun warmAround(
        baseApi: String,
        queueIds: List<String>,
        index: Int,
        ahead: Int = 2,
        behind: Int = 0,
    ) {
        if (queueIds.isEmpty()) return
        val idx = index.coerceIn(0, queueIds.lastIndex)
        // Priorité : prochain titre d’abord
        val ids = buildList {
            for (i in 1..ahead) {
                val t = queueIds.getOrNull(idx + i) ?: break
                add(t)
            }
            add(queueIds[idx])
            for (i in 1..behind) {
                val t = queueIds.getOrNull(idx - i) ?: break
                add(t)
            }
        }
        warmTracks(baseApi, ids)
    }
}
