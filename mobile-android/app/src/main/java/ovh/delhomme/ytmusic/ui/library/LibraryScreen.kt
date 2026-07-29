package ovh.delhomme.ytmusic.ui.library

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.LibraryResponse
import ovh.delhomme.ytmusic.data.TrackDto
import ovh.delhomme.ytmusic.ui.components.AccountSheet
import ovh.delhomme.ytmusic.ui.components.AppTopBar
import ovh.delhomme.ytmusic.ui.components.HistorySheet
import ovh.delhomme.ytmusic.ui.components.TrackRow

@Composable
fun LibraryScreen(
    container: AppContainer,
    onPlay: (List<TrackDto>, Int) -> Unit,
    onMore: (TrackDto) -> Unit,
    onOpenDetail: (TrackDto) -> Unit,
    onOpenRecoPrefs: () -> Unit,
    onLoggedOut: () -> Unit,
) {
    var lib by remember { mutableStateOf<LibraryResponse?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var showAccount by remember { mutableStateOf(false) }
    var showHistory by remember { mutableStateOf(false) }
    var userPicture by remember { mutableStateOf<String?>(null) }

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

    Column(Modifier.fillMaxSize()) {
        AppTopBar(
            title = "Bibliothèque",
            userPictureUrl = userPicture,
            onAccountClick = { showAccount = true },
            onHistoryClick = { showHistory = true },
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
                LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                    if (data.history.isNotEmpty()) {
                        item { SectionTitle("Enregistré récemment") }
                        items(data.history.take(40), key = { "h-${it.id}-${it.title}" }) { track ->
                            TrackRow(
                                track,
                                onClick = {
                                    val list = data.history.filter { it.isPlayable() }
                                    onPlay(list, list.indexOfFirst { it.id == track.id }.coerceAtLeast(0))
                                },
                                onMore = { onMore(track) },
                            )
                        }
                    }
                    if (data.liked.isNotEmpty()) {
                        item { SectionTitle("Titres aimés") }
                        items(data.liked.take(30), key = { "liked-${it.id}" }) { track ->
                            TrackRow(
                                track,
                                onClick = {
                                    onPlay(
                                        data.liked.filter { it.isPlayable() },
                                        data.liked.indexOf(track).coerceAtLeast(0),
                                    )
                                },
                                onMore = { onMore(track) },
                            )
                        }
                    }
                    if (data.playlists.isNotEmpty()) {
                        item { SectionTitle("Playlists") }
                        items(data.playlists, key = { "pl-${it.id}" }) { pl ->
                            val asTrack = TrackDto(
                                id = "local:${pl.id}",
                                title = pl.displayName(),
                                artists = listOf(
                                    ovh.delhomme.ytmusic.data.ArtistRef("${pl.tracks?.size ?: 0} titres"),
                                ),
                                thumbnails = pl.cover()?.let {
                                    listOf(ovh.delhomme.ytmusic.data.Thumb(it))
                                },
                                type = "playlist",
                            )
                            TrackRow(
                                asTrack,
                                onClick = { onOpenDetail(asTrack) },
                                onMore = { onMore(asTrack) },
                            )
                        }
                    }
                    if (data.albums.isNotEmpty()) {
                        item { SectionTitle("Albums") }
                        items(data.albums, key = { "al-${it.id}" }) { track ->
                            TrackRow(
                                track.copy(type = track.type ?: "album"),
                                onClick = { onOpenDetail(track.copy(type = "album")) },
                                onMore = { onMore(track) },
                            )
                        }
                    }
                    if (data.artists.isNotEmpty()) {
                        item { SectionTitle("Artistes") }
                        items(data.artists, key = { "ar-${it.id}" }) { track ->
                            TrackRow(
                                track.copy(type = track.type ?: "artist"),
                                onClick = { onOpenDetail(track.copy(type = "artist")) },
                                onMore = { onMore(track) },
                            )
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
private fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
    )
}
