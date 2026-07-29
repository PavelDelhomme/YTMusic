package ovh.delhomme.ytmusic.data

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = false)
data class UserDto(
    val id: String,
    val email: String,
    val name: String? = null,
    val picture: String? = null,
    val isGuest: Boolean? = false,
    val isAdmin: Boolean? = false,
    val emailVerified: Boolean? = false,
)

@JsonClass(generateAdapter = false)
data class AuthResponse(
    val user: UserDto,
    val token: String,
    val refreshToken: String? = null,
    val needsEmailVerification: Boolean? = false,
    val error: String? = null,
    val needs2fa: Boolean? = false,
)

@JsonClass(generateAdapter = false)
data class MeResponse(val user: UserDto?)

@JsonClass(generateAdapter = false)
data class LoginBody(
    val email: String,
    val password: String,
    val totp: String? = null,
)

@JsonClass(generateAdapter = false)
data class RegisterBody(
    val email: String,
    val password: String,
    val name: String? = null,
)

@JsonClass(generateAdapter = false)
data class RefreshBody(val refreshToken: String?)

@JsonClass(generateAdapter = false)
data class ArtistRef(val name: String, val id: String? = null)

@JsonClass(generateAdapter = false)
data class AlbumRef(val name: String? = null, val id: String? = null)

@JsonClass(generateAdapter = false)
data class Thumb(val url: String, val width: Int? = null, val height: Int? = null)

@JsonClass(generateAdapter = false)
data class TrackDto(
    val id: String,
    val title: String,
    val artists: List<ArtistRef>? = emptyList(),
    val album: AlbumRef? = null,
    val duration: String? = null,
    val durationSeconds: Int? = null,
    val thumbnails: List<Thumb>? = emptyList(),
    val type: String? = "song",
) {
    fun artistLine(): String {
        val names = artists?.mapNotNull { it.name.trim().takeIf { n -> n.isNotEmpty() } }
            ?.filter { !it.equals("Inconnu", true) && !it.equals("Unknown", true) }
            .orEmpty()
        return names.joinToString(", ").ifBlank { "Artiste" }
    }

    fun coverUrl(sizeHint: Int = 400): String? {
        val sorted = thumbnails?.sortedByDescending { it.width ?: 0 }.orEmpty()
        val fromThumbs = sorted.firstOrNull()?.url
            ?: thumbnails?.firstOrNull()?.url
        if (!fromThumbs.isNullOrBlank()) return fromThumbs
        return if (id.matches(Regex("^[a-zA-Z0-9_-]{11}$"))) {
            "https://i.ytimg.com/vi/$id/hqdefault.jpg"
        } else {
            null
        }
    }

    fun kind(): String = (type ?: "song").lowercase()

    fun isPlaylist(): Boolean = kind() in setOf("playlist", "community_playlist")

    fun isArtist(): Boolean = kind() == "artist"

    fun isAlbum(): Boolean = kind() == "album"

    fun isPlayable(): Boolean =
        !isPlaylist() && !isArtist() && !isAlbum() &&
            id.matches(Regex("^[a-zA-Z0-9_-]{11}$"))
}

@JsonClass(generateAdapter = false)
data class ShelfDto(val title: String, val items: List<TrackDto> = emptyList())

@JsonClass(generateAdapter = false)
data class HomeResponse(
    val shelves: List<ShelfDto> = emptyList(),
    val seeds: List<String>? = emptyList(),
    val hasMore: Boolean? = false,
    val needsOnboarding: Boolean? = false,
    val radios: List<RadioCategoryDto> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class RadioCategoryDto(
    val id: String,
    val title: String,
)

@JsonClass(generateAdapter = false)
data class RadioMixResponse(
    val tracks: List<TrackDto> = emptyList(),
    val seed: TrackDto? = null,
)

@JsonClass(generateAdapter = false)
data class PinDto(
    val id: String? = null,
    val kind: String? = null,
    val targetId: String? = null,
    val payload: TrackDto? = null,
)

@JsonClass(generateAdapter = false)
data class PinsResponse(
    val pins: List<PinDto> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class SearchResponse(
    val topResult: TrackDto? = null,
    val songs: List<TrackDto> = emptyList(),
    val videos: List<TrackDto> = emptyList(),
    val albums: List<TrackDto> = emptyList(),
    val artists: List<TrackDto> = emptyList(),
    val playlists: List<TrackDto> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class TrackInfoResponse(
    val track: TrackDto,
    val streamUrl: String,
    val cached: Boolean? = false,
)
