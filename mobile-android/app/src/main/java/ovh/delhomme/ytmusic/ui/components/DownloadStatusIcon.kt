package ovh.delhomme.ytmusic.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Download
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import ovh.delhomme.ytmusic.data.OfflineJobDto
import ovh.delhomme.ytmusic.data.YtMusicApi

/** Icône téléchargement : idle / progress % / terminé (coche). */
@Composable
fun DownloadStatusIcon(
    downloaded: Boolean,
    progress: Float?,
    modifier: Modifier = Modifier,
    size: Dp = 26.dp,
    tint: Color = MaterialTheme.colorScheme.onSurface,
    accent: Color = MaterialTheme.colorScheme.primary,
) {
    when {
        downloaded && progress == null -> {
            Icon(
                Icons.Default.CheckCircle,
                contentDescription = "Téléchargé",
                tint = accent,
                modifier = modifier.size(size),
            )
        }
        progress != null -> {
            Box(modifier.size(size), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(
                    progress = { progress.coerceIn(0.02f, 1f) },
                    modifier = Modifier.size(size),
                    color = accent,
                    trackColor = tint.copy(alpha = 0.2f),
                    strokeWidth = 2.5.dp,
                    strokeCap = StrokeCap.Round,
                )
            }
        }
        else -> {
            Icon(
                Icons.Default.Download,
                contentDescription = "Télécharger",
                tint = tint,
                modifier = modifier.size(size),
            )
        }
    }
}

/** Lance un job offline (album/playlist…) et poll jusqu’à la fin. Retourne le % courant via onProgress. */
suspend fun pollOfflineJob(
    api: YtMusicApi,
    jobId: String,
    onProgress: (Float) -> Unit,
): Boolean {
    repeat(180) {
        val jobs = runCatching { api.offlineStatus().jobs }.getOrDefault(emptyList())
        val job = jobs.find { it.id == jobId } ?: return false
        onProgress(job.pct().coerceAtLeast(0.02f))
        if (job.done()) {
            onProgress(1f)
            return true
        }
        delay(700)
    }
    return false
}

fun OfflineJobDto.label(): String {
    val p = (pct() * 100).toInt()
    return if (done()) "Téléchargé" else "Téléchargement $p %"
}
