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
            // related = ranked style côté API — pas besoin de similar + upNext en plus
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
                // stayClose : un peu du même artiste, majorité voisins de style
                candidates = close.take(10) + far
            } else {
                candidates = diversifyByArtist(candidates, seedPlayable)
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

/** Round-robin par artiste — même style, pas une rafale du même auteur. */
private fun diversifyByArtist(tracks: List<TrackDto>, seed: TrackDto?): List<TrackDto> {
    val seedKey = (
        seed?.artists?.firstOrNull()?.id
            ?: seed?.artists?.firstOrNull()?.name
            ?: ""
        ).lowercase()
    val buckets = linkedMapOf<String, ArrayDeque<TrackDto>>()
    for (t in tracks) {
        if (!t.isPlayable()) continue
        val key = (t.artists?.firstOrNull()?.id ?: t.artists?.firstOrNull()?.name ?: t.id).lowercase()
        buckets.getOrPut(key) { ArrayDeque() }.add(t)
    }
    val keys = buckets.keys.sortedWith { a, b ->
        when {
            a == seedKey -> 1
            b == seedKey -> -1
            else -> (buckets[b]?.size ?: 0).compareTo(buckets[a]?.size ?: 0)
        }
    }
    val out = ArrayList<TrackDto>(80)
    val seen = HashSet<String>()
    var seedHits = 0
    var guard = 0
    while (out.size < 80 && guard++ < 400) {
        var added = false
        for (k in keys) {
            val bucket = buckets[k] ?: continue
            if (bucket.isEmpty()) continue
            if (seedKey.isNotEmpty() && k == seedKey && seedHits >= maxOf(1, out.size / 4 + 1)) {
                continue
            }
            val t = bucket.removeFirst()
            if (!seen.add(t.id)) continue
            out += t
            if (seedKey.isNotEmpty() && k == seedKey) seedHits += 1
            added = true
            if (out.size >= 80) break
        }
        if (!added) break
    }
    return out
}
