package ovh.delhomme.ytmusic.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

data class NowPlayingInfo(
    val trackId: String? = null,
    val playing: Boolean = false,
    val albumId: String? = null,
    val sourceId: String? = null,
    val sourceKind: String? = null,
    val queueTitle: String = "",
)

val LocalNowPlaying = compositionLocalOf { NowPlayingInfo() }

/** Barres equalizer animées (style Google Music / YTM). */
@Composable
fun PlayingBars(
    modifier: Modifier = Modifier,
    color: Color = Color(0xFFFF0033),
    barWidth: Dp = 3.dp,
    barHeight: Dp = 18.dp,
) {
    val transition = rememberInfiniteTransition(label = "playing-bars")
    val scales = listOf(0f, 0.15f, 0.3f, 0.1f).mapIndexed { i, delayFrac ->
        val anim by transition.animateFloat(
            initialValue = 0.35f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(
                    durationMillis = 850,
                    delayMillis = (delayFrac * 850).toInt(),
                    easing = LinearEasing,
                ),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "bar-$i",
        )
        anim
    }
    Row(
        modifier = modifier.height(barHeight),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        scales.forEach { scale ->
            Box(
                Modifier
                    .width(barWidth)
                    .height(barHeight)
                    .graphicsLayer { scaleY = scale }
                    .background(color, RoundedCornerShape(1.dp)),
            )
        }
    }
}

@Composable
fun PlayingCoverOverlay(
    active: Boolean,
    playing: Boolean,
    modifier: Modifier = Modifier,
    barHeight: Dp = 18.dp,
) {
    if (!active) return
    Box(
        modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.45f)),
        contentAlignment = Alignment.Center,
    ) {
        if (playing) {
            PlayingBars(barHeight = barHeight)
        } else {
            Box(
                Modifier
                    .width(8.dp)
                    .height(8.dp)
                    .background(Color(0xFFFF0033), RoundedCornerShape(50)),
            )
        }
    }
}

fun NowPlayingInfo.matchesTrack(trackId: String): Boolean =
    this.trackId != null && this.trackId == trackId

fun NowPlayingInfo.matchesAlbum(albumId: String?): Boolean {
    if (albumId.isNullOrBlank()) return false
    return this.albumId == albumId || (sourceKind == "album" && sourceId == albumId)
}

fun NowPlayingInfo.matchesSource(id: String?, kind: String? = null): Boolean {
    if (id.isNullOrBlank() || sourceId.isNullOrBlank()) return false
    if (sourceId != id) return false
    if (kind != null && sourceKind != null && sourceKind != kind) return false
    return true
}
