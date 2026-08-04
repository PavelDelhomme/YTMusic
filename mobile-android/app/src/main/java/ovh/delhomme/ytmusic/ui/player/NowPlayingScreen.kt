package ovh.delhomme.ytmusic.ui.player

import android.os.SystemClock
import android.widget.Toast
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
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
import androidx.compose.ui.unit.DpSize
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
import ovh.delhomme.ytmusic.data.RecoFeedbackBody
import ovh.delhomme.ytmusic.data.TimedLyricLine
import ovh.delhomme.ytmusic.data.TrackDto
import ovh.delhomme.ytmusic.data.buildRadioQueue
import ovh.delhomme.ytmusic.debug.AppLog
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
    /** Incrémenté au clic notif → recentre sur la cover / contrôles. */
    focusPlayerToken: Int = 0,
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

    // Remplit la zone « À suivre » — 1 fetch par seed, pas de boucle sur queue.size
    LaunchedEffect(ui.track?.id, ui.autoplaySuggestions) {
        if (!ui.autoplaySuggestions) return@LaunchedEffect
        val seed = ui.track?.id ?: return@LaunchedEffect
        val boundary = ui.userQueueEnd.coerceIn(0, ui.queue.size)
        val autoLen = (ui.queue.size - boundary).coerceAtLeast(0)
        // Assez de marge → ne pas refetch (appendAutoTracks ne doit pas relancer l’effet)
        if (autoLen >= 12) return@LaunchedEffect
        // Un seul appel ranked (related = similarForUser côté API)
        val related = runCatching { container.api.related(seed) }.getOrNull()
        val pool = (
            related?.tracks.orEmpty() +
                related?.related.orEmpty() +
                related?.radio.orEmpty()
            )
            .filter { it.isPlayable() && it.id != seed }
            .distinctBy { it.id }
        if (pool.isNotEmpty() && ui.track?.id == seed) player.appendAutoTracks(pool)
    }

    fun settleOrClose() {
        scope.launch {
            // File encore visible → ne jamais fermer le lecteur, juste replier la file
            if (queueProgress.value > 0.02f) {
                dragOffset = 0f
                queueProgress.animateTo(
                    0f,
                    spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = Spring.DampingRatioNoBouncy),
                )
                dragOffset = 0f
                return@launch
            }
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
            // Évite qu’un swipe résiduel ferme le Now Playing juste après le collapse
            if (target == 0f) dragOffset = 0f
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
            dragOffset = 0f
            queueProgress.animateTo(
                0f,
                spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = Spring.DampingRatioNoBouncy),
            )
            dragOffset = 0f
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

    val dismissScroll = remember(queueInteractive, dismissPx) {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                // File ouverte / en transition → pas de dismiss du lecteur
                if (queueProgress.value > 0.02f) return Offset.Zero
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
                if (queueProgress.value > 0.02f) return Offset.Zero
                if (available.y > 0f) {
                    dragOffset += available.y
                    return Offset(0f, available.y)
                }
                return Offset.Zero
            }

            override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {
                if (queueProgress.value > 0.02f) {
                    dragOffset = 0f
                    return Velocity.Zero
                }
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

    LaunchedEffect(ui.playing, showLyrics) {
        while (isActive) {
            player.tick()
            delay(
                when {
                    showLyrics && ui.playing -> 80L
                    ui.playing -> 200L
                    else -> 800L
                },
            )
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

    // Ne pas auto-scroller vers la file quand on est sur le lecteur (notif / ouverture).
    // Seulement suivre le titre courant si l’utilisateur a déjà scrollé dans la section file.
    LaunchedEffect(ui.queueIndex) {
        if (queueInteractive || ui.queue.isEmpty()) return@LaunchedEffect
        if (listState.firstVisibleItemIndex <= 1) return@LaunchedEffect
        val target = (ui.queueIndex + 2).coerceAtLeast(0)
        runCatching { listState.animateScrollToItem(target) }
    }

    // Clic notification / réouverture → zone média (pas la file)
    LaunchedEffect(focusPlayerToken) {
        if (focusPlayerToken <= 0) return@LaunchedEffect
        queueProgress.snapTo(0f)
        runCatching { listState.scrollToItem(0) }
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
        // Ambient blur YTM
        if (track != null) {
            AsyncImage(
                model = track.coverUrl(320),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxSize()
                    .blur(56.dp)
                    .alpha(0.42f),
            )
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.72f)),
            )
        }
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
                        .pointerInput(queueInteractive) {
                            detectVerticalDragGestures(
                                onVerticalDrag = { _, amount ->
                                    if (queueProgress.value > 0.02f) {
                                        // Replie la file, ne dismiss pas le lecteur
                                        onQueueDrag(amount)
                                        return@detectVerticalDragGestures
                                    }
                                    if (amount > 0f || dragOffset > 0f) {
                                        dragOffset = (dragOffset + amount).coerceAtLeast(0f)
                                    }
                                },
                                onDragEnd = {
                                    if (queueProgress.value > 0.02f) settleQueue(0f)
                                    else settleOrClose()
                                },
                                onDragCancel = {
                                    if (queueProgress.value > 0.02f) settleQueue(0f)
                                    else settleOrClose()
                                },
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
                        IconButton(
                            onClick = {
                                if (queueInteractive) collapseQueue()
                                else onClose()
                            },
                        ) {
                            Icon(
                                Icons.Default.KeyboardArrowDown,
                                contentDescription = if (queueInteractive) "Replier la file" else "Replier",
                                tint = PlayerFg,
                                modifier = Modifier.size(32.dp),
                            )
                        }
                        Spacer(Modifier.weight(1f))
                        NowPlayingChrome.topBarActions.forEach { slot ->
                            if (!slot.enabled) return@forEach
                            when (slot.id) {
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
                                            if (queueProgress.value > 0.02f) {
                                                onQueueDrag(delta)
                                            } else {
                                                dragOffset = (dragOffset + delta).coerceAtLeast(0f)
                                            }
                                        },
                                        onDismissEnd = {
                                            if (queueProgress.value > 0.02f) settleQueue(0f)
                                            else settleOrClose()
                                        },
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
                                if (showLyrics) {
                                    InlineSyncedLyrics(
                                        container = container,
                                        track = track,
                                        positionMs = ui.positionMs,
                                        onSeek = { player.seek(it) },
                                        onClose = { showLyrics = false },
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(320.dp)
                                            .clip(RoundedCornerShape(12.dp))
                                            .background(Color.Black.copy(alpha = 0.35f)),
                                    )
                                } else {
                                    AsyncImage(
                                        model = track.coverUrl(800),
                                        contentDescription = track.title,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(260.dp)
                                            .clip(RoundedCornerShape(12.dp))
                                            .clickable { showLyrics = true },
                                    )
                                }
                                Spacer(Modifier.height(18.dp))
                                Text(
                                    track.title,
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = PlayerFg,
                                    maxLines = 1,
                                    overflow = TextOverflow.Clip,
                                    textAlign = TextAlign.Start,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .basicMarquee(
                                            iterations = Int.MAX_VALUE,
                                            initialDelayMillis = 1200,
                                        ),
                                )
                                if (onOpenArtist != null) {
                                    ArtistLinksText(
                                        track = track,
                                        onOpenArtist = onOpenArtist,
                                        color = PlayerMuted,
                                        style = MaterialTheme.typography.bodyLarge,
                                        maxLines = 1,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .basicMarquee(
                                                iterations = Int.MAX_VALUE,
                                                initialDelayMillis = 1600,
                                            ),
                                    )
                                } else {
                                    Text(
                                        track.artistLine(),
                                        color = PlayerMuted,
                                        maxLines = 1,
                                        overflow = TextOverflow.Clip,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .basicMarquee(
                                                iterations = Int.MAX_VALUE,
                                                initialDelayMillis = 1600,
                                            ),
                                    )
                                }
                            }
                            Spacer(Modifier.height(10.dp))
                            ui.sleepLabel?.let { label ->
                                Row(
                                    Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(20.dp))
                                        .background(Color(0x33FFB300))
                                        .clickable { /* ouvert via ⋮ */ }
                                        .padding(horizontal = 12.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text(
                                        "Minuteur · $label",
                                        color = PlayerFg,
                                        style = MaterialTheme.typography.labelMedium,
                                    )
                                    Text(
                                        "Annuler",
                                        color = PlayerFg,
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        modifier = Modifier.clickable { player.clearSleepTimer() },
                                    )
                                }
                                Spacer(Modifier.height(8.dp))
                            }
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                NowPlayingChrome.secondaryActions.forEach { slot ->
                                    if (!slot.enabled) return@forEach
                                    when (slot.id) {
                                        PlayerChromeAction.Like -> SecondaryChip(
                                            icon = if (liked) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                                            label = slot.label,
                                            tint = if (liked) MaterialTheme.colorScheme.primary else PlayerFg,
                                            showLabel = false,
                                        ) {
                                            scope.launch {
                                                runCatching {
                                                    AppLog.breadcrumb("like", track.id)
                                                    val r = container.api.like(track)
                                                    onLikedChanged(
                                                        if (r.liked) likedIds + track.id
                                                        else likedIds - track.id,
                                                    )
                                                    container.api.recoFeedback(
                                                        RecoFeedbackBody(
                                                            track.id,
                                                            if (r.liked) "good" else "bad",
                                                            "now_playing_like",
                                                        ),
                                                    )
                                                }.onFailure { AppLog.e("like", "échec like ${track.id}", it) }
                                            }
                                        }
                                        PlayerChromeAction.Lyrics -> SecondaryChip(
                                            Icons.Default.Lyrics, slot.label, PlayerFg, showLabel = false,
                                        ) { showLyrics = !showLyrics }
                                        PlayerChromeAction.AddToPlaylist -> SecondaryChip(
                                            Icons.Default.PlaylistAdd, slot.label, PlayerFg, showLabel = true,
                                        ) { onOpenAddToPlaylist?.invoke(track) }
                                        PlayerChromeAction.Download -> SecondaryChip(
                                            Icons.Default.Download, slot.label, PlayerFg, showLabel = false,
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
                                        PlayerChromeAction.Mix -> SecondaryChip(
                                            Icons.Default.Radio, slot.label, PlayerFg, showLabel = true,
                                        ) {
                                            scope.launch {
                                                val mix = buildRadioQueue(container.api, "track", track.id, track)
                                                if (mix.isNotEmpty()) {
                                                    player.play(mix, 0, title = "Mix", userQueueEnd = 1)
                                                    Toast.makeText(context, "Mix démarré", Toast.LENGTH_SHORT).show()
                                                }
                                            }
                                        }
                                        else -> Unit
                                    }
                                }
                            }
                            Spacer(Modifier.height(8.dp))
                            val seekInteraction = remember { MutableInteractionSource() }
                            val bufferedFrac = if (ui.durationMs > 0) {
                                (ui.bufferedMs.toFloat() / ui.durationMs).coerceIn(0f, 1f)
                            } else {
                                0f
                            }
                            val seekColors = SliderDefaults.colors(
                                thumbColor = Color.White,
                                activeTrackColor = SeekRed,
                                inactiveTrackColor = PlayerFg.copy(alpha = 0.18f),
                            )
                            Box(Modifier.fillMaxWidth()) {
                                // Buffer gris derrière le slider
                                Box(
                                    Modifier
                                        .fillMaxWidth()
                                        .height(2.dp)
                                        .align(Alignment.Center)
                                        .clip(RoundedCornerShape(1.dp))
                                        .background(PlayerFg.copy(alpha = 0.12f)),
                                ) {
                                    Box(
                                        Modifier
                                            .fillMaxWidth(bufferedFrac)
                                            .height(2.dp)
                                            .background(PlayerFg.copy(alpha = 0.32f)),
                                    )
                                }
                                Slider(
                                value = progress,
                                onValueChange = { scrub = it },
                                onValueChangeFinished = {
                                    player.seek((scrub * duration).toLong())
                                    scrub = -1f
                                },
                                colors = seekColors,
                                interactionSource = seekInteraction,
                                thumb = {
                                    SliderDefaults.Thumb(
                                        interactionSource = seekInteraction,
                                        colors = seekColors,
                                        enabled = true,
                                        thumbSize = if (scrub >= 0f) DpSize(14.dp, 14.dp) else DpSize(10.dp, 10.dp),
                                    )
                                },
                                track = { sliderState ->
                                    SliderDefaults.Track(
                                        sliderState = sliderState,
                                        colors = seekColors,
                                        enabled = true,
                                        modifier = Modifier.height(2.dp),
                                        thumbTrackGapSize = 0.dp,
                                        drawStopIndicator = null,
                                    )
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(28.dp),
                                )
                            }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
                                val remainingMs = (
                                    ui.durationMs - (if (scrub >= 0f) (scrub * duration).toLong() else ui.positionMs)
                                    ).coerceAtLeast(0L)
                                Text(
                                    "-${formatMs(remainingMs)}",
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
                            title = "File d'attente",
                            count = "${ui.userQueueEnd.coerceIn(0, ui.queue.size)}",
                            shuffle = ui.shuffle,
                            repeat = ui.repeat,
                            onExpand = { expandQueue() },
                            onSave = { showSaveQueue = true },
                            onToggleShuffle = player::toggleShuffle,
                            onCycleRepeat = player::cycleRepeat,
                            onQueueDrag = ::onQueueDrag,
                            onQueueDragEnd = { settleQueue(it) },
                        )
                    }

                    val boundary = ui.userQueueEnd.coerceIn(0, ui.queue.size)
                    itemsIndexed(
                        ui.queue.take(boundary),
                        key = { i, t -> "iu-${t.id}-$i" },
                    ) { index, item ->
                        QueueTrackRow(
                            track = item,
                            index = index,
                            highlighted = index == ui.queueIndex,
                            onClick = { player.playAt(index) },
                            onLongClick = { onMore?.invoke(item) },
                            onMove = { from, to -> player.moveInQueue(from, to) },
                            onMore = onMore?.let { { it(item) } },
                        )
                    }
                    item {
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text("À suivre", fontWeight = FontWeight.SemiBold, color = PlayerFg)
                                Text(
                                    "Lecture automatique",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = PlayerMuted,
                                )
                            }
                            Switch(
                                checked = ui.autoplaySuggestions,
                                onCheckedChange = { player.toggleAutoplaySuggestions() },
                                colors = SwitchDefaults.colors(
                                    checkedTrackColor = SeekRed,
                                    checkedThumbColor = Color.White,
                                ),
                            )
                        }
                    }
                    if (ui.autoplaySuggestions) {
                        itemsIndexed(
                            ui.queue.drop(boundary),
                            key = { i, t -> "ia-${t.id}-${boundary + i}" },
                        ) { i, item ->
                            val abs = boundary + i
                            QueueTrackRow(
                                track = item,
                                index = abs,
                                highlighted = abs == ui.queueIndex,
                                onClick = { player.playAt(abs) },
                                onLongClick = { onMore?.invoke(item) },
                                onMove = { from, to -> player.moveInQueue(from, to) },
                                onMore = onMore?.let { { it(item) } },
                            )
                        }
                    }
                    item { Spacer(Modifier.height(40.dp)) }
                }

                // File plein écran (suit le doigt via queueProgress)
                if (queueInteractive) {
                    QueueExpandedBody(
                        ui = ui,
                        container = container,
                        player = player,
                        listState = queueListState,
                        onPlayAt = player::playAt,
                        onMore = onMore,
                        onMove = player::moveInQueue,
                        onSave = { showSaveQueue = true },
                        onToggleAutoplay = player::toggleAutoplaySuggestions,
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

    if (showSaveQueue) {
        SaveQueueSheet(
            container = container,
            queue = ui.queue.take(ui.userQueueEnd.coerceIn(0, ui.queue.size)).ifEmpty { ui.queue },
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
private fun SecondaryChip(
    icon: ImageVector,
    label: String,
    tint: Color,
    showLabel: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(PlayerFg.copy(alpha = 0.08f))
            .clickable(onClick = onClick)
            .padding(
                horizontal = if (showLabel) 12.dp else 10.dp,
                vertical = 8.dp,
            ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size(20.dp))
        if (showLabel) {
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                color = PlayerFg,
                maxLines = 1,
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun QueueSectionHeader(
    title: String,
    count: String,
    shuffle: Boolean,
    repeat: RepeatMode,
    onExpand: () -> Unit,
    onSave: () -> Unit,
    onToggleShuffle: () -> Unit,
    onCycleRepeat: () -> Unit,
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
            IconButton(onClick = onCycleRepeat) {
                Icon(
                    if (repeat == RepeatMode.One) Icons.Default.RepeatOne else Icons.Default.Repeat,
                    contentDescription = when (repeat) {
                        RepeatMode.Off -> "Boucle désactivée"
                        RepeatMode.All -> "Boucler toute la file"
                        RepeatMode.One -> "Boucler le titre"
                    },
                    tint = if (repeat != RepeatMode.Off) MaterialTheme.colorScheme.primary else PlayerFg,
                )
            }
            IconButton(onClick = onToggleShuffle) {
                Icon(
                    Icons.Default.Shuffle,
                    contentDescription = if (shuffle) "Aléatoire activé" else "Aléatoire",
                    tint = if (shuffle) MaterialTheme.colorScheme.primary else PlayerFg,
                )
            }
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
                Text(
                    track.title,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                    color = PlayerFg,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .fillMaxWidth()
                        .basicMarquee(iterations = Int.MAX_VALUE, initialDelayMillis = 1000),
                )
                if (onOpenArtist != null) {
                    ArtistLinksText(
                        track = track,
                        onOpenArtist = onOpenArtist,
                        color = PlayerMuted,
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        modifier = Modifier
                            .fillMaxWidth()
                            .basicMarquee(iterations = Int.MAX_VALUE, initialDelayMillis = 1400),
                    )
                } else {
                    Text(
                        track.artistLine(),
                        maxLines = 1,
                        overflow = TextOverflow.Clip,
                        color = PlayerMuted,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier
                            .fillMaxWidth()
                            .basicMarquee(iterations = Int.MAX_VALUE, initialDelayMillis = 1400),
                    )
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
    container: AppContainer,
    player: PlayerController,
    listState: LazyListState,
    onPlayAt: (Int) -> Unit,
    onMore: ((TrackDto) -> Unit)?,
    onMove: (Int, Int) -> Unit,
    onSave: () -> Unit,
    onToggleAutoplay: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var panelTab by remember { mutableIntStateOf(0) } // 0 = file, 1 = similaires
    val boundary = ui.userQueueEnd.coerceIn(0, ui.queue.size)
    val userTracks = ui.queue.take(boundary)
    val autoTracks = if (ui.autoplaySuggestions) ui.queue.drop(boundary) else emptyList()

    var similarTracks by remember { mutableStateOf<List<TrackDto>>(emptyList()) }
    var similarLoading by remember { mutableStateOf(false) }
    val seedId = ui.track?.id

    LaunchedEffect(seedId, panelTab) {
        if (panelTab != 1 || seedId.isNullOrBlank()) return@LaunchedEffect
        similarLoading = true
        // related API = déjà ranked style (évite double similar+related)
        val pool = runCatching {
            val rel = container.api.related(seedId)
            (rel.tracks.orEmpty() + rel.related.orEmpty() + rel.radio.orEmpty())
                .filter { it.isPlayable() && it.id != seedId }
                .distinctBy { it.id }
        }.getOrDefault(emptyList())
        if (ui.track?.id == seedId) {
            similarTracks = pool
            similarLoading = false
        }
    }

    Column(modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            QueuePanelTab(
                label = "File d'attente",
                selected = panelTab == 0,
                onClick = { panelTab = 0 },
                modifier = Modifier.weight(1f),
            )
            QueuePanelTab(
                label = "Similaires",
                selected = panelTab == 1,
                onClick = { panelTab = 1 },
                modifier = Modifier.weight(1f),
            )
        }

        if (panelTab == 0) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "${userTracks.size} titre${if (userTracks.size > 1) "s" else ""}",
                    Modifier
                        .weight(1f)
                        .padding(start = 8.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = PlayerMuted,
                )
                if (ui.queueIndex > 0) {
                    TextButton(onClick = { player.clearPlayedFromQueue() }) {
                        Text("Effacer déjà joués")
                    }
                }
                IconButton(onClick = player::cycleRepeat) {
                    Icon(
                        if (ui.repeat == RepeatMode.One) Icons.Default.RepeatOne else Icons.Default.Repeat,
                        contentDescription = when (ui.repeat) {
                            RepeatMode.Off -> "Boucle désactivée"
                            RepeatMode.All -> "Boucler toute la file"
                            RepeatMode.One -> "Boucler le titre"
                        },
                        tint = if (ui.repeat != RepeatMode.Off) MaterialTheme.colorScheme.primary else PlayerFg,
                    )
                }
                IconButton(onClick = player::toggleShuffle) {
                    Icon(
                        Icons.Default.Shuffle,
                        contentDescription = if (ui.shuffle) "Aléatoire activé" else "Aléatoire",
                        tint = if (ui.shuffle) MaterialTheme.colorScheme.primary else PlayerFg,
                    )
                }
                TextButton(onClick = onSave) {
                    Text("Enregistrer")
                }
            }
            LazyColumn(modifier.fillMaxSize(), state = listState) {
                itemsIndexed(userTracks, key = { i, t -> "u-${t.id}-$i" }) { index, item ->
                    QueueTrackRow(
                        track = item,
                        index = index,
                        highlighted = index == ui.queueIndex,
                        onClick = { onPlayAt(index) },
                        onLongClick = { onMore?.invoke(item) },
                        onMove = onMove,
                        onMore = onMore?.let { { it(item) } },
                    )
                }
                item {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                "À suivre",
                                fontWeight = FontWeight.SemiBold,
                                color = PlayerFg,
                            )
                            Text(
                                "Lecture automatique",
                                style = MaterialTheme.typography.labelSmall,
                                color = PlayerMuted,
                            )
                        }
                        Switch(
                            checked = ui.autoplaySuggestions,
                            onCheckedChange = { onToggleAutoplay() },
                            colors = SwitchDefaults.colors(
                                checkedTrackColor = SeekRed,
                                checkedThumbColor = Color.White,
                            ),
                        )
                    }
                }
                if (!ui.autoplaySuggestions) {
                    item {
                        Text(
                            "Lecture auto désactivée",
                            Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = PlayerMuted,
                        )
                    }
                }
                itemsIndexed(autoTracks, key = { i, t -> "a-${t.id}-${boundary + i}" }) { i, item ->
                    val abs = boundary + i
                    QueueTrackRow(
                        track = item,
                        index = abs,
                        highlighted = abs == ui.queueIndex,
                        onClick = { onPlayAt(abs) },
                        onLongClick = { onMore?.invoke(item) },
                        onMove = onMove,
                        onMore = onMore?.let { { it(item) } },
                    )
                }
                item { Spacer(Modifier.height(48.dp)) }
            }
        } else {
            // Découverte type YTM — se met à jour à chaque titre
            LazyColumn(Modifier.fillMaxSize()) {
                item {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                "Découvrez également",
                                fontWeight = FontWeight.SemiBold,
                                color = PlayerFg,
                            )
                            Text(
                                "Même style · se met à jour avec le titre",
                                style = MaterialTheme.typography.labelSmall,
                                color = PlayerMuted,
                            )
                        }
                        if (similarTracks.isNotEmpty()) {
                            TextButton(
                                onClick = {
                                    similarTracks.take(30).forEach { player.addToQueue(it) }
                                },
                            ) {
                                Text("Tout ajouter")
                            }
                        }
                    }
                }
                when {
                    similarLoading && similarTracks.isEmpty() -> {
                        item {
                            Text(
                                "Chargement des similaires…",
                                Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                                color = PlayerMuted,
                            )
                        }
                    }
                    similarTracks.isEmpty() -> {
                        item {
                            Text(
                                "Aucun titre similaire pour le moment.",
                                Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                                color = PlayerMuted,
                            )
                        }
                    }
                    else -> {
                        itemsIndexed(similarTracks, key = { _, t -> "s-${t.id}" }) { _, item ->
                            QueueTrackRow(
                                track = item,
                                index = -1,
                                highlighted = false,
                                onClick = {
                                    val idx = similarTracks.indexOfFirst { it.id == item.id }
                                        .coerceAtLeast(0)
                                    player.play(
                                        similarTracks,
                                        startIndex = idx,
                                        title = "Similaires",
                                    )
                                },
                                onLongClick = { onMore?.invoke(item) },
                                onMove = { _, _ -> },
                                onMore = onMore?.let { { it(item) } },
                            )
                        }
                    }
                }
                item { Spacer(Modifier.height(48.dp)) }
            }
        }
    }
}

