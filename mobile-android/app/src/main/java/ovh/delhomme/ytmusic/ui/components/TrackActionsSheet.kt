package ovh.delhomme.ytmusic.ui.components

import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlaylistAdd
import androidx.compose.material.icons.filled.PlaylistRemove
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.CreatePlaylistBody
import ovh.delhomme.ytmusic.data.PlaylistDto
import ovh.delhomme.ytmusic.data.TrackDto
import ovh.delhomme.ytmusic.data.buildRadioQueue
import ovh.delhomme.ytmusic.player.PlayerController

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrackActionsSheet(
    track: TrackDto,
    container: AppContainer,
    player: PlayerController,
    likedIds: Set<String>,
    onDismiss: () -> Unit,
    onLikedChanged: (Set<String>) -> Unit,
    onOpenAddToPlaylist: () -> Unit,
    onOpenAlbum: ((String) -> Unit)? = null,
    onOpenArtist: ((String) -> Unit)? = null,
    playlistId: String? = null,
    onRemovedFromPlaylist: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var pinned by remember { mutableStateOf(false) }
    var showSleep by remember { mutableStateOf(false) }
    val playerUi by player.state.collectAsState()
    val queueIndex = playerUi.queue.indexOfFirst { it.id == track.id }
    val inQueue = queueIndex >= 0
    val isCurrent = inQueue && queueIndex == playerUi.queueIndex

    LaunchedEffect(track.id) {
        pinned = container.quickAccess.isPinned(track.id)
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        val liked = track.id in likedIds
        val onSurface = MaterialTheme.colorScheme.onSurface
        val muted = MaterialTheme.colorScheme.onSurfaceVariant

        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MediaCover(track, 56.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    track.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    buildString {
                        append(track.artistLine())
                        track.duration?.takeIf { it.isNotBlank() }?.let {
                            append(" · ")
                            append(it)
                        }
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (track.isPlayable()) {
                IconButton(
                    onClick = {
                        scope.launch {
                            runCatching {
                                val r = container.api.like(track)
                                onLikedChanged(
                                    if (r.liked) likedIds + track.id else likedIds - track.id,
                                )
                            }
                        }
                    },
                ) {
                    Icon(
                        if (liked) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                        contentDescription = "J'aime",
                        tint = if (liked) MaterialTheme.colorScheme.primary else onSurface,
                    )
                }
            }
            IconButton(onClick = onDismiss) {
                Icon(Icons.Default.Close, contentDescription = "Fermer", tint = onSurface)
            }
        }

        if (track.isPlayable()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                QuickAction(Icons.Default.SkipNext, "Lire ensuite") {
                    player.playNext(track)
                    Toast.makeText(context, "Sera lu ensuite", Toast.LENGTH_SHORT).show()
                    onDismiss()
                }
                QuickAction(Icons.Default.PlaylistAdd, "Enregistrer dans une playlist") {
                    onOpenAddToPlaylist()
                }
                QuickAction(Icons.Default.Share, "Partager") {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(
                            Intent.EXTRA_TEXT,
                            "${track.title} — ${track.artistLine()}\nhttps://music.youtube.com/watch?v=${track.id}",
                        )
                    }
                    context.startActivity(Intent.createChooser(send, "Partager"))
                    onDismiss()
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))
        }

        if (track.isPlayable()) {
            SheetAction(Icons.Default.Radio, "Démarrer le mix / radio à partir de ce titre") {
                scope.launch {
                    runCatching {
                        val mix = buildRadioQueue(container.api, "track", track.id, track)
                        if (mix.isNotEmpty()) {
                            player.play(mix, 0)
                            Toast.makeText(context, "Mix démarré", Toast.LENGTH_SHORT).show()
                        }
                    }
                    onDismiss()
                }
            }
            SheetAction(Icons.Default.QueueMusic, "Ajouter à la file d'attente") {
                player.addToQueue(track)
                Toast.makeText(context, "Ajouté à la file", Toast.LENGTH_SHORT).show()
                onDismiss()
            }
            SheetAction(Icons.Default.Download, "Télécharger") {
                scope.launch {
                    runCatching { container.api.download(track.id) }
                        .onSuccess {
                            Toast.makeText(context, "Téléchargement lancé", Toast.LENGTH_SHORT).show()
                        }
                        .onFailure {
                            Toast.makeText(context, it.message ?: "Échec", Toast.LENGTH_SHORT).show()
                        }
                    onDismiss()
                }
            }
        }

        if (!playlistId.isNullOrBlank()) {
            SheetAction(Icons.Default.PlaylistRemove, "Supprimer de la playlist") {
                scope.launch {
                    runCatching {
                        container.api.removeFromPlaylist(playlistId, track.id)
                        Toast.makeText(context, "Retiré de la playlist", Toast.LENGTH_SHORT).show()
                        onRemovedFromPlaylist?.invoke()
                    }.onFailure {
                        Toast.makeText(context, it.message ?: "Échec", Toast.LENGTH_SHORT).show()
                    }
                    onDismiss()
                }
            }
        }

        track.album?.id?.let { albumId ->
            SheetAction(Icons.Default.Album, "Accéder à l'album", track.album.name) {
                onOpenAlbum?.invoke(albumId)
                onDismiss()
            }
        }

        val artists = track.artists.orEmpty().filter { !it.id.isNullOrBlank() }
        when {
            artists.size == 1 -> {
                SheetAction(Icons.Default.Person, "Accéder à la page de l'artiste", artists[0].name) {
                    onOpenArtist?.invoke(artists[0].id!!)
                    onDismiss()
                }
            }
            artists.size > 1 -> {
                artists.forEach { a ->
                    SheetAction(Icons.Default.Person, "Accéder à la page de l'artiste", a.name) {
                        onOpenArtist?.invoke(a.id!!)
                        onDismiss()
                    }
                }
            }
        }

        SheetAction(
            Icons.Default.PushPin,
            if (pinned) "Retirer de l'accès rapide" else "Épingler dans « Accès rapide »",
        ) {
            scope.launch {
                pinned = container.quickAccess.toggle(track)
                Toast.makeText(
                    context,
                    if (pinned) "Épinglé" else "Retiré de l'accès rapide",
                    Toast.LENGTH_SHORT,
                ).show()
                onDismiss()
            }
        }

        if (track.isPlayable() && inQueue && !isCurrent) {
            SheetAction(Icons.Default.Delete, "Supprimer de la file d'attente") {
                player.removeFromQueue(queueIndex)
                Toast.makeText(context, "Retiré de la file", Toast.LENGTH_SHORT).show()
                onDismiss()
            }
        }

        SheetAction(
            Icons.Default.Bedtime,
            "Délai de mise en veille",
            playerUi.sleepLabel?.let { "Actif : $it" },
        ) {
            showSleep = true
        }

        Spacer(Modifier.height(24.dp))
    }

    if (showSleep) {
        SleepTimerDialog(
            currentLabel = playerUi.sleepLabel,
            onDismiss = { showSleep = false },
            onPick = { delayMs, label ->
                if (delayMs == -1L) {
                    player.clearSleepTimer()
                    Toast.makeText(context, "Mise en veille annulée", Toast.LENGTH_SHORT).show()
                } else {
                    player.setSleepTimer(delayMs, label)
                    Toast.makeText(context, "Veille : $label", Toast.LENGTH_SHORT).show()
                }
                showSleep = false
                onDismiss()
            },
        )
    }
}

