package ovh.delhomme.ytmusic.ui.player

import android.os.SystemClock
import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Lyrics
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PlaylistAdd
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.CreatePlaylistBody
import ovh.delhomme.ytmusic.data.TimedLyricLine
import ovh.delhomme.ytmusic.data.TrackDto
import ovh.delhomme.ytmusic.data.buildRadioQueue
import ovh.delhomme.ytmusic.player.PlayerController
import ovh.delhomme.ytmusic.player.PlayerUiState
import ovh.delhomme.ytmusic.player.RepeatMode
import ovh.delhomme.ytmusic.ui.components.MediaCover
import kotlin.math.roundToInt

private val SeekRed = Color(0xFFFF0033)
private val PlayerFg = Color(0xFFF5F5F5)
private val PlayerMuted = Color(0xFFCFCFCF)

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable
fun NowPlayingScreen(
    player: PlayerController,
    ui: PlayerUiState,
    container: AppContainer,
    likedIds: Set<String>,
    onLikedChanged: (Set<String>) -> Unit,
    onClose: () -> Unit,
    onMore: ((TrackDto) -> Unit)? = null,
    onCast: (() -> Unit)? = null,
    onOpenAddToPlaylist: ((TrackDto) -> Unit)? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var scrub by remember(ui.track?.id) { mutableFloatStateOf(-1f) }
    var dragY by remember { mutableFloatStateOf(0f) }
    var queueExpanded by remember { mutableStateOf(false) }
    var showLyrics by remember { mutableStateOf(false) }
    var showSaveQueue by remember { mutableStateOf(false) }
    var lastPrevTap by remember { mutableLongStateOf(0L) }
    val density = LocalDensity.current
    val dismissPx = with(density) { 140.dp.toPx() }

    LaunchedEffect(Unit) {
        while (isActive) {
            player.tick()
            delay(400)
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .offset { IntOffset(0, dragY.roundToInt().coerceAtLeast(0)) }
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .pointerInput(queueExpanded) {
                if (queueExpanded) return@pointerInput
                detectVerticalDragGestures(
                    onVerticalDrag = { _, dragAmount ->
                        dragY = (dragY + dragAmount).coerceAtLeast(0f)
                    },
                    onDragEnd = {
                        if (dragY > dismissPx) onClose()
                        dragY = 0f
                    },
                    onDragCancel = { dragY = 0f },
                )
            },
    ) {
        val track = ui.track
        if (track == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Rien en lecture", color = PlayerMuted)
            }
        } else {
        val duration = ui.durationMs.coerceAtLeast(1L).toFloat()
        val progress = if (scrub >= 0f) scrub else (ui.positionMs / duration).coerceIn(0f, 1f)
        val liked = track.id in likedIds

        Column(Modifier.fillMaxSize()) {
            if (queueExpanded) {
                QueueExpandedHeader(
                    track = track,
                    playing = ui.playing,
                    queueTitle = ui.queueTitle,
                    onCollapse = { queueExpanded = false },
                    onToggle = player::toggle,
                    onCast = onCast,
                )
            } else {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onClose) {
                        Icon(
                            Icons.Default.KeyboardArrowDown,
                            contentDescription = "Replier",
                            tint = PlayerFg,
                            modifier = Modifier.size(32.dp),
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    NowPlayingChrome.topBarActions.forEach { slot ->
                        if (!slot.enabled) return@forEach
                        when (slot.id) {
                            PlayerChromeAction.Cast -> if (onCast != null) {
                                IconButton(onClick = onCast) {
                                    Icon(Icons.Default.Cast, slot.label, tint = PlayerFg)
                                }
                            }
                            PlayerChromeAction.More -> if (onMore != null) {
                                IconButton(onClick = { onMore(track) }) {
                                    Icon(Icons.Default.MoreVert, slot.label, tint = PlayerFg)
                                }
                            }
                            else -> Unit
                        }
                    }
                }
            }

            if (!queueExpanded) {
                LazyColumn(
                    Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    item {
                        Column(
                            Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            AsyncImage(
                                model = track.coverUrl(800),
                                contentDescription = track.title,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(260.dp)
                                    .clip(RoundedCornerShape(12.dp)),
                            )
                            Spacer(Modifier.height(18.dp))
                            Text(
                                track.title,
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Bold,
                                color = PlayerFg,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                                textAlign = TextAlign.Center,
                            )
                            Text(
                                track.artistLine(),
                                color = PlayerMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Spacer(Modifier.height(10.dp))
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceEvenly,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                NowPlayingChrome.secondaryActions.forEach { slot ->
                                    if (!slot.enabled) return@forEach
                                    when (slot.id) {
                                        PlayerChromeAction.Like -> SecondaryIcon(
                                            if (liked) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                                            slot.label,
                                            if (liked) MaterialTheme.colorScheme.primary else PlayerFg,
                                        ) {
                                            scope.launch {
                                                runCatching {
                                                    val r = container.api.like(track)
                                                    onLikedChanged(
                                                        if (r.liked) likedIds + track.id
                                                        else likedIds - track.id,
                                                    )
                                                }
                                            }
                                        }
                                        PlayerChromeAction.Lyrics -> SecondaryIcon(
                                            Icons.Default.Lyrics, slot.label, PlayerFg,
                                        ) { showLyrics = true }
                                        PlayerChromeAction.AddToPlaylist -> SecondaryIcon(
                                            Icons.Default.PlaylistAdd, slot.label, PlayerFg,
                                        ) { onOpenAddToPlaylist?.invoke(track) }
                                        PlayerChromeAction.Download -> SecondaryIcon(
                                            Icons.Default.Download, slot.label, PlayerFg,
                                        ) {
                                            scope.launch {
                                                runCatching { container.api.download(track.id) }
                                                    .onSuccess {
                                                        Toast.makeText(context, "Téléchargement lancé", Toast.LENGTH_SHORT).show()
                                                    }
                                                    .onFailure {
                                                        Toast.makeText(context, it.message ?: "Échec", Toast.LENGTH_SHORT).show()
                                                    }
                                            }
                                        }
                                        PlayerChromeAction.Mix -> SecondaryIcon(
                                            Icons.Default.Radio, slot.label, PlayerFg,
                                        ) {
                                            scope.launch {
                                                val mix = buildRadioQueue(container.api, "track", track.id, track)
                                                if (mix.isNotEmpty()) {
                                                    player.play(mix, 0, title = "Mix")
                                                    Toast.makeText(context, "Mix démarré", Toast.LENGTH_SHORT).show()
                                                }
                                            }
                                        }
                                        else -> Unit
                                    }
                                }
                            }
                            Spacer(Modifier.height(12.dp))
                            Slider(
                                value = progress,
                                onValueChange = { scrub = it },
                                onValueChangeFinished = {
                                    player.seek((scrub * duration).toLong())
                                    scrub = -1f
                                },
                                colors = SliderDefaults.colors(
                                    thumbColor = SeekRed,
                                    activeTrackColor = SeekRed,
                                    inactiveTrackColor = PlayerFg.copy(alpha = 0.25f),
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(
                                    formatMs(if (scrub >= 0f) (scrub * duration).toLong() else ui.positionMs),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = PlayerMuted,
                                )
                                Text(
                                    formatMs(ui.durationMs),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = PlayerMuted,
                                )
                            }
                            Spacer(Modifier.height(8.dp))
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceEvenly,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                NowPlayingChrome.transportActions.forEach { slot ->
                                    if (!slot.enabled) return@forEach
                                    when (slot.id) {
                                        PlayerChromeAction.Shuffle -> IconButton(onClick = player::toggleShuffle) {
                                            Icon(
                                                Icons.Default.Shuffle,
                                                slot.label,
                                                tint = if (ui.shuffle) MaterialTheme.colorScheme.primary else PlayerFg,
                                            )
                                        }
                                        PlayerChromeAction.Previous -> IconButton(
                                            onClick = {
                                                val now = SystemClock.elapsedRealtime()
                                                val double = now - lastPrevTap < 380L
                                                lastPrevTap = now
                                                player.skipPrevOrRestart(forcePrevious = double)
                                            },
                                        ) {
                                            Icon(
                                                Icons.Default.SkipPrevious,
                                                slot.label,
                                                tint = PlayerFg,
                                                modifier = Modifier.size(40.dp),
                                            )
                                        }
                                        PlayerChromeAction.PlayPause -> IconButton(onClick = player::toggle) {
                                            Icon(
                                                if (ui.playing) Icons.Default.Pause else Icons.Default.PlayArrow,
                                                slot.label,
                                                tint = PlayerFg,
                                                modifier = Modifier.size(56.dp),
                                            )
                                        }
                                        PlayerChromeAction.Next -> IconButton(onClick = player::skipNext) {
                                            Icon(
                                                Icons.Default.SkipNext,
                                                slot.label,
                                                tint = PlayerFg,
                                                modifier = Modifier.size(40.dp),
                                            )
                                        }
                                        PlayerChromeAction.Repeat -> IconButton(onClick = player::cycleRepeat) {
                                            Icon(
                                                when (ui.repeat) {
                                                    RepeatMode.One -> Icons.Default.RepeatOne
                                                    else -> Icons.Default.Repeat
                                                },
                                                slot.label,
                                                tint = when (ui.repeat) {
                                                    RepeatMode.Off -> PlayerMuted
                                                    else -> MaterialTheme.colorScheme.primary
                                                },
                                            )
                                        }
                                        else -> Unit
                                    }
                                }
                            }
                            Spacer(Modifier.height(16.dp))
                        }
                    }

                    item {
                        QueueSectionHeader(
                            title = ui.queueTitle,
                            count = "${ui.queueIndex + 1} / ${ui.queue.size.coerceAtLeast(1)}",
                            onExpand = { queueExpanded = true },
                            onSave = { showSaveQueue = true },
                        )
                    }

                    itemsIndexed(ui.queue, key = { i, t -> "${t.id}-$i" }) { index, item ->
                        QueueTrackRow(
                            track = item,
                            index = index,
                            highlighted = index == ui.queueIndex,
                            onClick = { player.playAt(index) },
                            onLongClick = { onMore?.invoke(item) },
                            onMove = { from, to -> player.moveInQueue(from, to) },
                        )
                    }
                    item { Spacer(Modifier.height(40.dp)) }
                }
            } else {
                QueueExpandedBody(
                    ui = ui,
                    onPlayAt = player::playAt,
                    onMore = onMore,
                    onMove = player::moveInQueue,
                    onSave = { showSaveQueue = true },
                    modifier = Modifier.weight(1f),
                )
            }
        }
        }
    }

    if (showLyrics && ui.track != null) {
        LyricsSheet(
            container = container,
            track = ui.track!!,
            positionMs = ui.positionMs,
            onDismiss = { showLyrics = false },
        )
    }
    if (showSaveQueue) {
        SaveQueueDialog(
            defaultName = ui.queueTitle.takeIf { it != "File d'attente" } ?: "Ma file d'attente",
            onDismiss = { showSaveQueue = false },
            onConfirm = { name ->
                showSaveQueue = false
                scope.launch {
                    runCatching {
                        val pl = container.api.createPlaylist(CreatePlaylistBody(name))
                        ui.queue.forEach { t ->
                            if (t.isPlayable()) runCatching { container.api.addToPlaylist(pl.id, t) }
                        }
                        player.setQueueTitle(name)
                        Toast.makeText(context, "Playlist « $name » créée", Toast.LENGTH_SHORT).show()
                    }.onFailure {
                        Toast.makeText(context, it.message ?: "Échec", Toast.LENGTH_SHORT).show()
                    }
                }
            },
        )
    }
}