@Composable
private fun QueuePanelTab(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            label.uppercase(),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = if (selected) PlayerFg else PlayerMuted,
            maxLines = 1,
        )
        Spacer(Modifier.height(6.dp))
        Box(
            Modifier
                .fillMaxWidth(0.55f)
                .height(2.dp)
                .background(if (selected) Color.White else Color.Transparent),
        )
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
    onMore: (() -> Unit)? = null,
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
            .padding(horizontal = 4.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Poignée drag (style YTM) — scroll de la liste reste libre ailleurs
        Icon(
            Icons.Default.DragHandle,
            contentDescription = "Déplacer",
            tint = PlayerMuted,
            modifier = Modifier
                .size(40.dp)
                .padding(6.dp)
                .pointerInput(index) {
                    detectDragGestures(
                        onDragEnd = { dragAccum = 0f },
                        onDragCancel = { dragAccum = 0f },
                        onDrag = { change, amount ->
                            change.consume()
                            dragAccum += amount.y
                            val threshold = 40.dp.toPx()
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
        MediaCover(track, 48.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
                Text(
                    track.title,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                    color = if (highlighted) MaterialTheme.colorScheme.primary else PlayerFg,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .basicMarquee(iterations = Int.MAX_VALUE, initialDelayMillis = 900),
                )
                Row {
                    Text(
                        track.artistLine(),
                        maxLines = 1,
                        overflow = TextOverflow.Clip,
                        style = MaterialTheme.typography.bodySmall,
                        color = PlayerMuted,
                        modifier = Modifier
                            .weight(1f, fill = false)
                            .basicMarquee(iterations = Int.MAX_VALUE, initialDelayMillis = 1200),
                    )
                    track.duration?.takeIf { it.isNotBlank() }?.let {
                        Text(" · $it", style = MaterialTheme.typography.bodySmall, color = PlayerMuted)
                    }
                }
        }
        if (onMore != null) {
            IconButton(onClick = onMore) {
                Icon(
                    Icons.Default.MoreVert,
                    contentDescription = "Options",
                    tint = PlayerMuted,
                )
            }
        }
    }
}

@Composable
private fun InlineSyncedLyrics(
    container: AppContainer,
    track: TrackDto,
    positionMs: Long,
    onSeek: (Long) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var text by remember(track.id) { mutableStateOf<String?>(null) }
    var timed by remember(track.id) { mutableStateOf<List<TimedLyricLine>>(emptyList()) }
    var loading by remember(track.id) { mutableStateOf(true) }

    LaunchedEffect(track.id) {
        loading = true
        runCatching { container.api.lyrics(track.id) }
            .onSuccess {
                text = it.lyrics
                val apiTimed = it.timed.orEmpty()
                timed = if (apiTimed.isNotEmpty()) apiTimed else parseLrcLines(it.lyrics)
            }
            .onFailure {
                text = null
                timed = emptyList()
            }
        loading = false
    }

    // Lead ~280 ms : ligne allumée juste avant le chant
    val leadMs = 280L
    val active = if (timed.isEmpty()) -1
    else timed.indexOfLast { it.startMs <= positionMs + leadMs }.coerceAtLeast(0)
    val listState = rememberLazyListState()
    LaunchedEffect(active) {
        if (active < 0) return@LaunchedEffect
        runCatching {
            listState.animateScrollToItem(
                index = active.coerceIn(0, timed.lastIndex),
                scrollOffset = -120,
            )
        }
    }

    Column(modifier = modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Paroles",
                style = MaterialTheme.typography.labelLarge,
                color = PlayerMuted,
            )
            Text(
                "Fermer",
                color = PlayerFg,
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(onClick = onClose)
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }
        when {
            loading -> Text(
                "Chargement…",
                color = PlayerMuted,
                modifier = Modifier.padding(top = 24.dp),
            )
            timed.isNotEmpty() -> {
                LazyColumn(
                    state = listState,
                    contentPadding = PaddingValues(vertical = 24.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    itemsIndexed(timed) { i, line ->
                        val isActive = i == active
                        val past = i < active
                        Text(
                            line.text.ifBlank { " " },
                            style = if (isActive) {
                                MaterialTheme.typography.headlineSmall
                            } else {
                                MaterialTheme.typography.titleMedium
                            },
                            fontWeight = if (isActive) FontWeight.Bold else FontWeight.Normal,
                            color = when {
                                isActive -> PlayerFg
                                past -> PlayerMuted.copy(alpha = 0.28f)
                                else -> PlayerMuted.copy(alpha = 0.72f)
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onSeek(line.startMs.coerceAtLeast(0L)) }
                                .padding(vertical = if (isActive) 12.dp else 7.dp)
                                .graphicsLayer {
                                    scaleX = if (isActive) 1.03f else 1f
                                    scaleY = if (isActive) 1.03f else 1f
                                },
                        )
                    }
                }
            }
            !text.isNullOrBlank() -> {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    item {
                        Text(
                            text!!,
                            color = PlayerFg,
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.padding(vertical = 16.dp),
                        )
                    }
                }
            }
            else -> Text(
                "Paroles indisponibles pour ce titre.",
                color = PlayerMuted,
                modifier = Modifier.padding(top = 24.dp),
            )
        }
    }
}

/** Parse LRC `[mm:ss.xx] texte` si l’API ne renvoie que du texte. */
private fun parseLrcLines(raw: String?): List<TimedLyricLine> {
    if (raw.isNullOrBlank()) return emptyList()
    val re = Regex("""^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?]\s*(.*)$""")
    val out = ArrayList<TimedLyricLine>()
    for (row in raw.split('\n', '\r')) {
        val m = re.matchEntire(row.trim()) ?: continue
        val min = m.groupValues[1].toIntOrNull() ?: continue
        val sec = m.groupValues[2].toIntOrNull() ?: continue
        val fracRaw = m.groupValues[3]
        val fracMs = when {
            fracRaw.isBlank() -> 0
            fracRaw.length <= 2 -> (fracRaw.padEnd(2, '0').toIntOrNull() ?: 0) * 10
            else -> fracRaw.padEnd(3, '0').take(3).toIntOrNull() ?: 0
        }
        val text = m.groupValues[4].trim()
        if (text.isEmpty()) continue
        out += TimedLyricLine(startMs = (min * 60 + sec) * 1000L + fracMs, text = text)
    }
    return out
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
