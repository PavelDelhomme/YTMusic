package ovh.delhomme.ytmusic.data

/** Résout un id artiste YouTube Music (UC…) à partir du nom si l’id manque. */
suspend fun resolveArtistId(api: YtMusicApi, id: String?, name: String): String? {
    if (!id.isNullOrBlank() && (id.startsWith("UC") || id.length >= 10)) return id
    val q = name.trim()
    if (q.isEmpty()) return id?.takeIf { it.isNotBlank() }
    return runCatching {
        val r = api.search(q, "artist")
        r.artists.firstOrNull {
            it.title.equals(q, ignoreCase = true) || it.id.startsWith("UC")
        }?.id ?: r.artists.firstOrNull()?.id
    }.getOrNull() ?: id?.takeIf { it.isNotBlank() }
}
