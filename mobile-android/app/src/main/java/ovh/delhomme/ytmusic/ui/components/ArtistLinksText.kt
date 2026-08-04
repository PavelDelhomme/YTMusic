package ovh.delhomme.ytmusic.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import ovh.delhomme.ytmusic.data.ArtistRef
import ovh.delhomme.ytmusic.data.TrackDto

/**
 * Noms d’artistes cliquables → page artiste (style YouTube Music).
 * [onOpenArtist] reçoit (id nullable, name) — le parent résout l’id si besoin.
 */
@Composable
fun ArtistLinksText(
    track: TrackDto,
    onOpenArtist: (id: String?, name: String) -> Unit,
    modifier: Modifier = Modifier,
    color: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    style: TextStyle = MaterialTheme.typography.bodySmall,
    maxLines: Int = 1,
    emptyLabel: String = "Artiste",
) {
    ArtistLinksText(
        artists = track.artists,
        onOpenArtist = onOpenArtist,
        modifier = modifier,
        color = color,
        style = style,
        maxLines = maxLines,
        emptyLabel = emptyLabel,
    )
}

@Composable
fun ArtistLinksText(
    artists: List<ArtistRef>?,
    onOpenArtist: (id: String?, name: String) -> Unit,
    modifier: Modifier = Modifier,
    color: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    style: TextStyle = MaterialTheme.typography.bodySmall,
    maxLines: Int = 1,
    emptyLabel: String = "Artiste",
) {
    val cleaned = artists.orEmpty()
        .mapNotNull { a ->
            val name = a.name.trim().takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            if (
                name.equals("Inconnu", true) ||
                name.equals("Unknown", true) ||
                name.equals("n/a", true)
            ) {
                return@mapNotNull null
            }
            a.copy(name = name)
        }
    if (cleaned.isEmpty()) {
        Text(
            emptyLabel,
            modifier = modifier,
            color = color,
            style = style,
            maxLines = maxLines,
            overflow = TextOverflow.Ellipsis,
        )
        return
    }
    val label = cleaned.joinToString(", ") { it.name }
    Text(
        text = label,
        modifier = modifier.clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = ripple(bounded = false),
            onClick = {
                val preferred = cleaned.firstOrNull { !it.id.isNullOrBlank() } ?: cleaned.first()
                onOpenArtist(preferred.id, preferred.name)
            },
        ),
        color = color,
        style = style,
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
    )
}