@Composable
private fun SleepTimerDialog(
    currentLabel: String?,
    onDismiss: () -> Unit,
    onPick: (delayMs: Long?, label: String) -> Unit,
) {
    val options = listOf(
        5L * 60_000 to "5 minutes",
        15L * 60_000 to "15 minutes",
        30L * 60_000 to "30 minutes",
        45L * 60_000 to "45 minutes",
        60L * 60_000 to "1 heure",
        null to "Fin de la chanson",
    )
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Délai de mise en veille") },
        text = {
            Column {
                currentLabel?.let {
                    Text(
                        "Actuel : $it",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                }
                options.forEach { (ms, label) ->
                    Text(
                        label,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onPick(ms, label) }
                            .padding(vertical = 12.dp),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
                if (currentLabel != null) {
                    Text(
                        "Annuler la veille",
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onPick(-1L, "") }
                            .padding(vertical = 12.dp),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Fermer") }
        },
    )
}

@Composable
private fun QuickAction(icon: ImageVector, label: String, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 4.dp)
            .width(110.dp),
    ) {
        Box(
            Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface)
        }
        Spacer(Modifier.height(6.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun SheetAction(
    icon: ImageVector,
    label: String,
    sub: String? = null,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurface)
        Spacer(Modifier.width(18.dp))
        Column {
            Text(
                label,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (!sub.isNullOrBlank()) {
                Text(
                    sub,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddToPlaylistSheet(
    track: TrackDto,
    container: AppContainer,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var playlists by remember { mutableStateOf<List<PlaylistDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var showCreate by remember { mutableStateOf(false) }
    var newName by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        loading = true
        playlists = runCatching { container.api.library().playlists }.getOrDefault(emptyList())
            .sortedByDescending { it.updatedAt ?: it.createdAt ?: 0L }
        loading = false
    }

    val recent = playlists.take(8)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Box(Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth().padding(bottom = 88.dp)) {
                Text(
                    "Ajouter à une playlist",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                )
                Text(
                    track.title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 20.dp),
                )
                Spacer(Modifier.height(16.dp))

                if (recent.isNotEmpty()) {
                    Text(
                        "Récentes",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                    )
                    Row(
                        Modifier
                            .horizontalScroll(rememberScrollState())
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        recent.forEach { pl ->
                            Column(
                                Modifier
                                    .width(96.dp)
                                    .clickable {
                                        scope.launch {
                                            runCatching { container.api.addToPlaylist(pl.id, track) }
                                            Toast.makeText(
                                                context,
                                                "Ajouté à ${pl.displayName()}",
                                                Toast.LENGTH_SHORT,
                                            ).show()
                                            onDismiss()
                                        }
                                    },
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Box(
                                    Modifier
                                        .size(88.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(MaterialTheme.colorScheme.surfaceVariant),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    MediaCover(
                                        TrackDto(
                                            id = pl.id,
                                            title = pl.displayName(),
                                            thumbnails = pl.cover()?.let {
                                                listOf(ovh.delhomme.ytmusic.data.Thumb(it))
                                            },
                                            type = "playlist",
                                        ),
                                        88.dp,
                                    )
                                }
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    pl.displayName(),
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                            }
                        }
                    }
                    HorizontalDivider(
                        Modifier.padding(vertical = 8.dp),
                        color = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f),
                    )
                }

                Text(
                    "Toutes les playlists",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                )
                LazyColumn(
                    contentPadding = PaddingValues(bottom = 16.dp),
                    modifier = Modifier.height(320.dp),
                ) {
                    items(playlists, key = { it.id }) { pl ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable {
                                    scope.launch {
                                        runCatching { container.api.addToPlaylist(pl.id, track) }
                                        Toast.makeText(
                                            context,
                                            "Ajouté à ${pl.displayName()}",
                                            Toast.LENGTH_SHORT,
                                        ).show()
                                        onDismiss()
                                    }
                                }
                                .padding(horizontal = 20.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            MediaCover(
                                TrackDto(
                                    id = pl.id,
                                    title = pl.displayName(),
                                    thumbnails = pl.cover()?.let {
                                        listOf(ovh.delhomme.ytmusic.data.Thumb(it))
                                    },
                                    type = "playlist",
                                ),
                                48.dp,
                            )
                            Spacer(Modifier.width(14.dp))
                            Column {
                                Text(
                                    pl.displayName(),
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                                Text(
                                    "${pl.tracks?.size ?: 0} titres",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }

            FloatingActionButton(
                onClick = { showCreate = true },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(20.dp),
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                shape = CircleShape,
            ) {
                Icon(Icons.Default.Add, contentDescription = "Nouvelle playlist")
            }
        }
    }

    if (showCreate) {
        AlertDialog(
            onDismissRequest = { showCreate = false },
            title = { Text("Nouvelle playlist") },
            text = {
                OutlinedTextField(
                    value = newName,
                    onValueChange = { newName = it },
                    singleLine = true,
                    placeholder = { Text("Nom") },
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val name = newName.trim().ifBlank { "Nouvelle playlist" }
                        scope.launch {
                            runCatching {
                                val pl = container.api.createPlaylist(CreatePlaylistBody(name))
                                container.api.addToPlaylist(pl.id, track)
                                Toast.makeText(context, "Créée et titre ajouté", Toast.LENGTH_SHORT).show()
                                onDismiss()
                            }.onFailure {
                                Toast.makeText(context, it.message ?: "Erreur", Toast.LENGTH_SHORT).show()
                            }
                        }
                    },
                ) { Text("Créer") }
            },
            dismissButton = {
                TextButton(onClick = { showCreate = false }) { Text("Annuler") }
            },
        )
    }
}
