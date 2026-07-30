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
 * Prefetch agressif des streams :
 * 1) GET /api/stream/:id/url → chauffe le déchiffrement API
 * 2) Range bytes=0–768K du stream → cache OkHttp (démarrage immédiat au skip)
 * Garde jusqu’à ~64 titres récents en cache disque.
 */
object StreamPrefetcher {
    private const val HEAD_BYTES = 768 * 1024L
    private const val MAX_WARM = 16
    private const val DISK_CACHE_MB = 256L

    private val client: OkHttpClient by lazy {
        val dir = File(YtMusicApp.instance.cacheDir, "stream-prefetch").apply { mkdirs() }
        OkHttpClient.Builder()
            .cache(Cache(dir, DISK_CACHE_MB * 1024L * 1024L))
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .followRedirects(true)
            .build()
    }

    private val inFlight = ConcurrentHashMap.newKeySet<String>()
    private val recent = object : LinkedHashMap<String, Long>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?): Boolean =
            size > 64
    }

    fun warm(resolveUrl: String) {
        if (resolveUrl.isBlank()) return
        synchronized(recent) {
            val last = recent[resolveUrl]
            if (last != null && System.currentTimeMillis() - last < 90_000L) return
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
            if (last != null && System.currentTimeMillis() - last < 120_000L) return
        }
        if (!inFlight.add(key)) return
        val req = Request.Builder()
            .url(streamUrl)
            .header("X-YTM-Client", "android")
            .header("Range", "bytes=0-${HEAD_BYTES - 1}")
            .get()
            .build()
        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                inFlight.remove(key)
            }

            override fun onResponse(call: Call, response: Response) {
                // Consommer le body pour le mettre en cache OkHttp
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

    fun warmAround(baseApi: String, queueIds: List<String>, index: Int, ahead: Int = 10, behind: Int = 2) {
        if (queueIds.isEmpty()) return
        val idx = index.coerceIn(0, queueIds.lastIndex)
        val ids = buildList {
            for (i in (idx - behind).coerceAtLeast(0)..(idx + ahead).coerceAtMost(queueIds.lastIndex)) {
                add(queueIds[i])
            }
        }
        warmTracks(baseApi, ids)
    }
}
