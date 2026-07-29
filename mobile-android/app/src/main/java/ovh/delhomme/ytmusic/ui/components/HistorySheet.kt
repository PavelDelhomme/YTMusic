package ovh.delhomme.ytmusic.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.TrackDto

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistorySheet(
    container: AppContainer,
    onDismiss: () -> Unit,
    onPlay: (List<TrackDto>, Int) -> Unit,
    onMore: (TrackDto) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var loading by remember { mutableStateOf(true) }
    var history by remember { mutableStateOf<List<TrackDto>>(emptyList()) }

    LaunchedEffect(Unit) {
        loading = true
        history = runCatching {
            container.ensureFreshToken()
            container.api.library().history
        }.getOrDefault(emptyList())
        loading = false
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Text(
            "Historique",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
        )
        when {
            loading -> {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(40.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) { CircularProgressIndicator() }
            }
            history.isEmpty() -> {
                Text(
                    "Aucune écoute récente",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(24.dp),
                )
            }
            else -> {
                LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
                    items(history.take(60), key = { "hist-${it.id}-${it.title}" }) { track ->
                        TrackRow(
                            track = track,
                            onClick = {
                                val list = history.filter { it.isPlayable() }
                                val idx = list.indexOfFirst { it.id == track.id }.coerceAtLeast(0)
                                onPlay(list.ifEmpty { listOf(track) }, idx)
                                onDismiss()
                            },
                            onMore = { onMore(track) },
                        )
                    }
                }
            }
        }
    }
}
