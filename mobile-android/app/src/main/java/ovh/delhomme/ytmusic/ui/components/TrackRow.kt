package ovh.delhomme.ytmusic.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import ovh.delhomme.ytmusic.data.TrackDto
import kotlin.math.roundToInt

private val SeekRed = Color(0xFFFF0033)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TrackRow(
    track: TrackDto,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    onMore: (() -> Unit)? = null,
    onOpenArtist: ((id: String?, name: String) -> Unit)? = null,
    subtitle: String? = null,
    trailing: String? = null,
    indexLabel: String? = null,
    highlighted: Boolean = false,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(
                if (highlighted) MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
                else Color.Transparent,
            )
            .combinedClickable(
                onClick = onClick,
                onLongClick = { onMore?.invoke() },
            )
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (indexLabel != null) {
            Text(
                indexLabel,
                modifier = Modifier.width(28.dp),
                style = MaterialTheme.typography.labelMedium,
                color = if (highlighted) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        MediaCover(track, 52.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                track.title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                color = if (highlighted) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurface,
            )
            when {
                subtitle != null -> Text(
                    subtitle,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                track.isPlaylist() -> Text(
                    "Playlist · ${track.artistLine()}",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                track.isAlbum() -> Text(
                    "Album · ${track.artistLine()}",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                track.isArtist() -> Text(
                    "Artiste",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                onOpenArtist != null -> ArtistLinksText(
                    track = track,
                    onOpenArtist = onOpenArtist,
                )
                else -> Text(
                    track.artistLine(),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        val durationLabel = trailing ?: track.duration?.takeIf { it.isNotBlank() }
        if (durationLabel != null) {
            Text(
                durationLabel,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(end = 4.dp),
            )
        }
        if (onMore != null) {
            IconButton(onClick = onMore) {
                Icon(
                    Icons.Default.MoreVert,
                    contentDescription = "Plus d'options",
                    tint = Color(0xFFF5F5F5),
                )
            }
        }
    }
}

/** Mini-lecteur style YT / Google Music — seek, prev, play, next. */
@Composable
fun MiniPlayerBar(
    track: TrackDto,
    playing: Boolean,
    progress: Float,
    onToggle: () -> Unit,
    onCast: () -> Unit,
    onOpen: () -> Unit,
    onSeek: ((Float) -> Unit)? = null,
    onPrev: (() -> Unit)? = null,
    onNext: (() -> Unit)? = null,
    onOpenArtist: ((id: String?, name: String) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    var scrub by remember(track.id) { mutableFloatStateOf(-1f) }
    val shown = if (scrub >= 0f) scrub else progress.coerceIn(0f, 1f)
    var barWidthPx by remember { mutableFloatStateOf(1f) }
    val thumbPx = with(LocalDensity.current) { 14.dp.toPx() }

    fun seekFromX(x: Float) {
        if (onSeek == null || barWidthPx <= 0f) return
        val ratio = (x / barWidthPx).coerceIn(0f, 1f)
        scrub = ratio
        onSeek(ratio)
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(16.dp)
                .onSizeChanged { barWidthPx = it.width.toFloat().coerceAtLeast(1f) }
                .pointerInput(track.id, onSeek) {
                    detectTapGestures { offset ->
                        seekFromX(offset.x)
                        scrub = -1f
                    }
                }
                .pointerInput(track.id, onSeek) {
                    detectHorizontalDragGestures(
                        onDragStart = { offset -> seekFromX(offset.x) },
                        onDragEnd = { scrub = -1f },
                        onDragCancel = { scrub = -1f },
                        onHorizontalDrag = { change, _ ->
                            change.consume()
                            seekFromX(change.position.x)
                        },
                    )
                },
            contentAlignment = Alignment.CenterStart,
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(3.dp)
                    .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.18f)),
            )
            Box(
                Modifier
                    .fillMaxWidth(shown)
                    .height(3.dp)
                    .background(SeekRed),
            )
            Box(
                Modifier
                    .offset {
                        IntOffset(
                            x = ((shown * barWidthPx) - thumbPx / 2f).roundToInt()
                                .coerceIn(0, (barWidthPx - thumbPx).roundToInt().coerceAtLeast(0)),
                            y = 0,
                        )
                    }
                    .size(14.dp)
                    .align(Alignment.CenterStart)
                    .clip(CircleShape)
                    .background(SeekRed),
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(64.dp)
                .clickable(onClick = onOpen)
                .pointerInput(Unit) {
                    var total = 0f
                    detectVerticalDragGestures(
                        onVerticalDrag = { _, amount ->
                            total += amount
                        },
                        onDragEnd = {
                            // Swipe vers le haut → ouvrir le lecteur plein écran
                            if (total < -48f) onOpen()
                            total = 0f
                        },
                        onDragCancel = { total = 0f },
                    )
                }
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            MediaCover(track, 48.dp, modifier = Modifier.clip(RoundedCornerShape(6.dp)))
            Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                Text(
                    track.title,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFFF5F5F5),
                )
                if (onOpenArtist != null) {
                    ArtistLinksText(
                        track = track,
                        onOpenArtist = onOpenArtist,
                        color = Color(0xFFCFCFCF),
                        style = MaterialTheme.typography.bodySmall,
                    )
                } else {
                    Text(
                        track.artistLine(),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFFCFCFCF),
                    )
                }
            }
            IconButton(onClick = onCast) {
                Icon(
                    Icons.Default.Cast,
                    contentDescription = "Caster",
                    tint = Color(0xFFF5F5F5),
                )
            }
            if (onPrev != null) {
                IconButton(onClick = onPrev) {
                    Icon(
                        Icons.Default.SkipPrevious,
                        contentDescription = "Précédent",
                        tint = Color(0xFFF5F5F5),
                        modifier = Modifier.size(26.dp),
                    )
                }
            }
            IconButton(onClick = onToggle) {
                Icon(
                    if (playing) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = if (playing) "Pause" else "Lecture",
                    tint = Color(0xFFF5F5F5),
                    modifier = Modifier.size(28.dp),
                )
            }
            if (onNext != null) {
                IconButton(onClick = onNext) {
                    Icon(
                        Icons.Default.SkipNext,
                        contentDescription = "Suivant",
                        tint = Color(0xFFF5F5F5),
                        modifier = Modifier.size(26.dp),
                    )
                }
            }
        }
    }
}
