package ovh.delhomme.ytmusic.data

/** Construit une file « radio » style YouTube Music. */
suspend fun buildRadioQueue(
    api: YtMusicApi,
    kind: String,
    id: String,
    seed: TrackDto? = null,
    stayClose: Boolean = false,
): List<TrackDto> {
    val seedPlayable = seed?.takeIf { it.isPlayable() }
    val pool = mutableListOf<TrackDto>()
    var start: TrackDto? = seedPlayable

    when (kind) {
        "album" -> {
            val radio = runCatching { api.albumRadio(id).tracks }.getOrDefault(emptyList())
            val album = runCatching { api.album(id) }.getOrNull()
            val albumTracks = album?.tracks.orEmpty().filter { it.isPlayable() }
            start = start ?: albumTracks.firstOrNull()
            pool += radio.filter { it.isPlayable() && it.id != start?.id }
            pool += albumTracks.filter { it.id != start?.id }.take(6)
        }
        "artist" -> {
            val radio = runCatching { api.artistRadio(id).tracks }.getOrDefault(emptyList())
            val artist = runCatching { api.artist(id) }.getOrNull()
            val songs = (artist?.songs.orEmpty() + artist?.tracks.orEmpty())
                .distinctBy { it.id }
                .filter { it.isPlayable() }
            start = start ?: songs.firstOrNull() ?: radio.firstOrNull { it.isPlayable() }
            pool += songs.filter { it.id != start?.id }.take(8)
            pool += radio.filter { it.isPlayable() && it.id != start?.id }
        }
        else -> {
            val trackId = id
            val related = runCatching { api.related(trackId) }.getOrNull()
            val up = runCatching { api.upNext(trackId).tracks }.getOrDefault(emptyList())
            val sim = runCatching { api.similar(trackId).tracks }.getOrDefault(emptyList())
            var candidates = (
                up +
                    (related?.radio.orEmpty()) +
                    (related?.related.orEmpty()) +
                    (related?.tracks.orEmpty()) +
                    sim
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
                candidates = if (close.size >= 8) {
                    close.take(24) + far.take(40)
                } else {
                    close + far
                }
            }
            pool += candidates
            start = start ?: TrackDto(
                id = trackId,
                title = seed?.title ?: "Radio",
                artists = seed?.artists,
                thumbnails = seed?.thumbnails,
                type = "song",
            ).takeIf { it.isPlayable() }
        }
    }

    val seen = linkedSetOf<String>()
    val uniq = mutableListOf<TrackDto>()
    for (t in pool) {
        if (t.id in seen || !t.isPlayable()) continue
        seen += t.id
        uniq += t
        if (uniq.size >= 90) break
    }

    val head = start?.takeIf { it.isPlayable() } ?: uniq.firstOrNull() ?: return emptyList()
    return listOf(head) + uniq.filter { it.id != head.id }
}
