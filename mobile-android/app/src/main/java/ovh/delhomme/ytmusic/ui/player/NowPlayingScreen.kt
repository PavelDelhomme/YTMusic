package ovh.delhomme.ytmusic.ui.player

import android.os.SystemClock
import android.widget.Toast
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
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
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.Download
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.CreatePlaylistBody
import ovh.delhomme.ytmusic.data.PlaylistDto
import ovh.delhomme.ytmusic.data.TimedLyricLine
import ovh.delhomme.ytmusic.data.TrackDto
import ovh.delhomme.ytmusic.data.buildRadioQueue
import ovh.delhomme.ytmusic.player.PlayerController
import ovh.delhomme.ytmusic.player.PlayerUiState
import ovh.delhomme.ytmusic.player.RepeatMode
import ovh.delhomme.ytmusic.ui.components.ArtistLinksText
import ovh.delhomme.ytmusic.ui.components.MediaCover
import kotlin.math.abs
import kotlin.math.roundToInt

private enum class NowPlayingDragAxis { None, Horizontal, Vertical }

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
    onOpenArtist: ((id: String?, name: String) -> Unit)? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var scrub by remember(ui.track?.id) { mutableFloatStateOf(-1f) }
    var dragOffset by remember { mutableFloatStateOf(0f) }
    var mediaSlideX by remember { mutableFloatStateOf(0f) }
    val queueProgress = remember { Animatable(0f) }
    var showLyrics by remember { mutableStateOf(false) }
    var showSaveQueue by remember { mutableStateOf(false) }
    var lastPrevTap by remember { mutableLongStateOf(0L) }
    val density = LocalDensity.current
    val dismissPx = with(density) { 110.dp.toPx() }
    val queueRangePx = with(density) { 380.dp.toPx() }
    val flingDismiss = 2200f
    val listState = rememberLazyListState()
    val queueListState = rememberLazyListState()
    val queueOpen = queueProgress.value > 0.55f
    val queueInteractive = queueProgress.value > 0.02f

    fun settleOrClose() {
        scope.launch {
            if (dragOffset >= dismissPx) {
                onClose()
                dragOffset = 0f
            } else if (dragOffset > 0f) {
                val anim = Animatable(dragOffset)
                anim.animateTo(
                    0f,
                    spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = Spring.DampingRatioNoBouncy),
                ) {
                    dragOffset = value
                }
            }
        }
    }

    fun settleQueue(velocityY: Float = 0f) {
        scope.launch {
            val target = when {
                velocityY < -900f -> 1f
                velocityY > 900f -> 0f
                queueProgress.value >= 0.38f -> 1f
                else -> 0f
            }
            queueProgress.animateTo(
                target,
                spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = Spring.DampingRatioNoBouncy),
            )
        }
    }

    fun expandQueue() {
        scope.launch {
            queueProgress.animateTo(
                1f,
                spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = Spring.DampingRatioNoBouncy),
            )
        }
    }

    fun collapseQueue() {
        scope.launch {
            queueProgress.animateTo(
                0f,
                spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = Spring.DampingRatioNoBouncy),
            )
        }
    }

    fun onQueueDrag(deltaY: Float) {
        // deltaY < 0 = doigt vers le haut → ouvrir la file
        scope.launch {
            queueProgress.snapTo(
                (queueProgress.value - deltaY / queueRangePx).coerceIn(0f, 1f),
            )
        }
    }

    fun skipNextFromSwipe() {
        mediaSlideX = 0f
        player.skipNext()
    }

    fun skipPrevFromSwipe() {
        mediaSlideX = 0f
        player.skipPrevOrRestart(forcePrevious = true)
    }

    val dismissScroll = remember(queueOpen, dismissPx) {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                if (queueOpen) return Offset.Zero
                if (available.y < 0f && dragOffset > 0f) {
                    val next = (dragOffset + available.y).coerceAtLeast(0f)
                    val consumed = next - dragOffset
                    dragOffset = next
                    return Offset(0f, consumed)
                }
                return Offset.Zero
            }

            override fun onPostScroll(
                consumed: Offset,
                available: Offset,
                source: NestedScrollSource,
            ): Offset {
                if (queueOpen) return Offset.Zero
                if (available.y > 0f) {
                    dragOffset += available.y
                    return Offset(0f, available.y)
                }
                return Offset.Zero
            }

            override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {
                if (queueOpen) return Velocity.Zero
                if (dragOffset >= dismissPx || available.y > flingDismiss) {
                    onClose()
                    dragOffset = 0f
                    return available
                }
                if (dragOffset > 0f) {
                    val anim = Animatable(dragOffset)
                    anim.animateTo(
                        0f,
                        spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = Spring.DampingRatioNoBouncy),
                    ) {
                        dragOffset = value
                    }
                }
                return Velocity.Zero
            }
        }
    }

    LaunchedEffect(Unit) {
        while (isActive) {
            player.tick()
            delay(400)
        }
    }

    LaunchedEffect(ui.track?.id) {
        dragOffset = 0f
        mediaSlideX = 0f
    }

    LaunchedEffect(queueOpen, ui.queueIndex, ui.queue.size) {
        if (!queueOpen || ui.queue.isEmpty()) return@LaunchedEffect
        val target = ui.queueIndex.coerceIn(0, ui.queue.lastIndex)
        runCatching { queueListState.animateScrollToItem(target) }
    }

    LaunchedEffect(ui.queueIndex, queueInteractive) {
        if (queueInteractive || ui.queue.isEmpty()) return@LaunchedEffect
        // item 0 = zone média, item 1 = header file, puis les titres
        val target = (ui.queueIndex + 2).coerceAtLeast(0)
        runCatching { listState.animateScrollToItem(target) }
    }

    val dragProgress = (dragOffset / (dismissPx * 2.2f)).coerceIn(0f, 1f)
    val qp = queueProgress.value

    Box(
        Modifier
            .fillMaxSize()
            .offset { IntOffset(0, dragOffset.roundToInt().coerceAtLeast(0)) }
            .alpha(1f - dragProgress * 0.35f)
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .nestedScroll(dismissScroll),
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
            // Chrome / mini-header selon l’ouverture de la file
            Box(Modifier.fillMaxWidth()) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .graphicsLayer { alpha = (1f - qp * 1.2f).coerceIn(0f, 1f) }
                        .pointerInput(Unit) {
                            detectVerticalDragGestures(
                                onVerticalDrag = { _, amount ->
                                    if (amount > 0f || dragOffset > 0f) {
                                        dragOffset = (dragOffset + amount).coerceAtLeast(0f)
                                    }
                                },
                                onDragEnd = { settleOrClose() },
                                onDragCancel = { settleOrClose() },
                            )
                        },
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .padding(top = 6.dp, bottom = 2.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(
                            Modifier
                                .width(40.dp)
                                .height(4.dp)
                                .clip(RoundedCornerShape(2.dp))
                                .background(PlayerFg.copy(alpha = 0.35f)),
                        )
                    }
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 2.dp),
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

                if (queueInteractive) {
                    QueueExpandedHeader(
                        track = track,
                        playing = ui.playing,
                        queueTitle = ui.queueTitle,
                        progressHint = qp,
                        onCollapse = { collapseQueue() },
                        onToggle = player::toggle,
                        onCast = onCast,
                        onOpenArtist = onOpenArtist,
                        onQueueDrag = ::onQueueDrag,
                        onQueueDragEnd = { settleQueue(it) },
                        onSkipNext = ::skipNextFromSwipe,
                        onSkipPrev = ::skipPrevFromSwipe,
                        modifier = Modifier
                            .fillMaxWidth()
                            .graphicsLayer {
                                alpha = (qp * 1.15f).coerceIn(0f, 1f)
                                translationY = (1f - qp) * -28f
                            },
                    )
                }
            }

            Box(Modifier.weight(1f).fillMaxWidth()) {
                // Lecteur « plein » : cover + contrôles + aperçu file
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            alpha = (1f - qp * 1.05f).coerceIn(0f, 1f)
                            translationY = -qp * 48f
                        },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    userScrollEnabled = qp < 0.45f,
                ) {
                    item {
                        Column(
                            Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp)
                                .graphicsLayer { translationX = mediaSlideX * 0.35f },
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .nowPlayingMediaGestures(
                                        key = track.id,
                                        onDismissDelta = { delta ->
                                            dragOffset = (dragOffset + delta).coerceAtLeast(0f)
                                        },
                                        onDismissEnd = { settleOrClose() },
                                        onHorizontalDelta = { dx ->
                                            mediaSlideX = (mediaSlideX + dx).coerceIn(-120f, 120f)
                                        },
                                        onHorizontalEnd = { totalX ->
                                            when {
                                                totalX < -72f -> skipNextFromSwipe()
                                                totalX > 72f -> skipPrevFromSwipe()
                                                else -> mediaSlideX = 0f
                                            }
                                        },
                                        onHorizontalCancel = { mediaSlideX = 0f },
                                    ),
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
                                if (onOpenArtist != null) {
                                    ArtistLinksText(
                                        track = track,
                                        onOpenArtist = onOpenArtist,
                                        color = PlayerMuted,
                                        style = MaterialTheme.typography.bodyLarge,
                                        maxLines = 2,
                                    )
                                } else {
                                    Text(
                                        track.artistLine(),
                                        color = PlayerMuted,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
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
                                                    container.api.recoFeedback(
                                                        ovh.delhomme.ytmusic.data.RecoFeedbackBody(
                                                            track.id,
                                                            if (r.liked) "good" else "bad",
                                                            "now_playing_like",
                                                        ),
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
                            onExpand = { expandQueue() },
                            onSave = { showSaveQueue = true },
                            onQueueDrag = ::onQueueDrag,
                            onQueueDragEnd = { settleQueue(it) },
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

                // File plein écran (suit le doigt via queueProgress)
                if (queueInteractive) {
                    QueueExpandedBody(
                        ui = ui,
                        listState = queueListState,
                        onPlayAt = player::playAt,
                        onMore = onMore,
                        onMove = player::moveInQueue,
                        onSave = { showSaveQueue = true },
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer {
                                alpha = (qp * 1.1f).coerceIn(0f, 1f)
                                translationY = (1f - qp) * 96f
                            },
                    )
                }
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
        SaveQueueSheet(
            container = container,
            queue = ui.queue,
            defaultName = ui.queueTitle.takeIf { it != "File d'attente" } ?: "Ma file d'attente",
            onDismiss = { showSaveQueue = false },
            onSaved = { name ->
                showSaveQueue = false
                player.setQueueTitle(name)
                Toast.makeText(context, "File enregistrée « $name »", Toast.LENGTH_SHORT).show()
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
    onQueueDrag: (Float) -> Unit,
    onQueueDragEnd: (velocityY: Float) -> Unit,
) {
    var dragVelocity by remember { mutableFloatStateOf(0f) }
    Column(
        Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onExpand, onLongClick = onExpand)
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onVerticalDrag = { change, amount ->
                        change.consume()
                        dragVelocity = amount
                        onQueueDrag(amount)
                    },
                    onDragEnd = { onQueueDragEnd(dragVelocity * 60f) },
                    onDragCancel = { onQueueDragEnd(0f) },
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
    progressHint: Float,
    onCollapse: () -> Unit,
    onToggle: () -> Unit,
    onCast: (() -> Unit)?,
    onOpenArtist: ((id: String?, name: String) -> Unit)? = null,
    onQueueDrag: (Float) -> Unit,
    onQueueDragEnd: (velocityY: Float) -> Unit,
    onSkipNext: () -> Unit,
    onSkipPrev: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var dragVelocity by remember { mutableFloatStateOf(0f) }
    Column(
        modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .pointerInput(track.id) {
                var axis = NowPlayingDragAxis.None
                var totalX = 0f
                var totalY = 0f
                detectDragGestures(
                    onDragStart = {
                        axis = NowPlayingDragAxis.None
                        totalX = 0f
                        totalY = 0f
                        dragVelocity = 0f
                    },
                    onDragEnd = {
                        when (axis) {
                            NowPlayingDragAxis.Vertical -> onQueueDragEnd(dragVelocity * 60f)
                            NowPlayingDragAxis.Horizontal -> when {
                                totalX < -72f -> onSkipNext()
                                totalX > 72f -> onSkipPrev()
                            }
                            NowPlayingDragAxis.None -> Unit
                        }
                    },
                    onDragCancel = {
                        if (axis == NowPlayingDragAxis.Vertical) onQueueDragEnd(0f)
                    },
                    onDrag = { change, amount ->
                        totalX += amount.x
                        totalY += amount.y
                        if (axis == NowPlayingDragAxis.None && (abs(totalX) > 16f || abs(totalY) > 16f)) {
                            axis = if (abs(totalX) > abs(totalY)) {
                                NowPlayingDragAxis.Horizontal
                            } else {
                                NowPlayingDragAxis.Vertical
                            }
                        }
                        when (axis) {
                            NowPlayingDragAxis.Vertical -> {
                                change.consume()
                                dragVelocity = amount.y
                                onQueueDrag(amount.y)
                            }
                            NowPlayingDragAxis.Horizontal -> change.consume()
                            NowPlayingDragAxis.None -> Unit
                        }
                    },
                )
            }
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Box(
            Modifier
                .align(Alignment.CenterHorizontally)
                .width(36.dp)
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(PlayerFg.copy(alpha = (0.25f + 0.2f * progressHint).coerceIn(0.25f, 0.55f))),
        )
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            MediaCover(track, 48.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(track.title, maxLines = 1, overflow = TextOverflow.Ellipsis, color = PlayerFg, fontWeight = FontWeight.SemiBold)
                if (onOpenArtist != null) {
                    ArtistLinksText(
                        track = track,
                        onOpenArtist = onOpenArtist,
                        color = PlayerMuted,
                        style = MaterialTheme.typography.bodySmall,
                    )
                } else {
                    Text(track.artistLine(), maxLines = 1, overflow = TextOverflow.Ellipsis, color = PlayerMuted, style = MaterialTheme.typography.bodySmall)
                }
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
            IconButton(onClick = onCollapse) {
                Icon(Icons.Default.KeyboardArrowDown, "Replier la file", tint = PlayerFg)
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
    listState: LazyListState,
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
            Text(
                "${ui.queueIndex + 1} / ${ui.queue.size.coerceAtLeast(1)}",
                style = MaterialTheme.typography.labelMedium,
                color = PlayerMuted,
                modifier = Modifier.padding(end = 8.dp),
            )
            TextButton(onClick = onSave) {
                Text("Enregistrer")
            }
        }
        LazyColumn(Modifier.fillMaxSize(), state = listState) {
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

/** Swipe bas = replier le lecteur ; swipe H = titre suivant / précédent. */
private fun Modifier.nowPlayingMediaGestures(
    key: Any?,
    onDismissDelta: (Float) -> Unit,
    onDismissEnd: () -> Unit,
    onHorizontalDelta: (Float) -> Unit,
    onHorizontalEnd: (totalX: Float) -> Unit,
    onHorizontalCancel: () -> Unit,
): Modifier = pointerInput(key) {
    var axis = NowPlayingDragAxis.None
    var totalX = 0f
    var totalY = 0f
    var verticalAccum = 0f
    detectDragGestures(
        onDragStart = {
            axis = NowPlayingDragAxis.None
            totalX = 0f
            totalY = 0f
            verticalAccum = 0f
        },
        onDragEnd = {
            when (axis) {
                NowPlayingDragAxis.Vertical -> onDismissEnd()
                NowPlayingDragAxis.Horizontal -> onHorizontalEnd(totalX)
                NowPlayingDragAxis.None -> Unit
            }
        },
        onDragCancel = {
            when (axis) {
                NowPlayingDragAxis.Vertical -> onDismissEnd()
                NowPlayingDragAxis.Horizontal -> onHorizontalCancel()
                NowPlayingDragAxis.None -> Unit
            }
        },
        onDrag = { change, amount ->
            totalX += amount.x
            totalY += amount.y
            if (axis == NowPlayingDragAxis.None && (abs(totalX) > 18f || abs(totalY) > 18f)) {
                axis = if (abs(totalX) > abs(totalY)) {
                    NowPlayingDragAxis.Horizontal
                } else {
                    NowPlayingDragAxis.Vertical
                }
            }
            when (axis) {
                NowPlayingDragAxis.Vertical -> {
                    val next = (verticalAccum + amount.y).coerceAtLeast(0f)
                    val consumed = next - verticalAccum
                    if (consumed != 0f || amount.y > 0f) {
                        change.consume()
                        verticalAccum = next
                        onDismissDelta(consumed)
                    }
                }
                NowPlayingDragAxis.Horizontal -> {
                    change.consume()
                    onHorizontalDelta(amount.x)
                }
                NowPlayingDragAxis.None -> Unit
            }
        },
    )
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
        Spacer(Modifier.width(12.dp))
        Column(
            Modifier
                .weight(1f)
                .pointerInput(index) {
                    // Réordonner sans poignée visible : glisser verticalement sur le titre
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
        ) {
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SaveQueueSheet(
    container: AppContainer,
    queue: List<TrackDto>,
    defaultName: String,
    onDismiss: () -> Unit,
    onSaved: (String) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var playlists by remember { mutableStateOf<List<PlaylistDto>>(emptyList()) }
    var name by remember { mutableStateOf(defaultName) }
    var creating by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val playable = remember(queue) { queue.filter { it.isPlayable() } }

    LaunchedEffect(Unit) {
        playlists = runCatching { container.api.library().playlists }.getOrDefault(emptyList())
    }

    fun addAllTo(playlistId: String, label: String) {
        if (busy || playable.isEmpty()) return
        busy = true
        scope.launch {
            runCatching {
                playable.forEach { t ->
                    runCatching { container.api.addToPlaylist(playlistId, t) }
                }
                onSaved(label)
            }.onFailure {
                Toast.makeText(context, it.message ?: "Échec", Toast.LENGTH_SHORT).show()
            }
            busy = false
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 28.dp),
        ) {
            Text(
                "Enregistrer la file",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                "${playable.size} titres → playlist",
                style = MaterialTheme.typography.bodySmall,
                color = PlayerMuted,
                modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
            )

            TextButton(
                onClick = { creating = !creating },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.PlaylistAdd, null, modifier = Modifier.padding(end = 8.dp))
                Text(if (creating) "Masquer" else "Nouvelle playlist")
            }

            if (creating) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    singleLine = true,
                    label = { Text("Nom de la playlist") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                )
                TextButton(
                    enabled = !busy && playable.isNotEmpty(),
                    onClick = {
                        val n = name.trim().ifBlank { defaultName }
                        busy = true
                        scope.launch {
                            runCatching {
                                val pl = container.api.createPlaylist(CreatePlaylistBody(n))
                                playable.forEach { t ->
                                    runCatching { container.api.addToPlaylist(pl.id, t) }
                                }
                                onSaved(n)
                            }.onFailure {
                                Toast.makeText(context, it.message ?: "Échec", Toast.LENGTH_SHORT).show()
                            }
                            busy = false
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                ) {
                    Text(if (busy) "Enregistrement…" else "Créer et enregistrer")
                }
            }

            Text(
                "Playlists existantes",
                style = MaterialTheme.typography.labelLarge,
                color = PlayerMuted,
                modifier = Modifier.padding(top = 20.dp, bottom = 8.dp),
            )
            if (playlists.isEmpty()) {
                Text("Aucune playlist pour l’instant.", color = PlayerMuted)
            } else {
                playlists.forEach { pl ->
                    TextButton(
                        enabled = !busy && playable.isNotEmpty(),
                        onClick = { addAllTo(pl.id, pl.displayName()) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Default.QueueMusic, null, modifier = Modifier.padding(end = 8.dp))
                        Text(
                            pl.displayName(),
                            modifier = Modifier.weight(1f),
                            textAlign = TextAlign.Start,
                        )
                        Text(
                            "${pl.tracks?.size ?: 0}",
                            color = PlayerMuted,
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                }
            }
        }
    }
}

private fun formatMs(ms: Long): String {
    if (ms <= 0) return "0:00"
    val totalSec = ms / 1000
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}
