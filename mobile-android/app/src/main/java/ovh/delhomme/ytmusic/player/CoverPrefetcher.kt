package ovh.delhomme.ytmusic.player

import coil.imageLoader
import coil.request.ImageRequest
import ovh.delhomme.ytmusic.YtMusicApp
import ovh.delhomme.ytmusic.data.TrackDto
import java.util.concurrent.ConcurrentHashMap

/** Prefetch des pochettes (notif + UI) via Coil. */
object CoverPrefetcher {
    private val inFlight = ConcurrentHashMap.newKeySet<String>()

    fun warmCovers(
        tracks: List<TrackDto>,
        index: Int,
        ahead: Int = 3,
        behind: Int = 1,
    ) {
        if (tracks.isEmpty()) return
        val ctx = runCatching { YtMusicApp.instance }.getOrNull() ?: return
        val loader = ctx.imageLoader
        val idx = index.coerceIn(0, tracks.lastIndex)
        val targets = buildList {
            add(tracks[idx])
            for (i in 1..ahead) tracks.getOrNull(idx + i)?.let { add(it) }
            for (i in 1..behind) tracks.getOrNull(idx - i)?.let { add(it) }
        }
        targets.forEach { warm(it.coverUrl(sizeHint = 600)) }
    }

    fun warm(url: String?) {
        if (url.isNullOrBlank()) return
        val ctx = runCatching { YtMusicApp.instance }.getOrNull() ?: return
        if (!inFlight.add(url)) return
        val req = ImageRequest.Builder(ctx)
            .data(url)
            .size(600)
            .memoryCacheKey(url)
            .diskCacheKey(url)
            .listener(
                onSuccess = { _, _ -> inFlight.remove(url) },
                onError = { _, _ -> inFlight.remove(url) },
                onCancel = { inFlight.remove(url) },
            )
            .build()
        ctx.imageLoader.enqueue(req)
    }
}
