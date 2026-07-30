package ovh.delhomme.ytmusic.player

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import java.io.File

/**
 * Cache disque ExoPlayer partagé (réécoute / skip arrière / rebuffer).
 * Clé = mediaId (setCustomCacheKey) → survit aux URLs googlevideo qui tournent.
 */
@OptIn(UnstableApi::class)
object PlayerCache {
    private const val CACHE_DIR = "exo-media"
    private const val CACHE_BYTES = 250L * 1024L * 1024L // 250 Mo

    @Volatile
    private var simpleCache: SimpleCache? = null

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
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(45_000)
        return CacheDataSource.Factory()
            .setCache(get(context))
            .setUpstreamDataSourceFactory(upstream)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }
}
