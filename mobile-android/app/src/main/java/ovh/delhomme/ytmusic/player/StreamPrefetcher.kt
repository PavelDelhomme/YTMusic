package ovh.delhomme.ytmusic.player

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
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
 * 2) CacheWriter → SimpleCache Exo (mêmes octets que la lecture)
 * Annulé uniquement sur pause volontaire (pas pendant un rebuffer / skip).
 */
object StreamPrefetcher {
    private const val HEAD_WIFI = 1_200 * 1024L
    private const val HEAD_METERED = 320 * 1024L
    private const val HEAD_NEXT_WIFI = 2_400 * 1024L // prochain titre : plus d’octets → skip fluide
    private const val MAX_WARM = 6
    private const val DISK_CACHE_MB = 24L // warm JSON / resolve — octets audio = SimpleCache Exo
    private val JSON = "application/json; charset=utf-8".toMediaType()

    @Volatile private var streamDownUntil = 0L
    private var streamFailStreak = 0

    fun isStreamDown(): Boolean = System.currentTimeMillis() < streamDownUntil

    fun markStreamOk() {
        streamFailStreak = 0
        streamDownUntil = 0L
    }

    fun markStreamDown(pauseMs: Long = 45_000L) {
        streamDownUntil = System.currentTimeMillis() + pauseMs
        cancelIdle()
    }

    private fun noteNetworkFailure() {
        streamFailStreak += 1
        if (streamFailStreak >= 2) markStreamDown()
    }

    private val client: OkHttpClient by lazy {
        val dir = File(YtMusicApp.instance.cacheDir, "stream-prefetch").apply { mkdirs() }
        OkHttpClient.Builder()
            .cache(okhttp3.Cache(dir, DISK_CACHE_MB * 1024L * 1024L))
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .followRedirects(true)
            .build()
    }