@Composable
private fun SecondaryIcon(
    icon: ImageVector,
    label: String,
    tint: Color,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(onClick = onClick) {
            Icon(icon, label, tint = tint)
        }
        Text(label, style = MaterialTheme.typography.labelSmall, color = PlayerMuted, maxLines = 1)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun QueueSectionHeader(
    title: String,
    count: String,
    onExpand: () -> Unit,
    onSave: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onExpand, onLongClick = onExpand)
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onVerticalDrag = { _, amount -> if (amount < -20f) onExpand() },
                    onDragEnd = {},
                )
            }
            .padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        Box(
            Modifier
                .align(Alignment.CenterHorizontally)
                .width(36.dp)
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(PlayerFg.copy(alpha = 0.35f)),
        )
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.QueueMusic, null, tint = PlayerFg, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    "Lecture à partir de",
                    style = MaterialTheme.typography.labelSmall,
                    color = PlayerMuted,
                )
                Text(title, fontWeight = FontWeight.SemiBold, color = PlayerFg, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text(count, style = MaterialTheme.typography.labelMedium, color = PlayerMuted)
            IconButton(onClick = onSave) {
                Icon(Icons.Default.Save, "Enregistrer la file", tint = PlayerFg)
            }
        }
    }
}

@Composable
private fun QueueExpandedHeader(
    track: TrackDto,
    playing: Boolean,
    queueTitle: String,
    onCollapse: () -> Unit,
    onToggle: () -> Unit,
    onCast: (() -> Unit)?,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Box(
            Modifier
                .align(Alignment.CenterHorizontally)
                .width(36.dp)
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(PlayerFg.copy(alpha = 0.35f))
                .pointerInput(Unit) {
                    detectVerticalDragGestures(
                        onVerticalDrag = { _, amount -> if (amount > 24f) onCollapse() },
                        onDragEnd = {},
                    )
                },
        )
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            MediaCover(track, 48.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(track.title, maxLines = 1, overflow = TextOverflow.Ellipsis, color = PlayerFg, fontWeight = FontWeight.SemiBold)
                Text(track.artistLine(), maxLines = 1, overflow = TextOverflow.Ellipsis, color = PlayerMuted, style = MaterialTheme.typography.bodySmall)
            }
            if (onCast != null) {
                IconButton(onClick = onCast) {
                    Icon(Icons.Default.Cast, "Cast", tint = PlayerFg)
                }
            }
            IconButton(onClick = onToggle) {
                Icon(
                    if (playing) Icons.Default.Pause else Icons.Default.PlayArrow,
                    null,
                    tint = PlayerFg,
                )
            }
        }
        Text(
            "Lecture à partir de « $queueTitle »",
            style = MaterialTheme.typography.labelMedium,
            color = PlayerMuted,
            modifier = Modifier.padding(top = 8.dp, start = 4.dp),
        )
    }
}

