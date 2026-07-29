package ovh.delhomme.ytmusic.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val YtRed = Color(0xFFFF0033)
private val YtBg = Color(0xFF0A0A0A)
private val YtSurface = Color(0xFF1A1A1A)
private val YtElevated = Color(0xFF282828)
private val YtMuted = Color(0xFFD0D0D0)
private val YtFg = Color(0xFFF5F5F5)

private val scheme = darkColorScheme(
    primary = YtRed,
    onPrimary = Color.White,
    background = YtBg,
    onBackground = YtFg,
    surface = YtSurface,
    onSurface = YtFg,
    surfaceVariant = YtElevated,
    onSurfaceVariant = YtMuted,
    secondary = YtElevated,
    onSecondary = YtFg,
    error = Color(0xFFFF6B6B),
    outline = Color(0xFF3E3E3E),
)

@Composable
fun YtMusicTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, content = content)
}