    private val inFlight = ConcurrentHashMap.newKeySet<String>()
    private val recent = object : LinkedHashMap<String, Long>(48, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?): Boolean =
            size > 48
    }

    /** Coupe les téléchargements prefetch HTTP (pause volontaire uniquement). */
    fun cancelIdle() {
        client.dispatcher.cancelAll()
        inFlight.clear()
        PlayerCache.cancelPrefetch()
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
        if (resolveUrl.isBlank() || isStreamDown()) return
        synchronized(recent) {
            val last = recent[resolveUrl]
            if (last != null && System.currentTimeMillis() - last < 120_000L) return
        }
        if (!inFlight.add(resolveUrl)) return
        val builder = Request.Builder()
            .url(resolveUrl)
            .header("X-YTM-Client", "android")
            .tag("ytm-prefetch")
            .get()
        authHeader()?.let { builder.header("Authorization", it) }
        client.newCall(builder.build()).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                inFlight.remove(resolveUrl)
                noteNetworkFailure()
            }

            override fun onResponse(call: Call, response: Response) {
                response.close()
                inFlight.remove(resolveUrl)
                if (response.isSuccessful) {
                    markStreamOk()
                    synchronized(recent) {
                        recent[resolveUrl] = System.currentTimeMillis()
                    }
                } else if (response.code in 500..599) {
                    noteNetworkFailure()
                }
            }
        })
    }

    /**
     * Chauffe le format du titre courant de façon synchrone (court) avant prepare() —
     * réduit le cold-start API (~déchiffrement googlevideo).
     */
    fun warmCurrentBlocking(baseApi: String, trackId: String, timeoutMs: Long = 450L) {
        if (trackId.length != 11 || isStreamDown()) return
        val key = "warm:$trackId"
        synchronized(recent) {
            val last = recent[key]
            if (last != null && System.currentTimeMillis() - last < 60_000L) return
        }
        val body = JSONObject().put("ids", JSONArray(listOf(trackId))).toString().toRequestBody(JSON)
        val builder = Request.Builder()
            .url("${baseApi.trimEnd('/')}/api/stream/warm")
            .header("X-YTM-Client", "android")
            .header("Content-Type", "application/json")
            .tag("ytm-prefetch")
            .post(body)
        authHeader()?.let { builder.header("Authorization", it) }
        try {
            val timed = client.newBuilder()
                .callTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .connectTimeout(timeoutMs.coerceAtMost(400), TimeUnit.MILLISECONDS)
                .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .build()
            timed.newCall(builder.build()).execute().use { response ->
                if (response.isSuccessful) {
                    markStreamOk()
                    synchronized(recent) {
                        recent[key] = System.currentTimeMillis()
                    }
                } else if (response.code in 500..599) {
                    noteNetworkFailure()
                }
            }
        } catch (_: Exception) {
            // timeout / réseau — laisser Exo démarrer quand même
        }
    }

    /** Batch resolve formats côté API (1 requête au lieu de N). */
    private fun warmBatch(baseApi: String, trackIds: List<String>) {
        if (isStreamDown()) return
        val ids = trackIds.distinct().filter { it.length == 11 }.take(MAX_WARM)
        if (ids.isEmpty()) return
        val key = "warm:${ids.sorted().joinToString(",")}"
        synchronized(recent) {
            val last = recent[key]
            if (last != null && System.currentTimeMillis() - last < 60_000L) return
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
                noteNetworkFailure()
            }

            override fun onResponse(call: Call, response: Response) {
                response.close()
                inFlight.remove(key)
                if (!response.isSuccessful) {
                    if (response.code in 500..599) {
                        noteNetworkFailure()
                    } else if (!isStreamDown()) {
                        ids.take(2).forEach { id ->
                            warm("${baseApi.trimEnd('/')}/api/stream/$id/url")
                        }
                    }
                    return
                }
                markStreamOk()
                synchronized(recent) {
                    recent[key] = System.currentTimeMillis()
                }
            }
        })
    }

    /** Chauffe format + début audio (Exo cache) pour un id. */
    fun warmTrack(baseApi: String, trackId: String) {
        if (trackId.length != 11 || isStreamDown()) return
        warmBatch(baseApi, listOf(trackId))
        exoPrefetch(baseApi, trackId, priority = true)
    }

    private fun exoPrefetch(baseApi: String, trackId: String, priority: Boolean) {
        if (isStreamDown()) return
        val unmetered = isUnmetered()
        val bytes = when {
            priority && unmetered -> HEAD_NEXT_WIFI
            unmetered -> HEAD_WIFI
            priority -> HEAD_METERED
            else -> return
        }
        val url = "${baseApi.trimEnd('/')}/api/stream/$trackId"
        PlayerCache.prefetchHead(YtMusicApp.instance, url, trackId, bytes)
    }

    fun warmMany(resolveUrls: List<String>) {
        if (isStreamDown()) return
        resolveUrls.distinct().take(MAX_WARM).forEach { warm(it) }
    }

    fun warmTracks(baseApi: String, trackIds: List<String>) {
        if (isStreamDown()) return
        val ids = trackIds.distinct().filter { it.length == 11 }.take(MAX_WARM)
        if (ids.isEmpty()) return
        warmBatch(baseApi, ids)
        // CacheWriter uniquement sur la suite — jamais la piste courante (conflit ExoPlayer)
        ids.drop(1).forEachIndexed { i, id ->
            exoPrefetch(baseApi, id, priority = i == 0)
        }
    }

    fun warmAround(
        baseApi: String,
        queueIds: List<String>,
        index: Int,
        ahead: Int = 3,
        behind: Int = 1,
    ) {
        if (queueIds.isEmpty() || isStreamDown()) return
        val unmetered = isUnmetered()
        // Format warm toujours pour +2 même en data (léger) ; octets Exo plus limités
        val aheadN = if (unmetered) ahead else 2
        val behindN = if (unmetered) behind else 0
        val idx = index.coerceIn(0, queueIds.lastIndex)
        val nextIds = buildList {
            for (i in 1..aheadN) {
                val t = queueIds.getOrNull(idx + i) ?: break
                add(t)
            }
        }
        val behindIds = buildList {
            for (i in 1..behindN) {
                val t = queueIds.getOrNull(idx - i) ?: break
                add(t)
            }
        }
        val current = queueIds[idx]
        // Formats : courant + suite (léger). Exo CacheWriter : suite seule (pas de contention start).
        warmBatch(baseApi, listOf(current) + nextIds + behindIds)
        nextIds.forEachIndexed { i, id ->
            exoPrefetch(baseApi, id, priority = i == 0)
        }
    }
}