@Composable
private fun QueueExpandedBody(
    ui: PlayerUiState,
    onPlayAt: (Int) -> Unit,
    onMore: ((TrackDto) -> Unit)?,
    onMove: (Int, Int) -> Unit,
    onSave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                ui.queueTitle,
                Modifier.weight(1f),
                fontWeight = FontWeight.SemiBold,
                color = PlayerFg,
            )
            TextButton(onClick = onSave) {
                Text("Enregistrer")
            }
        }
        LazyColumn(Modifier.fillMaxSize(), state = rememberLazyListState()) {
            itemsIndexed(ui.queue, key = { i, t -> "q-${t.id}-$i" }) { index, item ->
                QueueTrackRow(
                    track = item,
                    index = index,
                    highlighted = index == ui.queueIndex,
                    onClick = { onPlayAt(index) },
                    onLongClick = { onMore?.invoke(item) },
                    onMove = onMove,
                )
            }
            item { Spacer(Modifier.height(48.dp)) }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun QueueTrackRow(
    track: TrackDto,
    index: Int,
    highlighted: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onMove: (from: Int, to: Int) -> Unit,
) {
    var dragAccum by remember { mutableFloatStateOf(0f) }
    Row(
        Modifier
            .fillMaxWidth()
            .background(
                if (highlighted) MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
                else Color.Transparent,
            )
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MediaCover(track, 48.dp)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(
                track.title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = if (highlighted) MaterialTheme.colorScheme.primary else PlayerFg,
                fontWeight = FontWeight.Medium,
            )
            Row {
                Text(
                    track.artistLine(),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = PlayerMuted,
                    modifier = Modifier.weight(1f, fill = false),
                )
                track.duration?.takeIf { it.isNotBlank() }?.let {
                    Text(" · $it", style = MaterialTheme.typography.bodySmall, color = PlayerMuted)
                }
            }
        }
        Icon(
            Icons.Default.DragHandle,
            contentDescription = "Déplacer",
            tint = PlayerMuted,
            modifier = Modifier
                .size(28.dp)
                .pointerInput(index) {
                    detectDragGestures(
                        onDragEnd = { dragAccum = 0f },
                        onDragCancel = { dragAccum = 0f },
                        onDrag = { change, amount ->
                            change.consume()
                            dragAccum += amount.y
                            val threshold = 48.dp.toPx()
                            when {
                                dragAccum > threshold -> {
                                    onMove(index, index + 1)
                                    dragAccum = 0f
                                }
                                dragAccum < -threshold -> {
                                    if (index > 0) onMove(index, index - 1)
                                    dragAccum = 0f
                                }
                            }
                        },
                    )
                },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LyricsSheet(
    container: AppContainer,
    track: TrackDto,
    positionMs: Long,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var text by remember { mutableStateOf<String?>(null) }
    var timed by remember { mutableStateOf<List<TimedLyricLine>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(track.id) {
        loading = true
        runCatching { container.api.lyrics(track.id) }
            .onSuccess {
                text = it.lyrics
                timed = it.timed.orEmpty()
            }
            .onFailure {
                text = null
                timed = emptyList()
            }
        loading = false
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Text(
            "Paroles",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            color = PlayerFg,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
        )
        when {
            loading -> Text("Chargement…", color = PlayerMuted, modifier = Modifier.padding(20.dp))
            timed.isNotEmpty() -> {
                val active = timed.indexOfLast { it.startMs <= positionMs }.coerceAtLeast(0)
                LazyColumn(Modifier.padding(horizontal = 20.dp).height(420.dp)) {
                    itemsIndexed(timed) { i, line ->
                        Text(
                            line.text,
                            color = when {
                                i == active -> PlayerFg
                                i < active -> PlayerMuted.copy(alpha = 0.45f)
                                else -> PlayerMuted
                            },
                            fontWeight = if (i == active) FontWeight.SemiBold else FontWeight.Normal,
                            modifier = Modifier.padding(vertical = 6.dp),
                        )
                    }
                }
            }
            !text.isNullOrBlank() -> {
                LazyColumn(Modifier.padding(horizontal = 20.dp).height(420.dp)) {
                    item {
                        Text(
                            text!!,
                            color = PlayerFg,
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.padding(bottom = 32.dp),
                        )
                    }
                }
            }
            else -> Text(
                "Paroles indisponibles pour ce titre.",
                color = PlayerMuted,
                modifier = Modifier.padding(20.dp),
            )
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun SaveQueueDialog(
    defaultName: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var name by remember { mutableStateOf(defaultName) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Enregistrer la file") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                singleLine = true,
                label = { Text("Nom de la playlist") },
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(name.trim().ifBlank { defaultName }) }) {
                Text("Enregistrer")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Annuler") }
        },
    )
}

private fun formatMs(ms: Long): String {
    if (ms <= 0) return "0:00"
    val totalSec = ms / 1000
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}
