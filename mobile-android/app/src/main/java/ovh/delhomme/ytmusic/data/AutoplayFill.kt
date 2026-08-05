package ovh.delhomme.ytmusic.data

/**
 * Remplit la zone « À suivre » rapidement (related?fast=1 = upNext côté API).
 * Un seul appel — pas de double getUpNext.
 */
suspend fun fetchAutoplayTracksFast(api: YtMusicApi, seedId: String): List<TrackDto> {
    if (seedId.length != 11) return emptyList()
    val fast = runCatching { api.related(seedId, fast = 1) }.getOrNull() ?: return emptyList()
    return (
        fast.tracks.orEmpty() +
            fast.related.orEmpty() +
            fast.radio.orEmpty()
        )
        .filter { it.isPlayable() && it.id != seedId }
        .distinctBy { it.id }
}

suspend fun fetchAutoplayTracksFull(api: YtMusicApi, seedId: String): List<TrackDto> {
    if (seedId.length != 11) return emptyList()
    val related = runCatching { api.related(seedId) }.getOrNull() ?: return emptyList()
    return (
        related.tracks.orEmpty() +
            related.related.orEmpty() +
            related.radio.orEmpty()
        )
        .filter { it.isPlayable() && it.id != seedId }
        .distinctBy { it.id }
}
