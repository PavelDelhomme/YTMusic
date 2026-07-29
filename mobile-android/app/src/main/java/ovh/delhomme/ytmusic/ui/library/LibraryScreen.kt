package ovh.delhomme.ytmusic.ui.library

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.ArtistRef
import ovh.delhomme.ytmusic.data.LibraryResponse
import ovh.delhomme.ytmusic.data.PlaylistDto
import ovh.delhomme.ytmusic.data.Thumb
import ovh.delhomme.ytmusic.data.TrackDto
import ovh.delhomme.ytmusic.ui.components.AccountSheet
import ovh.delhomme.ytmusic.ui.components.AppTopBar
import ovh.delhomme.ytmusic.ui.components.HistorySheet
import ovh.delhomme.ytmusic.ui.components.TrackRow

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun LibraryScreen(
    container: AppContainer,
    onPlay: (List<TrackDto>, Int) -> Unit,
    onMore: (TrackDto) -> Unit,
    onOpenDetail: (TrackDto) -> Unit,
    onOpenRecoPrefs: () -> Unit,
    onLoggedOut: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val filterStore = remember { LibraryFilterStore(context) }
    val hidden by filterStore.hiddenIds.collectAsState(initial = emptySet())

    var lib by remember { mutableStateOf<LibraryResponse?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var showAccount by remember { mutableStateOf(false) }
    var showHistory by remember { mutableStateOf(false) }
    var userPicture by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf(LibraryFilter.defaultSelected) }

    LaunchedEffect(Unit) {
        loading = true
        runCatching {
            container.ensureFreshToken()
            container.api.library()
        }.onSuccess {
            lib = it
            loading = false
        }.onFailure {
            error = it.message
            loading = false
        }
        userPicture = runCatching { container.api.me().user?.picture }.getOrNull()
    }

    val visibleFilters = remember(hidden) {
        LibraryFilter.entries.filter { it.name !in hidden }
    }
    LaunchedEffect(visibleFilters, selected) {
        if (selected.name in hidden && visibleFilters.isNotEmpty()) {
            selected = visibleFilters.first()
        }
    }

    Column(Modifier.fillMaxSize()) {
        AppTopBar(
            title = "Bibliothèque",
            userPictureUrl = userPicture,
            onAccountClick = { showAccount = true },
            onHistoryClick = null,
        )

        when {
            loading -> {
                Column(
                    Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) { CircularProgressIndicator() }
            }
            error != null && lib == null -> {
                Text(error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
            }
            else -> {
                val data = lib ?: LibraryResponse()

                Row(
                    Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    visibleFilters.forEach { filter ->
                        Box(
                            Modifier.combinedClickable(
                                onClick = { selected = filter },
                                onLongClick = {
                                    scope.launch { filterStore.hide(filter) }
                                },
                            ),
                        ) {
                            FilterChip(
                                selected = selected == filter,
                                onClick = { selected = filter },
                                label = { Text(filter.label) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = MaterialTheme.colorScheme.onSurface,
                                    selectedLabelColor = MaterialTheme.colorScheme.surface,
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                                    labelColor = MaterialTheme.colorScheme.onSurface,
                                ),
                            )
                        }
                    }
                    if (hidden.isNotEmpty()) {
                        TextButton(onClick = { scope.launch { filterStore.resetHidden() } }) {
                            Text("Réafficher")
                        }
                    }
                }

                val content = remember(data, selected) { buildLibraryContent(data, selected) }
                when {
                    content.comingSoon != null -> EmptyHint(content.comingSoon!!)
                    content.rows.isEmpty() -> EmptyHint(content.emptyMessage)
                    else -> {
                        LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                            item {
                                Text(
                                    content.headline,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                                )
                            }
                            if (content.playableQueue.isNotEmpty() && content.showPlayAll) {
                                item {
                                    TextButton(
                                        onClick = { onPlay(content.playableQueue, 0) },
                                        modifier = Modifier.padding(horizontal = 8.dp),
                                    ) { Text("Tout lire") }
                                }
                            }
                            itemsIndexed(content.rows, key = { i, r -> "${selected.name}-${r.id}-$i" }) { _, row ->
                                TrackRow(
                                    track = row,
                                    onClick = {
                                        when {
                                            row.isPlaylist() || row.isAlbum() || row.isArtist() ->
                                                onOpenDetail(row)
                                            row.isPlayable() -> {
                                                val list = content.playableQueue.ifEmpty { listOf(row) }
                                                val idx = list.indexOfFirst { it.id == row.id }.coerceAtLeast(0)
                                                onPlay(list, idx)
                                            }
                                            else -> onOpenDetail(row)
                                        }
                                    },
                                    onMore = { onMore(row) },
                                )
                            }
                            item {
                                Spacer(Modifier.height(12.dp))
                                Text(
                                    "Appui long sur un filtre pour le masquer de la barre",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAccount) {
        AccountSheet(
            container = container,
            onDismiss = { showAccount = false },
            onOpenRecoPrefs = onOpenRecoPrefs,
            onOpenHistory = { showHistory = true },
            onLoggedOut = onLoggedOut,
        )
    }
    if (showHistory) {
        HistorySheet(
            container = container,
            onDismiss = { showHistory = false },
            onPlay = onPlay,
            onMore = onMore,
        )
    }
}

@Composable
private fun EmptyHint(message: String) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            message,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodyLarge,
        )
    }
}

private data class LibraryContent(
    val headline: String,
    val rows: List<TrackDto>,
    val playableQueue: List<TrackDto>,
    val emptyMessage: String,
    val showPlayAll: Boolean = false,
    val comingSoon: String? = null,
)

private fun buildLibraryContent(data: LibraryResponse, filter: LibraryFilter): LibraryContent {
    fun az(tracks: List<TrackDto>) = tracks.sortedBy { it.title.lowercase() }

    fun playlistAsTrack(pl: PlaylistDto): TrackDto =
        TrackDto(
            id = if (pl.id.startsWith("local:")) pl.id else "local:${pl.id}",
            title = pl.displayName(),
            artists = listOf(ArtistRef("${pl.tracks?.size ?: 0} titres")),
            thumbnails = pl.cover()?.let { listOf(Thumb(it)) },
            type = "playlist",
        )

    fun likedPlaylistAsTrack(pl: TrackDto): TrackDto =
        pl.copy(type = pl.type ?: "playlist")

    return when (filter) {
        LibraryFilter.Additions -> {
            val recent = buildList {
                addAll(data.liked.take(40))
                addAll(data.albums.take(20).map { it.copy(type = it.type ?: "album") })
                addAll(data.playlists.take(20).map { playlistAsTrack(it) })
                addAll(data.likedPlaylists.take(10).map { likedPlaylistAsTrack(it) })
            }.distinctBy { it.id }
            LibraryContent(
                headline = "Enregistré récemment",
                rows = recent,
                playableQueue = recent.filter { it.isPlayable() },
                emptyMessage = "Rien d'enregistré pour l'instant. Like un titre ou ajoute un album.",
                showPlayAll = recent.any { it.isPlayable() },
            )
        }
        LibraryFilter.Tracks -> {
            val tracks = az(data.liked)
            LibraryContent(
                headline = "Titres · A–Z",
                rows = tracks,
                playableQueue = tracks.filter { it.isPlayable() },
                emptyMessage = "Aucun titre dans ta bibliothèque. Like un morceau pour l'y ajouter.",
                showPlayAll = tracks.isNotEmpty(),
            )
        }
        LibraryFilter.Playlists -> {
            val rows = buildList {
                addAll(data.playlists.map { playlistAsTrack(it) })
                addAll(data.likedPlaylists.map { likedPlaylistAsTrack(it) })
            }.distinctBy { it.id }.sortedBy { it.title.lowercase() }
            LibraryContent(
                headline = "Playlists · A–Z",
                rows = rows,
                playableQueue = emptyList(),
                emptyMessage = "Aucune playlist. Crée-en une ou enregistre une playlist YT Music.",
            )
        }
        LibraryFilter.Albums -> {
            val rows = az(data.albums.map { it.copy(type = it.type ?: "album") })
            LibraryContent(
                headline = "Albums · A–Z",
                rows = rows,
                playableQueue = emptyList(),
                emptyMessage = "Aucun album. Utilise « Enregistrer dans la bibliothèque » sur un album.",
            )
        }
        LibraryFilter.Artists -> {
            val rows = az(data.artists.map { it.copy(type = it.type ?: "artist") })
            LibraryContent(
                headline = "Artistes · A–Z",
                rows = rows,
                playableQueue = emptyList(),
                emptyMessage = "Aucun artiste enregistré.",
            )
        }
        LibraryFilter.Downloads -> {
            val byId = (data.liked + data.history).associateBy { it.id }
            val rows = az(
                data.downloaded.mapNotNull { id ->
                    byId[id] ?: TrackDto(id = id, title = id, type = "song")
                },
            )
            LibraryContent(
                headline = "Téléchargés · A–Z",
                rows = rows,
                playableQueue = rows.filter { it.isPlayable() },
                emptyMessage = "Aucun téléchargement prêt. Lance un DL depuis le menu ⋮ d'un titre.",
                showPlayAll = rows.any { it.isPlayable() },
            )
        }
        LibraryFilter.Profiles -> LibraryContent(
            headline = "Profils",
            rows = emptyList(),
            playableQueue = emptyList(),
            emptyMessage = "",
            comingSoon = "Profils — bientôt disponible.",
        )
        LibraryFilter.Podcasts -> LibraryContent(
            headline = "Podcasts",
            rows = emptyList(),
            playableQueue = emptyList(),
            emptyMessage = "",
            comingSoon = "Podcasts — bientôt disponible.",
        )
        LibraryFilter.DeviceFiles -> LibraryContent(
            headline = "Fichiers de l'appareil",
            rows = emptyList(),
            playableQueue = emptyList(),
            emptyMessage = "",
            comingSoon = "Fichiers locaux — bientôt disponible.",
        )
    }
}
