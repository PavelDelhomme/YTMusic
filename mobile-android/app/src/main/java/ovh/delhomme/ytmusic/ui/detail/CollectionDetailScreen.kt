package ovh.delhomme.ytmusic.ui.detail

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PlaylistAdd
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.outlined.Album
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.ArtistRef
import ovh.delhomme.ytmusic.data.HistoryEntityBody
import ovh.delhomme.ytmusic.data.TrackDto
import ovh.delhomme.ytmusic.data.buildRadioQueue
import ovh.delhomme.ytmusic.data.resolvePlayableTracks
import ovh.delhomme.ytmusic.player.PlayerController
import ovh.delhomme.ytmusic.ui.components.MediaCover
import ovh.delhomme.ytmusic.ui.components.TrackRow

enum class DetailKind { Album, Artist, Playlist }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CollectionDetailScreen(
    container: AppContainer,
    kind: DetailKind,
    id: String,
    seed: TrackDto? = null,
    reloadToken: Int = 0,
    player: PlayerController? = null,
    onBack: () -> Unit,
    onPlay: (List<TrackDto>, Int) -> Unit,
    onPlayNamed: (List<TrackDto>, Int, String) -> Unit = { tracks, idx, _ -> onPlay(tracks, idx) },
    onMore: (TrackDto, playlistId: String?) -> Unit,
    onOpenArtist: (String, String) -> Unit = { _, _ -> },
    onOpenAddToPlaylist: (TrackDto) -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var radioBusy by remember { mutableStateOf(false) }
    var title by remember { mutableStateOf(seed?.title ?: "") }
    var subtitle by remember { mutableStateOf("") }
    var artistLine by remember { mutableStateOf("") }
    var artistId by remember { mutableStateOf<String?>(null) }
    var releaseType by remember { mutableStateOf("Album") }
    var year by remember { mutableStateOf<String?>(null) }
    var cover by remember { mutableStateOf(seed) }
    var tracks by remember { mutableStateOf<List<TrackDto>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var inLib by remember { mutableStateOf(false) }
    var showAlbumMenu by remember { mutableStateOf(false) }

    fun recordCollectionPlay() {
        val entityKind = when (kind) {
            DetailKind.Album -> "album"
            DetailKind.Artist -> "artist"
            DetailKind.Playlist -> "playlist"
        }
        scope.launch {
            runCatching {
                container.api.recordEntityPlay(
                    HistoryEntityBody(
                        id = id.removePrefix("local:"),
                        kind = entityKind,
                        title = title,
                        thumbnails = cover?.thumbnails,
                        artists = cover?.artists,
                        type = entityKind,
                    ),
                )
            }
        }
    }

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
                    artistLine = artists.joinToString(", ") { it.name }.ifBlank { "Artiste" }
                    artistId = artists.firstOrNull()?.id
                    year = r.album?.year
                    releaseType = when {
                        !r.album?.releaseType.isNullOrBlank() -> r.album!!.releaseType!!
                        r.tracks.size <= 1 -> "Single"
                        r.tracks.size <= 6 -> "EP"
                        else -> "Album"
                    }
                    subtitle = buildString {
                        append(releaseType)
                        year?.let { append(" - "); append(it) }
                    }
                    cover = r.album?.asTrack() ?: seed ?: TrackDto(id = id, title = title, type = "album")
                    tracks = r.tracks.filter { it.isPlayable() }.map { t ->
                        if (t.artists.isNullOrEmpty() && artists.isNotEmpty()) {
                            t.copy(artists = artists)
                        } else t
                    }
                    inLib = runCatching {
                        container.api.library().albums.any { it.id == id }
                    }.getOrDefault(false)
                }
                DetailKind.Artist -> {
                    val r = container.api.artist(id)
                    title = r.artist?.name ?: seed?.title ?: "Artiste"
                    subtitle = r.artist?.subscribers ?: "Artiste"
                    artistLine = title
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
        when {
            loading -> {
                Column(
                    Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) { CircularProgressIndicator() }
            }
            error != null && tracks.isEmpty() -> {
                Row(
                    Modifier.padding(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour")
                    }
                }
                Text(error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(24.dp))
            }
            kind == DetailKind.Album -> {
                LazyColumn(contentPadding = PaddingValues(bottom = 28.dp)) {
                    item {
                        AlbumHeroHeader(
                            title = title,
                            artistLine = artistLine,
                            metaLine = subtitle,
                            cover = cover,
                            inLibrary = inLib,
                            radioBusy = radioBusy,
                            onBack = onBack,
                            onArtistClick = {
                                val aid = artistId
                                if (!aid.isNullOrBlank()) onOpenArtist(aid, artistLine)
                                else Toast.makeText(context, "Artiste indisponible", Toast.LENGTH_SHORT).show()
                            },
                            onDownload = {
                                scope.launch {
                                    runCatching {
                                        container.api.offlineStart(
                                            mapOf("kind" to "album", "targetId" to id),
                                        )
                                    }.onSuccess {
                                        Toast.makeText(context, "Téléchargement démarré", Toast.LENGTH_SHORT).show()
                                    }.onFailure {
                                        Toast.makeText(context, it.message ?: "Échec offline", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            },
                            onToggleLibrary = {
                                scope.launch {
                                    runCatching {
                                        if (inLib) {
                                            container.api.removeAlbum(id)
                                            inLib = false
                                        } else {
                                            container.api.saveAlbum(
                                                TrackDto(
                                                    id = id,
                                                    title = title,
                                                    type = "album",
                                                    artists = cover?.artists ?: listOf(ArtistRef(artistLine, artistId)),
                                                    thumbnails = cover?.thumbnails,
                                                ),
                                            )
                                            inLib = true
                                        }
                                    }.onFailure {
                                        Toast.makeText(context, it.message ?: "Échec", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            },
                            onPlay = {
                                if (tracks.isEmpty()) return@AlbumHeroHeader
                                recordCollectionPlay()
                                onPlay(tracks, 0)
                            },
                            onRadio = {
                                radioBusy = true
                                scope.launch {
                                    val mix = buildRadioQueue(
                                        container.api,
                                        "album",
                                        id,
                                        tracks.firstOrNull(),
                                    )
                                    radioBusy = false
                                    if (mix.isEmpty()) {
                                        Toast.makeText(context, "Mix indisponible", Toast.LENGTH_SHORT).show()
                                    } else {
                                        onPlayNamed(mix, 0, "Mix album")
                                    }
                                }
                            },
                            onMore = { showAlbumMenu = true },
                        )
                    }
                    itemsIndexed(tracks, key = { i, t -> "${t.id}-$i" }) { index, track ->
                        TrackRow(
                            track = track,
                            onClick = { onPlay(tracks, index) },
                            onMore = { onMore(track, null) },
                        )
                    }
                }
            }
            else -> {
                // Playlist (et fallback artiste) — layout historique
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
                        "Playlist",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                    item {
                        Row(
                            Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.Bottom,
                        ) {
                            cover?.let { MediaCover(it, 140.dp) }
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
                                if (tracks.isNotEmpty()) {
                                    Row(
                                        Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Button(
                                            onClick = {
                                                recordCollectionPlay()
                                                onPlay(tracks, 0)
                                            },
                                            modifier = Modifier.weight(1f),
                                        ) {
                                            Icon(Icons.Default.PlayArrow, null, Modifier.size(20.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text("Lecture")
                                        }
                                        OutlinedButton(
                                            onClick = {
                                                recordCollectionPlay()
                                                onPlay(tracks.shuffled(), 0)
                                            },
                                            modifier = Modifier.weight(1f),
                                        ) {
                                            Icon(Icons.Default.Shuffle, null, Modifier.size(18.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text("Aléatoire")
                                        }
                                    }
                                }
                            }
                        }
                    }
                    itemsIndexed(tracks, key = { i, t -> "${t.id}-$i" }) { index, track ->
                        TrackRow(
                            track = track,
                            onClick = { onPlay(tracks, index) },
                            onMore = {
                                onMore(track, if (kind == DetailKind.Playlist) id else null)
                            },
                        )
                    }
                }
            }
        }
    }

    if (showAlbumMenu && kind == DetailKind.Album) {
        AlbumOverflowSheet(
            title = title,
            onDismiss = { showAlbumMenu = false },
            onPlayNext = {
                showAlbumMenu = false
                if (tracks.isEmpty()) return@AlbumOverflowSheet
                player?.playNextMany(tracks)
                    ?: run { onPlay(tracks, 0) }
                Toast.makeText(context, "Lecture ensuite", Toast.LENGTH_SHORT).show()
            },
            onAddToQueue = {
                showAlbumMenu = false
                if (tracks.isEmpty()) return@AlbumOverflowSheet
                player?.addManyToQueue(tracks)
                    ?: run { onPlay(tracks, 0) }
                Toast.makeText(context, "Ajouté à la file", Toast.LENGTH_SHORT).show()
            },
            onAddToPlaylist = {
                showAlbumMenu = false
                val seedTrack = tracks.firstOrNull()
                    ?: cover
                    ?: TrackDto(id = id, title = title, type = "album")
                onOpenAddToPlaylist(seedTrack)
            },
            onOpenArtist = {
                showAlbumMenu = false
                val aid = artistId
                if (!aid.isNullOrBlank()) onOpenArtist(aid, artistLine)
                else Toast.makeText(context, "Artiste indisponible", Toast.LENGTH_SHORT).show()
            },
            onQuickAccess = {
                showAlbumMenu = false
                scope.launch {
                    val pinTrack = cover ?: TrackDto(
                        id = id,
                        title = title,
                        type = "album",
                        artists = listOf(ArtistRef(artistLine, artistId)),
                    )
                    val pinned = container.quickAccess.toggle(pinTrack, container.api)
                    Toast.makeText(
                        context,
                        if (pinned) "Ajouté à l'accès rapide" else "Retiré de l'accès rapide",
                        Toast.LENGTH_SHORT,
                    ).show()
                }
            },
        )
    }
}

@Composable
private fun AlbumHeroHeader(
    title: String,
    artistLine: String,
    metaLine: String,
    cover: TrackDto?,
    inLibrary: Boolean,
    radioBusy: Boolean,
    onBack: () -> Unit,
    onArtistClick: () -> Unit,
    onDownload: () -> Unit,
    onToggleLibrary: () -> Unit,
    onPlay: () -> Unit,
    onRadio: () -> Unit,
    onMore: () -> Unit,
) {
    val screenW = LocalConfiguration.current.screenWidthDp.dp
    val coverSize = (screenW * 0.72f).coerceIn(220.dp, 340.dp)

    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = onBack,
                modifier = Modifier.size(52.dp),
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Retour",
                    modifier = Modifier.size(28.dp),
                )
            }
            Column(
                Modifier.weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    artistLine,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onArtistClick)
                        .padding(horizontal = 4.dp),
                )
                Text(
                    metaLine,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(Modifier.size(52.dp))
        }

        Spacer(Modifier.height(12.dp))

        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            cover?.let {
                MediaCover(it, coverSize, modifier = Modifier.aspectRatio(1f))
            }
        }

        Spacer(Modifier.height(20.dp))

        Text(
            title,
            style = MaterialTheme.typography.headlineMedium.copy(fontSize = 28.sp),
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp),
        )

        Spacer(Modifier.height(22.dp))

        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RoundIconAction(
                icon = Icons.Default.Download,
                contentDescription = "Télécharger",
                onClick = onDownload,
            )
            RoundIconAction(
                icon = if (inLibrary) Icons.Filled.Album else Icons.Outlined.Album,
                contentDescription = if (inLibrary) "Dans la bibliothèque" else "Enregistrer l'album",
                onClick = onToggleLibrary,
                tint = if (inLibrary) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            )
            Box(
                modifier = Modifier
                    .size(68.dp)
                    .clip(CircleShape)
                    .background(Color.White)
                    .clickable(onClick = onPlay),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Default.PlayArrow,
                    contentDescription = "Lecture",
                    tint = Color.Black,
                    modifier = Modifier.size(40.dp),
                )
            }
            RoundIconAction(
                icon = Icons.Default.Radio,
                contentDescription = "Mix",
                onClick = onRadio,
                enabled = !radioBusy,
            )
            RoundIconAction(
                icon = Icons.Default.MoreVert,
                contentDescription = "Plus d'options",
                onClick = onMore,
            )
        }

        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun RoundIconAction(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
    tint: Color = MaterialTheme.colorScheme.onSurface,
) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.size(48.dp),
    ) {
        Icon(
            icon,
            contentDescription = contentDescription,
            tint = if (enabled) tint else tint.copy(alpha = 0.4f),
            modifier = Modifier.size(26.dp),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AlbumOverflowSheet(
    title: String,
    onDismiss: () -> Unit,
    onPlayNext: () -> Unit,
    onAddToQueue: () -> Unit,
    onAddToPlaylist: () -> Unit,
    onOpenArtist: () -> Unit,
    onQuickAccess: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(Modifier.padding(bottom = 28.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
            HorizontalDivider()
            AlbumMenuRow(Icons.Default.SkipNext, "Lire ensuite", onPlayNext)
            AlbumMenuRow(Icons.Default.QueueMusic, "Ajouter à la file d'attente", onAddToQueue)
            AlbumMenuRow(Icons.Default.PlaylistAdd, "Enregistrer dans une playlist", onAddToPlaylist)
            AlbumMenuRow(Icons.Default.Person, "Accéder à la page de l'artiste", onOpenArtist)
            AlbumMenuRow(Icons.Outlined.PushPin, "Ajouter à l'accès rapide", onQuickAccess)
        }
    }
}

@Composable
private fun AlbumMenuRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(24.dp))
        Spacer(Modifier.width(16.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge)
    }
}
