package ovh.delhomme.ytmusic.data

/** Construit une file « radio » précalculée (~200 titres côté serveur). */
suspend fun buildRadioQueue(
    api: YtMusicApi,
    kind: String,
    id: String,
    seed: TrackDto? = null,
    stayClose: Boolean = false,
    mixCache: MixCacheStore? = null,
): List<TrackDto> {
    val cacheKey = when (kind) {
        "album" -> mixCache?.keyRadio("album", id)
        "artist" -> mixCache?.keyRadio("artist", id)
        else -> mixCache?.keyRadio("track", id)
    }
    mixCache?.let { cache ->
        cacheKey?.let { key ->
            cache.get(key)?.takeIf { it.isNotEmpty() }?.let { cached ->
                val seedPlayable = seed?.takeIf { it.isPlayable() }
                val head = seedPlayable ?: cached.firstOrNull() ?: return@let
                return listOf(head) + cached.filter { it.id != head.id }.take(MixCacheStore.MIX_TARGET)
            }
        }
    }

    val seedPlayable = seed?.takeIf { it.isPlayable() }
    val pool = mutableListOf<TrackDto>()
    var start: TrackDto? = seedPlayable

    when (kind) {
        "album" -> {
            val radioRes = runCatching { api.albumRadio(id) }.getOrNull()
            val radio = radioRes?.tracks.orEmpty()
            val album = runCatching { api.album(id) }.getOrNull()
            val albumTracks = album?.tracks.orEmpty().filter { it.isPlayable() }
            start = start ?: albumTracks.firstOrNull()
            pool += radio.filter { it.isPlayable() && it.id != start?.id }
            pool += albumTracks.filter { it.id != start?.id }.take(6)
            if (mixCache != null && cacheKey != null && pool.isNotEmpty()) {
                mixCache.put(cacheKey, pool, radioRes?.generatedAt ?: System.currentTimeMillis())
            }
        }
        "artist" -> {
            val radioRes = runCatching { api.artistRadio(id) }.getOrNull()
            val radio = radioRes?.tracks.orEmpty()
            val artist = runCatching { api.artist(id) }.getOrNull()
            val songs = (artist?.songs.orEmpty() + artist?.tracks.orEmpty())
                .distinctBy { it.id }
                .filter { it.isPlayable() }
            start = start ?: songs.firstOrNull() ?: radio.firstOrNull { it.isPlayable() }
            pool += songs.filter { it.id != start?.id }.take(8)
            pool += radio.filter { it.isPlayable() && it.id != start?.id }
            if (mixCache != null && cacheKey != null && pool.isNotEmpty()) {
                mixCache.put(cacheKey, pool, radioRes?.generatedAt ?: System.currentTimeMillis())
            }
        }
        else -> {
            val trackId = id
            val related = runCatching { api.related(trackId, full = 1) }.getOrNull()
            var candidates = (
                (related?.tracks.orEmpty()) +
                    (related?.related.orEmpty()) +
                    (related?.radio.orEmpty())
                )
                .filter { it.isPlayable() && it.id != trackId }

            if (stayClose && seedPlayable?.artists?.firstOrNull() != null) {
                val key = (
                    seedPlayable.artists!!.first().id
                        ?: seedPlayable.artists!!.first().name
                    ).lowercase()
                val close = candidates.filter { t ->
                    t.artists.orEmpty().any { a ->
                        (a.id ?: a.name).lowercase() == key
                    }
                }
                val far = candidates.filter { t ->
                    t.artists.orEmpty().none { a ->
                        (a.id ?: a.name).lowercase() == key
                    }
                }
                candidates = close.take(20) + far
            }
            // Ranking serveur déjà diversifié — pas de diversify client
            pool += candidates
            start = start ?: TrackDto(
                id = trackId,
                title = seed?.title ?: "Radio",
                artists = seed?.artists,
                thumbnails = seed?.thumbnails,
                type = "song",
            ).takeIf { it.isPlayable() }
            if (mixCache != null && cacheKey != null && pool.isNotEmpty()) {
                mixCache.put(cacheKey, pool, related?.generatedAt ?: System.currentTimeMillis())
            }
        }
    }

    val seen = linkedSetOf<String>()
    val uniq = mutableListOf<TrackDto>()
    for (t in pool) {
        if (t.id in seen || !t.isPlayable()) continue
        seen += t.id
        uniq += t
        if (uniq.size >= MixCacheStore.MIX_TARGET) break
    }

    val head = start?.takeIf { it.isPlayable() } ?: uniq.firstOrNull() ?: return emptyList()
    return listOf(head) + uniq.filter { it.id != head.id }
}
