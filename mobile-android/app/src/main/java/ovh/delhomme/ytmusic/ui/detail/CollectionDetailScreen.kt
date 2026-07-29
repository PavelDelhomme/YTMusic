package ovh.delhomme.ytmusic.ui.detail

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.TrackDto
import ovh.delhomme.ytmusic.data.buildRadioQueue
import ovh.delhomme.ytmusic.data.resolvePlayableTracks
import ovh.delhomme.ytmusic.ui.components.MediaCover
import ovh.delhomme.ytmusic.ui.components.TrackRow

enum class DetailKind { Album, Artist, Playlist }

@Composable
fun CollectionDetailScreen(
    container: AppContainer,
    kind: DetailKind,
    id: String,
    seed: TrackDto? = null,
    reloadToken: Int = 0,
    onBack: () -> Unit,
    onPlay: (List<TrackDto>, Int) -> Unit,
    onMore: (TrackDto, playlistId: String?) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var radioBusy by remember { mutableStateOf(false) }
    var title by remember { mutableStateOf(seed?.title ?: "") }
    var subtitle by remember { mutableStateOf("") }
    var cover by remember { mutableStateOf(seed) }
    var tracks by remember { mutableStateOf<List<TrackDto>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(kind, id, reloadToken) {
        loading = true
        error = null
        runCatching {
            when (kind) {
                DetailKind.Album -> {
                    val r = container.api.album(id)
                    title = r.album?.title ?: seed?.title ?: "Album"
                    val artists = r.album?.artists.orEmpty()
                        .ifEmpty { r.tracks.flatMap { it.artists.orEmpty() }.distinctBy { it.name } }
                    subtitle = buildString {
                        if (artists.isNotEmpty()) append(artists.joinToString(", ") { it.name })
                        r.album?.year?.let { y ->
                            if (isNotEmpty()) append(" · ")
                            append(y)
                        }
                        if (isEmpty()) append("Album")
                    }
                    cover = r.album?.asTrack() ?: seed ?: TrackDto(id = id, title = title, type = "album")
                    tracks = r.tracks.filter { it.isPlayable() }.map { t ->
                        if (t.artists.isNullOrEmpty() && artists.isNotEmpty()) {
                            t.copy(artists = artists)
                        } else t
                    }
                }
                DetailKind.Artist -> {
                    val r = container.api.artist(id)
                    title = r.artist?.name ?: seed?.title ?: "Artiste"
                    subtitle = r.artist?.subscribers ?: "Artiste"
                    cover = r.artist?.asTrack() ?: seed
                    tracks = (r.songs.orEmpty() + r.tracks.orEmpty())
                        .distinctBy { it.id }
                        .filter { it.isPlayable() }
                    if (tracks.isEmpty()) {
                        tracks = container.api.artistRadio(id).tracks.filter { it.isPlayable() }
                    }
                }
                DetailKind.Playlist -> {
                    val rawId = id.removePrefix("local:")
                    if (id.startsWith("local:")) {
                        val lib = container.api.library()
                        val pl = lib.playlists.firstOrNull { it.id == rawId }
                        title = pl?.displayName() ?: seed?.title ?: "Playlist"
                        subtitle = "${pl?.tracks?.size ?: 0} titres"
                        cover = seed ?: TrackDto(
                            id = id,
                            title = title,
                            thumbnails = pl?.cover()?.let {
                                listOf(ovh.delhomme.ytmusic.data.Thumb(it))
                            },
                            type = "playlist",
                        )
                        tracks = pl?.tracks.orEmpty().filter { it.isPlayable() }
                    } else {
                        val r = container.api.playlist(rawId)
                        title = r.playlist?.displayName() ?: seed?.title ?: "Playlist"
                        subtitle = listOfNotNull(
                            r.playlist?.description?.takeIf { it.isNotBlank() },
                            "${r.tracks.size} titres",
                        ).joinToString(" · ").ifBlank { "Playlist" }
                        cover = r.playlist?.let {
                            TrackDto(
                                id = it.id,
                                title = it.displayName(),
                                thumbnails = it.cover()?.let { u ->
                                    listOf(ovh.delhomme.ytmusic.data.Thumb(u))
                                } ?: it.thumbnails,
                                type = "playlist",
                            )
                        } ?: seed
                        tracks = r.tracks.filter { it.isPlayable() }
                    }
                }
            }
        }.onFailure {
            // fallback resolve
            if (seed != null) {
                tracks = resolvePlayableTracks(container.api, seed)
                title = seed.title
                subtitle = when (kind) {
                    DetailKind.Album -> "Album"
                    DetailKind.Artist -> "Artiste"
                    DetailKind.Playlist -> "Playlist"
                }
            } else {
                error = it.message ?: "Impossible de charger"
            }
        }
        loading = false
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour")
            }
            Text(
                when (kind) {
                    DetailKind.Album -> "Album"
                    DetailKind.Artist -> "Artiste"
                    DetailKind.Playlist -> "Playlist"
                },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }

        when {
            loading -> {
                Column(
                    Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) { CircularProgressIndicator() }
            }
            error != null && tracks.isEmpty() -> {
                Text(error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(24.dp))
            }
            else -> {
                LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                    item {
                        Row(
                            Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.Bottom,
                        ) {
                            cover?.let { MediaCover(it, 140.dp, circle = kind == DetailKind.Artist) }
                            Spacer(Modifier.width(16.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    title,
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 3,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    subtitle,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Spacer(Modifier.height(12.dp))
                                if (tracks.isNotEmpty() || kind == DetailKind.Album || kind == DetailKind.Artist) {
                                    var inLib by remember(kind, id) { mutableStateOf(false) }
                                    LaunchedEffect(kind, id) {
                                        inLib = runCatching {
                                            val lib = container.api.library()
                                            when (kind) {
                                                DetailKind.Album -> lib.albums.any { it.id == id }
                                                DetailKind.Artist -> lib.artists.any { it.id == id }
                                                else -> false
                                            }
                                        }.getOrDefault(false)
                                    }
                                    if (kind == DetailKind.Album || kind == DetailKind.Artist) {
                                        OutlinedButton(
                                            onClick = {
                                                scope.launch {
                                                    runCatching {
                                                        when (kind) {
                                                            DetailKind.Album -> {
                                                                if (inLib) {
                                                                    container.api.removeAlbum(id)
                                                                    inLib = false
                                                                } else {
                                                                    container.api.saveAlbum(
                                                                        TrackDto(
                                                                            id = id,
                                                                            title = title,
                                                                            type = "album",
                                                                            thumbnails = cover?.thumbnails,
                                                                        ),
                                                                    )
                                                                    inLib = true
                                                                }
                                                            }
                                                            DetailKind.Artist -> {
                                                                container.api.saveArtist(
                                                                    TrackDto(
                                                                        id = id,
                                                                        title = title,
                                                                        type = "artist",
                                                                        thumbnails = cover?.thumbnails,
                                                                    ),
                                                                )
                                                                inLib = true
                                                            }
                                                            else -> Unit
                                                        }
                                                        Toast.makeText(
                                                            context,
                                                            if (inLib) "Dans la bibliothèque" else "Retiré",
                                                            Toast.LENGTH_SHORT,
                                                        ).show()
                                                    }.onFailure {
                                                        Toast.makeText(
                                                            context,
                                                            it.message ?: "Échec",
                                                            Toast.LENGTH_SHORT,
                                                        ).show()
                                                    }
                                                }
                                            },
                                            modifier = Modifier.fillMaxWidth(),
                                        ) {
                                            Text(
                                                when {
                                                    kind == DetailKind.Album && inLib -> "Dans la bibliothèque"
                                                    kind == DetailKind.Album -> "Enregistrer l'album"
                                                    inLib -> "Dans la bibliothèque"
                                                    else -> "Enregistrer l'artiste"
                                                },
                                            )
                                        }
                                        Spacer(Modifier.height(8.dp))
                                    }
                                }
                                if (tracks.isNotEmpty()) {
                                    Button(
                                        onClick = { onPlay(tracks, 0) },
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Icon(Icons.Default.PlayArrow, null, Modifier.size(20.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Lecture")
                                    }
                                    Spacer(Modifier.height(8.dp))
                                    OutlinedButton(
                                        onClick = {
                                            radioBusy = true
                                            scope.launch {
                                                val radioKind = when (kind) {
                                                    DetailKind.Album -> "album"
                                                    DetailKind.Artist -> "artist"
                                                    DetailKind.Playlist -> "track"
                                                }
                                                val seedId = when (kind) {
                                                    DetailKind.Playlist -> tracks.firstOrNull()?.id ?: id
                                                    else -> id
                                                }
                                                val mix = buildRadioQueue(
                                                    container.api,
                                                    radioKind,
                                                    seedId,
                                                    tracks.firstOrNull(),
                                                )
                                                radioBusy = false
                                                if (mix.isEmpty()) {
                                                    Toast.makeText(
                                                        context,
                                                        "Radio indisponible",
                                                        Toast.LENGTH_SHORT,
                                                    ).show()
                                                } else {
                                                    onPlay(mix, 0)
                                                    Toast.makeText(
                                                        context,
                                                        "Radio démarrée",
                                                        Toast.LENGTH_SHORT,
                                                    ).show()
                                                }
                                            }
                                        },
                                        enabled = !radioBusy,
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Icon(Icons.Default.Radio, null, Modifier.size(18.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text(if (radioBusy) "Radio…" else "Radio")
                                    }
                                } else {
                                    Text(
                                        "Aucun titre",
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                    itemsIndexed(tracks, key = { i, t -> "${t.id}-$i" }) { index, track ->
                        TrackRow(
                            track = track,
                            onClick = { onPlay(tracks, index) },
                            onMore = {
                                onMore(
                                    track,
                                    if (kind == DetailKind.Playlist) id else null,
                                )
                            },
                        )
                    }
                }
            }
        }
    }
}
