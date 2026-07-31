package ovh.delhomme.ytmusic.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.SubcomposeAsyncImage
import ovh.delhomme.ytmusic.data.TrackDto

@Composable
fun MediaCover(
    track: TrackDto,
    size: Dp,
    modifier: Modifier = Modifier,
    circle: Boolean = false,
) {
    val shape = when {
        circle || track.isArtist() -> CircleShape
        else -> RoundedCornerShape(8.dp)
    }
    val placeholderIcon = when {
        track.isArtist() -> Icons.Default.Person
        track.isPlaylist() -> Icons.Default.QueueMusic
        track.isAlbum() -> Icons.Default.Album
        else -> Icons.Default.MusicNote
    }
    Box(
        modifier = modifier
            .size(size)
            .clip(shape)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        SubcomposeAsyncImage(
            model = track.coverUrl(size.value.toInt().coerceAtLeast(120)),
            contentDescription = track.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
            loading = {
                Icon(
                    placeholderIcon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f),
                )
            },
            error = {
                Icon(
                    placeholderIcon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f),
                )
            },
        )
    }
}

/** Mosaïque 2×2 des 4 premières covers — carte mix style album. */
@Composable
fun MixCollageCover(
    tracks: List<TrackDto>,
    size: Dp,
    modifier: Modifier = Modifier,
    titleFallback: String = "M",
) {
    val covers = tracks.take(4).toMutableList()
    if (covers.isNotEmpty()) {
        while (covers.size < 4) covers.add(covers[covers.size % tracks.size.coerceAtLeast(1)])
    }
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        if (covers.isEmpty()) {
            Text(
                titleFallback.trim().take(1).uppercase().ifBlank { "M" },
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f),
            )
        } else {
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.weight(1f).fillMaxWidth()) {
                    covers.take(2).forEach { t ->
                        Box(Modifier.weight(1f).fillMaxSize()) {
                            SubcomposeAsyncImage(
                                model = t.coverUrl(200),
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize(),
                                error = {
                                    Box(
                                        Modifier
                                            .fillMaxSize()
                                            .background(MaterialTheme.colorScheme.surface),
                                    )
                                },
                            )
                        }
                    }
                }
                Row(Modifier.weight(1f).fillMaxWidth()) {
                    covers.drop(2).take(2).forEach { t ->
                        Box(Modifier.weight(1f).fillMaxSize()) {
                            SubcomposeAsyncImage(
                                model = t.coverUrl(200),
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize(),
                                error = {
                                    Box(
                                        Modifier
                                            .fillMaxSize()
                                            .background(MaterialTheme.colorScheme.surface),
                                    )
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}
