package ovh.delhomme.ytmusic.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import ovh.delhomme.ytmusic.player.PlayerController
import ovh.delhomme.ytmusic.player.PlayerUiState
import kotlin.math.roundToInt

@Composable
fun NowPlayingScreen(
    player: PlayerController,
    ui: PlayerUiState,
    onClose: () -> Unit,
) {
    var scrub by remember(ui.track?.id) { mutableFloatStateOf(-1f) }
    var dragY by remember { mutableFloatStateOf(0f) }
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
            .pointerInput(Unit) {
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
                Text("Rien en lecture", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            val duration = ui.durationMs.coerceAtLeast(1L).toFloat()
            val progress = if (scrub >= 0f) scrub else (ui.positionMs / duration).coerceIn(0f, 1f)

            Column(
                Modifier
                    .fillMaxSize()
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        Modifier
                            .width(40.dp)
                            .height(4.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f)),
                    )
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onClose) {
                        Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Replier")
                    }
                    Text(
                        "En cours de lecture",
                        modifier = Modifier.weight(1f),
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Spacer(Modifier.size(48.dp))
                }
                Spacer(Modifier.height(16.dp))
                AsyncImage(
                    model = track.coverUrl(800),
                    contentDescription = track.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(300.dp)
                        .clip(RoundedCornerShape(12.dp)),
                )
                Spacer(Modifier.height(24.dp))
                Text(
                    track.title,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                )
                Text(
                    track.artistLine(),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(20.dp))
                Slider(
                    value = progress,
                    onValueChange = { scrub = it },
                    onValueChangeFinished = {
                        player.seek((scrub * duration).toLong())
                        scrub = -1f
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(formatMs(ui.positionMs), style = MaterialTheme.typography.labelSmall)
                    Text(formatMs(ui.durationMs), style = MaterialTheme.typography.labelSmall)
                }
                Spacer(Modifier.height(16.dp))
                Row(
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    IconButton(onClick = player::skipPrev) {
                        Icon(Icons.Default.SkipPrevious, null, modifier = Modifier.size(40.dp))
                    }
                    IconButton(onClick = player::toggle) {
                        Icon(
                            if (ui.playing) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = null,
                            modifier = Modifier.size(56.dp),
                        )
                    }
                    IconButton(onClick = player::skipNext) {
                        Icon(Icons.Default.SkipNext, null, modifier = Modifier.size(40.dp))
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "Glisse vers le bas ou ← retour pour replier",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
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
