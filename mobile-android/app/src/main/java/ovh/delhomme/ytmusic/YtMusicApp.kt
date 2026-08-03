package ovh.delhomme.ytmusic

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.debug.CrashReporter

class YtMusicApp : Application(), ImageLoaderFactory {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        CrashReporter.install(this)
        container = AppContainer(this)
    }

    override fun newImageLoader(): ImageLoader =
        ImageLoader.Builder(this)
            .crossfade(true)
            .memoryCache {
                MemoryCache.Builder(this)
                    .maxSizePercent(0.14)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(cacheDir.resolve("coil-covers"))
                    .maxSizeBytes(72L * 1024L * 1024L)
                    .build()
            }
            .respectCacheHeaders(false)
            .build()

    companion object {
        lateinit var instance: YtMusicApp
            private set
    }
}
