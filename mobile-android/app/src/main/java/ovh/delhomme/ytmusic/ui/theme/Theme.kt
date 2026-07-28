package ovh.delhomme.ytmusic.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val YtRed = Color(0xFFFF0033)
private val YtBg = Color(0xFF030303)
private val YtSurface = Color(0xFF121212)
private val YtElevated = Color(0xFF1D1D1D)

private val scheme = darkColorScheme(
    primary = YtRed,
    onPrimary = Color.White,
    background = YtBg,
    onBackground = Color.White,
    surface = YtSurface,
    onSurface = Color.White,
    surfaceVariant = YtElevated,
    onSurfaceVariant = Color(0xFFAAAAAA),
    error = Color(0xFFFF6B6B),
)

@Composable
fun YtMusicTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, content = content)
}
