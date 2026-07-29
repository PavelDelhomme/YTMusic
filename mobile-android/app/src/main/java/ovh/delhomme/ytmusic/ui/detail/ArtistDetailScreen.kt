package ovh.delhomme.ytmusic.ui.detail

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import ovh.delhomme.ytmusic.data.FollowArtistBody
import ovh.delhomme.ytmusic.data.TrackDto
import ovh.delhomme.ytmusic.data.buildRadioQueue
import ovh.delhomme.ytmusic.ui.components.MediaCover
import ovh.delhomme.ytmusic.ui.components.TrackRow

/** Page artiste style YouTube Music : tops, albums, singles, biblio, similaires. */
@Composable
fun ArtistDetailScreen(
    container: AppContainer,
    artistId: String,
    reloadToken: Int = 0,
    onBack: () -> Unit,
    onPlay: (List<TrackDto>, Int) -> Unit,
    onMore: (TrackDto) -> Unit,
    onOpenDetail: (TrackDto) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var name by remember { mutableStateOf("") }
    var subscribers by remember { mutableStateOf<String?>(null) }
    var description by remember { mutableStateOf<String?>(null) }
    var cover by remember { mutableStateOf<TrackDto?>(null) }
    var songs by remember { mutableStateOf<List<TrackDto>>(emptyList()) }
    var albums by remember { mutableStateOf<List<TrackDto>>(emptyList()) }
    var singles by remember { mutableStateOf<List<TrackDto>>(emptyList()) }
    var videos by remember { mutableStateOf<List<TrackDto>>(emptyList()) }
    var featured by remember { mutableStateOf<List<TrackDto>>(emptyList()) }
    var similar by remember { mutableStateOf<List<TrackDto>>(emptyList()) }
    var playlists by remember { mutableStateOf<List<TrackDto>>(emptyList()) }
    var libTracks by remember { mutableStateOf<List<TrackDto>>(emptyList()) }
    var libAlbums by remember { mutableStateOf<List<TrackDto>>(emptyList()) }
    var inLib by remember { mutableStateOf(false) }
    var following by remember { mutableStateOf(false) }
    var radioBusy by remember { mutableStateOf(false) }
    var showFullBio by remember { mutableStateOf(false) }

    LaunchedEffect(artistId, reloadToken) {
        loading = true
        error = null
        runCatching {
            val r = container.api.artist(artistId)
            name = r.artist?.name ?: "Artiste"
            subscribers = r.artist?.subscribers
            description = r.artist?.description?.takeIf { it.isNotBlank() }
            cover = r.artist?.asTrack()
            songs = (r.songs.orEmpty() + r.tracks.orEmpty())
                .distinctBy { it.id }
                .filter { it.isPlayable() }
            if (songs.isEmpty()) {
                songs = container.api.artistRadio(artistId).tracks.filter { it.isPlayable() }
            }
            albums = r.albums.orEmpty().map { it.copy(type = it.type ?: "album") }
            singles = r.singles.orEmpty().map { it.copy(type = it.type ?: "album") }
            videos = r.videos.orEmpty()
            featured = r.featured.orEmpty()
            similar = r.similar.orEmpty().map { it.copy(type = "artist") }
            playlists = r.playlists.orEmpty().map { it.copy(type = it.type ?: "playlist") }

            val lib = container.api.library()
            inLib = lib.artists.any { it.id == artistId }
            val nameLc = name.lowercase()
            fun matches(t: TrackDto): Boolean =
                t.artists.orEmpty().any { a ->
                    a.id == artistId || a.name.trim().equals(nameLc, ignoreCase = true)
                }
            libTracks = lib.liked.filter { it.isPlayable() && matches(it) }.take(20)
            libAlbums = lib.albums.filter { matches(it) || it.id == artistId }.take(12)

            following = runCatching {
                container.api.prefs().follows.any {
                    it.artistId() == artistId
                }
            }.getOrDefault(false)
        }.onFailure {
            error = it.message ?: "Impossible de charger l'artiste"
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
                "Artiste",
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
            error != null && songs.isEmpty() && albums.isEmpty() -> {
                Text(error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(24.dp))
            }
            else -> {
                LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
                    item {
                        Row(
                            Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.Bottom,
                        ) {
                            cover?.let { MediaCover(it, 140.dp, circle = true) }
                            Spacer(Modifier.width(16.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    name,
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 3,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    subscribers ?: "Artiste",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Spacer(Modifier.height(12.dp))
                                OutlinedButton(
                                    onClick = {
                                        scope.launch {
                                            runCatching {
                                                if (inLib) {
                                                    // pas d'endpoint remove dédié toujours sûr — re-save noop
                                                    Toast.makeText(context, "Déjà dans la bibliothèque", Toast.LENGTH_SHORT).show()
                                                } else {
                                                    container.api.saveArtist(
                                                        TrackDto(
                                                            id = artistId,
                                                            title = name,
                                                            type = "artist",
                                                            thumbnails = cover?.thumbnails,
                                                        ),
                                                    )
                                                    inLib = true
                                                    Toast.makeText(context, "Artiste enregistré", Toast.LENGTH_SHORT).show()
                                                }
                                            }.onFailure {
                                                Toast.makeText(context, it.message ?: "Échec", Toast.LENGTH_SHORT).show()
                                            }
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Icon(Icons.Default.LibraryMusic, null, Modifier.size(18.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text(if (inLib) "Dans la bibliothèque" else "Enregistrer l'artiste")
                                }
                                Spacer(Modifier.height(8.dp))
                                OutlinedButton(
                                    onClick = {
                                        scope.launch {
                                            runCatching {
                                                if (following) {
                                                    container.api.unfollowArtist(artistId)
                                                    following = false
                                                } else {
                                                    container.api.followArtist(
                                                        artistId,
                                                        FollowArtistBody(artistId, name),
                                                    )
                                                    following = true
                                                }
                                            }.onFailure {
                                                Toast.makeText(context, it.message ?: "Échec", Toast.LENGTH_SHORT).show()
                                            }
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Icon(
                                        if (following) Icons.Default.PersonRemove else Icons.Default.PersonAdd,
                                        null,
                                        Modifier.size(18.dp),
                                    )
                                    Spacer(Modifier.width(6.dp))
                                    Text(if (following) "Abonné" else "Suivre")
                                }
                                if (songs.isNotEmpty()) {
                                    Spacer(Modifier.height(8.dp))
                                    Row(
                                        Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Button(
                                            onClick = { onPlay(songs, 0) },
                                            modifier = Modifier.weight(1f),
                                        ) {
                                            Icon(Icons.Default.PlayArrow, null, Modifier.size(20.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text("Lecture")
                                        }
                                        OutlinedButton(
                                            onClick = { onPlay(songs.shuffled(), 0) },
                                            modifier = Modifier.weight(1f),
                                        ) {
                                            Icon(Icons.Default.Shuffle, null, Modifier.size(18.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text("Aléatoire")
                                        }
                                    }
                                    Spacer(Modifier.height(8.dp))
                                    OutlinedButton(
                                        onClick = {
                                            radioBusy = true
                                            scope.launch {
                                                val mix = buildRadioQueue(
                                                    container.api,
                                                    "artist",
                                                    artistId,
                                                    songs.firstOrNull(),
                                                )
                                                radioBusy = false
                                                if (mix.isEmpty()) {
                                                    Toast.makeText(context, "Radio indisponible", Toast.LENGTH_SHORT).show()
                                                } else {
                                                    onPlay(mix, 0)
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
                                }
                            }
                        }
                        description?.let { bio ->
                            val shown = if (showFullBio || bio.length <= 180) bio else bio.take(180).trimEnd() + "…"
                            Text(
                                shown,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            )
                            if (bio.length > 180) {
                                TextButton(onClick = { showFullBio = !showFullBio }) {
                                    Text(if (showFullBio) "Réduire" else "À propos")
                                }
                            }
                        }
                    }

                    if (songs.isNotEmpty()) {
                        item {
                            SectionTitle("Titres les plus écoutés")
                        }
                        itemsIndexed(songs.take(10), key = { i, t -> "song-${t.id}-$i" }) { index, track ->
                            TrackRow(
                                track = track,
                                onClick = { onPlay(songs, index) },
                                onMore = { onMore(track) },
                                onOpenArtist = { id, n ->
                                    if (id != null && id != artistId) onOpenDetail(
                                        TrackDto(id = id, title = n, type = "artist"),
                                    )
                                },
                            )
                        }
                    }

                    if (libTracks.isNotEmpty() || libAlbums.isNotEmpty()) {
                        item { SectionTitle("Dans ma bibliothèque") }
                        if (libAlbums.isNotEmpty()) {
                            item {
                                HorizontalShelf(
                                    items = libAlbums,
                                    onOpen = onOpenDetail,
                                    onPlaySong = { onPlay(listOf(it), 0) },
                                )
                            }
                        }
                        itemsIndexed(libTracks.take(8), key = { _, t -> "lib-${t.id}" }) { _, track ->
                            TrackRow(
                                track = track,
                                onClick = { onPlay(libTracks, libTracks.indexOf(track).coerceAtLeast(0)) },
                                onMore = { onMore(track) },
                            )
                        }
                    }

                    if (albums.isNotEmpty()) {
                        item { SectionTitle("Albums") }
                        item {
                            HorizontalShelf(
                                items = albums,
                                onOpen = onOpenDetail,
                                onPlaySong = { onPlay(listOf(it), 0) },
                            )
                        }
                    }
                    if (singles.isNotEmpty()) {
                        item { SectionTitle("Singles & EP") }
                        item {
                            HorizontalShelf(
                                items = singles,
                                onOpen = onOpenDetail,
                                onPlaySong = { onPlay(listOf(it), 0) },
                            )
                        }
                    }
                    if (featured.isNotEmpty()) {
                        item { SectionTitle("Apparitions") }
                        item {
                            HorizontalShelf(
                                items = featured,
                                onOpen = onOpenDetail,
                                onPlaySong = { onPlay(listOf(it), 0) },
                            )
                        }
                    }
                    if (videos.isNotEmpty()) {
                        item { SectionTitle("Vidéos") }
                        itemsIndexed(videos.take(8), key = { _, t -> "vid-${t.id}" }) { index, track ->
                            TrackRow(
                                track = track,
                                onClick = {
                                    if (track.isPlayable()) onPlay(videos.filter { it.isPlayable() }, index.coerceAtMost(videos.filter { it.isPlayable() }.lastIndex))
                                    else onOpenDetail(track)
                                },
                                onMore = { onMore(track) },
                            )
                        }
                    }
                    if (playlists.isNotEmpty()) {
                        item { SectionTitle("Playlists") }
                        item {
                            HorizontalShelf(
                                items = playlists,
                                onOpen = onOpenDetail,
                                onPlaySong = { onOpenDetail(it) },
                            )
                        }
                    }
                    if (similar.isNotEmpty()) {
                        item { SectionTitle("Les fans aiment aussi") }
                        item {
                            HorizontalShelf(
                                items = similar,
                                circle = true,
                                onOpen = onOpenDetail,
                                onPlaySong = { onOpenDetail(it) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
    )
}

@Composable
private fun HorizontalShelf(
    items: List<TrackDto>,
    onOpen: (TrackDto) -> Unit,
    onPlaySong: (TrackDto) -> Unit,
    circle: Boolean = false,
) {
    Row(
        Modifier
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items.take(16).forEach { item ->
            Column(
                Modifier
                    .width(120.dp)
                    .clickable {
                        when {
                            item.isArtist() || item.isAlbum() || item.isPlaylist() -> onOpen(item)
                            item.isPlayable() -> onPlaySong(item)
                            else -> onOpen(item)
                        }
                    }
                    .padding(4.dp),
            ) {
                MediaCover(item, 112.dp, circle = circle || item.isArtist())
                Spacer(Modifier.height(6.dp))
                Text(
                    item.title,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium,
                )
                if (!item.isArtist()) {
                    Text(
                        item.artistLine().takeIf { it != "Artiste" } ?: item.kind().replaceFirstChar { it.uppercase() },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
