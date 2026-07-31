package ovh.delhomme.ytmusic.player

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * Cache disque ExoPlayer partagé (réécoute / skip / prefetch).
 * Clé = mediaId (setCustomCacheKey) → survit aux URLs googlevideo qui tournent.
 */
@OptIn(UnstableApi::class)
object PlayerCache {
    private const val CACHE_DIR = "exo-media"
    private const val CACHE_BYTES = 250L * 1024L * 1024L // 250 Mo
    private const val PREFETCH_PARALLEL = 2

    @Volatile
    private var simpleCache: SimpleCache? = null

    private val prefetchExecutor = Executors.newFixedThreadPool(PREFETCH_PARALLEL) { r ->
        Thread(r, "ytm-exo-prefetch").apply { isDaemon = true }
    }
    private val prefetchInFlight = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()
    private val gen = AtomicInteger(0)

    @Synchronized
    fun get(context: Context): SimpleCache {
        simpleCache?.let { return it }
        val dir = File(context.applicationContext.cacheDir, CACHE_DIR).apply { mkdirs() }
        val db = StandaloneDatabaseProvider(context.applicationContext)
        return SimpleCache(dir, LeastRecentlyUsedCacheEvictor(CACHE_BYTES), db).also {
            simpleCache = it
        }
    }

    fun dataSourceFactory(context: Context): CacheDataSource.Factory {
        val upstream = DefaultHttpDataSource.Factory()
            .setUserAgent("YTMusic-Android")
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(12_000)
            .setReadTimeoutMs(30_000)
            .setDefaultRequestProperties(
                mapOf("X-YTM-Client" to "android"),
            )
        return CacheDataSource.Factory()
            .setCache(get(context))
            .setUpstreamDataSourceFactory(upstream)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }

    /** Annule les prefetch CacheWriter en cours (génération). */
    fun cancelPrefetch() {
        gen.incrementAndGet()
        prefetchInFlight.clear()
    }

    /**
     * Précharge les premiers octets dans le SimpleCache Exo (même clé que MediaItem).
     * Au skip, Exo lit immédiatement depuis le disque → bien plus rapide.
     */
    fun prefetchHead(context: Context, streamUrl: String, cacheKey: String, bytes: Long) {
        if (streamUrl.isBlank() || cacheKey.isBlank() || bytes <= 0L) return
        if (!prefetchInFlight.add(cacheKey)) return
        val myGen = gen.get()
        val appCtx = context.applicationContext
        prefetchExecutor.execute {
            try {
                if (myGen != gen.get()) return@execute
                val cache = get(appCtx)
                val cached = cache.getCachedBytes(cacheKey, 0, bytes)
                if (cached >= bytes / 2) return@execute
                val dataSource = dataSourceFactory(appCtx).createDataSource()
                val dataSpec = DataSpec.Builder()
                    .setUri(Uri.parse(streamUrl))
                    .setLength(bytes)
                    .setKey(cacheKey)
                    .build()
                CacheWriter(dataSource, dataSpec, /* temporaryBuffer= */ null, /* listener= */ null).cache()
            } catch (_: Exception) {
                /* réseau / annulation — ignore */
            } finally {
                prefetchInFlight.remove(cacheKey)
            }
        }
    }
}
