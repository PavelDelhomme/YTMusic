package ovh.delhomme.ytmusic.ui.home

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.LibraryAddCheck
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.TrackDto
import ovh.delhomme.ytmusic.ui.components.AccountSheet
import ovh.delhomme.ytmusic.ui.components.AppTopBar
import ovh.delhomme.ytmusic.ui.components.HistorySheet
import ovh.delhomme.ytmusic.ui.components.MediaCover
import ovh.delhomme.ytmusic.ui.components.MixCollageCover
import ovh.delhomme.ytmusic.ui.components.TrackRow

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    container: AppContainer,
    onPlay: (List<TrackDto>, Int) -> Unit,
    onPlayNamed: (List<TrackDto>, Int, String) -> Unit = { tracks, idx, _ -> onPlay(tracks, idx) },
    onMore: (TrackDto) -> Unit,
    onOpenDetail: (TrackDto) -> Unit,
    onOpenArtist: ((String?, String) -> Unit)? = null,
    onOpenRecoPrefs: () -> Unit = {},
    onOpenDebugLogs: () -> Unit = {},
    onOpenYtmImport: () -> Unit = {},
    onLoggedOut: () -> Unit = {},
    onMoreMix: ((id: String, title: String, covers: List<TrackDto>) -> Unit)? = null,
    vm: HomeViewModel = viewModel(factory = HomeViewModel.factory(container)),
) {
    val state by vm.state.collectAsState()
    val pins by container.quickAccess.pins.collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var showAccount by remember { mutableStateOf(false) }
    var showHistory by remember { mutableStateOf(false) }
    var userPicture by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        userPicture = runCatching {
            container.ensureFreshToken()
            container.api.me().user?.picture
        }.getOrNull()
    }

    val listState = rememberLazyListState()
    LaunchedEffect(listState, state.hasMore, state.loadingMore) {
        snapshotFlow {
            val info = listState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull()?.index ?: 0
            val total = info.totalItemsCount
            total > 0 && last >= total - 3
        }
            .distinctUntilChanged()
            .filter { it }
            .collect {
                if (state.hasMore && !state.loadingMore) vm.loadMore()
            }
    }

    fun playItem(item: TrackDto, shelfItems: List<TrackDto>) {
        if (item.isPlaylist() || item.isAlbum() || item.isArtist()) {
            onOpenDetail(item)
            return
        }
        scope.launch {
            if (item.isPlayable()) {
                val list = shelfItems.filter { it.isPlayable() }.ifEmpty { listOf(item) }
                val idx = list.indexOfFirst { it.id == item.id }.coerceAtLeast(0)
                onPlay(list, idx)
            } else {
                onOpenDetail(item)
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        AppTopBar(
            title = "Music",
            showBrandLogo = true,
            userPictureUrl = userPicture,
            onAccountClick = { showAccount = true },
        )

        when {
            state.loading && state.shelves.isEmpty() -> {
                Column(
                    Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    CircularProgressIndicator()
                }
            }
            state.error != null && state.shelves.isEmpty() -> {
                Column(
                    Modifier.fillMaxSize().padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(state.error!!, color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = vm::refresh) { Text("Réessayer") }
                }
            }
            else -> {
                PullToRefreshBox(
                    isRefreshing = state.refreshing,
                    onRefresh = { vm.refresh(fromUser = true) },
                    modifier = Modifier.fillMaxSize(),
                ) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 24.dp),
                ) {
                item {
                    QuickAccessHomeCard(
                        pins = pins,
                        onPlayItem = { playItem(it, pins.filter { p -> p.isPlayable() }) },
                        onOpenDetail = onOpenDetail,
                        onMore = onMore,
                    )
                }

                if (state.radios.isNotEmpty()) {
                    item {
                        Text(
                            "Mixés pour toi",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onBackground,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                        )
                        Row(
                            Modifier
                                .horizontalScroll(rememberScrollState())
                                .padding(horizontal = 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            state.radios.forEach { radio ->
                                val loading = state.radioLoadingId == radio.id
                                val preview = state.radioPreviews[radio.id].orEmpty()
                                val saved = state.savedMixIds.contains(radio.id)
                                Column(Modifier.width(140.dp).padding(4.dp)) {
                                    Box(
                                        Modifier
                                            .size(132.dp)
                                            .clip(RoundedCornerShape(8.dp))
                                            .clickable(enabled = !loading) {
                                                vm.playRadio(radio.id) { tracks, title ->
                                                    onPlayNamed(tracks, 0, title)
                                                }
                                            },
                                    ) {
                                        MixCollageCover(
                                            tracks = preview,
                                            size = 132.dp,
                                            titleFallback = radio.title,
                                        )
                                        // Play toujours visible (mobile)
                                        Box(
                                            Modifier
                                                .align(Alignment.TopEnd)
                                                .padding(6.dp)
                                                .size(36.dp)
                                                .clip(RoundedCornerShape(18.dp))
                                                .background(MaterialTheme.colorScheme.error)
                                                .clickable(enabled = !loading) {
                                                    vm.playRadio(radio.id) { tracks, title ->
                                                        onPlayNamed(tracks, 0, title)
                                                    }
                                                },
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Icon(
                                                Icons.Default.PlayArrow,
                                                contentDescription = "Lire",
                                                tint = Color.White,
                                                modifier = Modifier.size(22.dp),
                                            )
                                        }
                                        Row(
                                            Modifier
                                                .align(Alignment.BottomEnd)
                                                .padding(4.dp),
                                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                                        ) {
                                            IconButton(
                                                onClick = { onMoreMix?.invoke(radio.id, radio.title, preview) },
                                                modifier = Modifier
                                                    .size(32.dp)
                                                    .background(
                                                        Color.Black.copy(alpha = 0.7f),
                                                        RoundedCornerShape(16.dp),
                                                    ),
                                            ) {
                                                Icon(
                                                    Icons.Default.MoreVert,
                                                    contentDescription = "Options",
                                                    tint = Color.White,
                                                    modifier = Modifier.size(18.dp),
                                                )
                                            }
                                            IconButton(
                                                onClick = {
                                                    if (!saved) {
                                                        scope.launch {
                                                            vm.saveMix(radio.id, radio.title, preview)
                                                        }
                                                    }
                                                },
                                                enabled = !saved,
                                                modifier = Modifier
                                                    .size(32.dp)
                                                    .background(
                                                        Color.Black.copy(alpha = 0.7f),
                                                        RoundedCornerShape(16.dp),
                                                    ),
                                            ) {
                                                Icon(
                                                    if (saved) Icons.Default.LibraryAddCheck else Icons.Default.Add,
                                                    contentDescription = if (saved) "Enregistré" else "Enregistrer",
                                                    tint = if (saved) MaterialTheme.colorScheme.error else Color.White,
                                                    modifier = Modifier.size(18.dp),
                                                )
                                            }
                                        }
                                        if (loading) {
                                            Box(
                                                Modifier
                                                    .fillMaxSize()
                                                    .background(
                                                        MaterialTheme.colorScheme.scrim.copy(alpha = 0.45f),
                                                    ),
                                                contentAlignment = Alignment.Center,
                                            ) {
                                                CircularProgressIndicator(
                                                    modifier = Modifier.size(28.dp),
                                                    strokeWidth = 2.dp,
                                                    color = MaterialTheme.colorScheme.onPrimary,
                                                )
                                            }
                                        }
                                    }
                                    Spacer(Modifier.height(8.dp))
                                    Text(
                                        radio.title,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Medium,
                                        color = MaterialTheme.colorScheme.onBackground,
                                    )
                                    Text(
                                        "Mix radio",
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }

                items(state.shelves, key = { it.title }) { shelf ->
                    val items = shelf.items
                    val mostlyCards = items.count {
                        it.isPlaylist() || it.isAlbum() || it.isArtist()
                    } >= items.size / 2 && items.isNotEmpty()

                    Text(
                        shelf.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onBackground,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                    )

                    if (mostlyCards || items.size > 5) {
                        Row(
                            Modifier
                                .horizontalScroll(rememberScrollState())
                                .padding(horizontal = 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            items.take(16).forEach { track ->
                                Column(
                                    Modifier
                                        .width(140.dp)
                                        .combinedClickable(
                                            onClick = { playItem(track, items) },
                                            onLongClick = { onMore(track) },
                                        )
                                        .padding(4.dp),
                                ) {
                                    MediaCover(
                                        track,
                                        132.dp,
                                        circle = track.isArtist(),
                                    )
                                    Spacer(Modifier.height(8.dp))
                                    Text(
                                        track.title,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Medium,
                                        color = MaterialTheme.colorScheme.onBackground,
                                    )
                                    Text(
                                        when {
                                            track.isPlaylist() -> "Playlist"
                                            track.isAlbum() -> "Album"
                                            track.isArtist() -> "Artiste"
                                            else -> track.artistLine()
                                        },
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(16.dp))
                    } else {
                        items.take(10).forEach { track ->
                            TrackRow(
                                track = track,
                                onClick = { playItem(track, items) },
                                onMore = { onMore(track) },
                                onOpenArtist = onOpenArtist,
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }

                if (state.loadingMore) {
                    item {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(Modifier.size(28.dp))
                        }
                    }
                } else if (state.hasMore) {
                    item {
                        TextButton(
                            onClick = { vm.loadMore() },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Voir plus")
                        }
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
            onOpenDebugLogs = onOpenDebugLogs,
            onOpenYtmImport = onOpenYtmImport,
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun QuickAccessHomeCard(
    pins: List<TrackDto>,
    onPlayItem: (TrackDto) -> Unit,
    onOpenDetail: (TrackDto) -> Unit,
    onMore: (TrackDto) -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(vertical = 12.dp),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                Icons.Default.PushPin,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(18.dp),
            )
            Text(
                "Accès rapide",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
        }
        Text(
            if (pins.isEmpty()) {
                "Épingle titres, playlists ou artistes depuis le menu ⋮"
            } else {
                "${pins.size} épinglé${if (pins.size > 1) "s" else ""}"
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp),
        )

        if (pins.isEmpty()) {
            Text(
                "Rien d'épinglé pour l'instant",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            )
        } else {
            Row(
                Modifier
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                pins.take(16).forEach { track ->
                    Column(
                        Modifier
                            .width(108.dp)
                            .combinedClickable(
                                onClick = {
                                    if (track.isPlaylist() || track.isAlbum() || track.isArtist()) {
                                        onOpenDetail(track)
                                    } else {
                                        onPlayItem(track)
                                    }
                                },
                                onLongClick = { onMore(track) },
                            )
                            .padding(4.dp),
                    ) {
                        MediaCover(track, 100.dp, circle = track.isArtist())
                        Spacer(Modifier.height(6.dp))
                        Text(
                            track.title.ifBlank { "Sans titre" },
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                        )
                        val subtitle = when {
                            track.isArtist() -> "Artiste"
                            else ->
                                track.artists
                                    ?.mapNotNull { it.name?.trim()?.takeIf { n -> n.isNotEmpty() } }
                                    ?.joinToString(", ")
                                    ?.takeIf { it.isNotBlank() }
                                    ?: when {
                                        track.isAlbum() -> "Album"
                                        track.isPlaylist() -> "Playlist"
                                        else -> null
                                    }
                        }
                        if (!subtitle.isNullOrBlank()) {
                            Text(
                                subtitle,
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
    }
}
