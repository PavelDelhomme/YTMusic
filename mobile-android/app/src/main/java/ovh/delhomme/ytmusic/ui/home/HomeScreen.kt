package ovh.delhomme.ytmusic.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.TrackDto
import ovh.delhomme.ytmusic.ui.components.TrackRow

@Composable
fun HomeScreen(
    container: AppContainer,
    onPlay: (List<TrackDto>, Int) -> Unit,
    vm: HomeViewModel = viewModel(factory = HomeViewModel.factory(container)),
) {
    val state by vm.state.collectAsState()

    when {
        state.loading && state.shelves.isEmpty() -> {
            Column(
                Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                CircularProgressIndicator()
            }
        }
        state.error != null && state.shelves.isEmpty() -> {
            Column(
                Modifier.fillMaxSize().padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(state.error!!, color = MaterialTheme.colorScheme.error)
                TextButton(onClick = vm::refresh) { Text("Réessayer") }
            }
        }
        else -> {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 96.dp),
            ) {
                item {
                    Text(
                        "Accueil",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(16.dp),
                    )
                }
                items(state.shelves, key = { it.title }) { shelf ->
                    Text(
                        shelf.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                    if (shelf.items.size > 4 && shelf.items.take(6).all { it.isPlayable() }) {
                        Row(
                            Modifier
                                .horizontalScroll(rememberScrollState())
                                .padding(horizontal = 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            shelf.items.filter { it.isPlayable() }.take(12).forEach { track ->
                                Column(
                                    Modifier
                                        .width(128.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .clickable {
                                            val (list, idx) = vm.playableFrom(track, shelf)
                                            onPlay(list, idx)
                                        }
                                        .padding(4.dp),
                                ) {
                                    AsyncImage(
                                        model = track.coverUrl(300),
                                        contentDescription = track.title,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier
                                            .size(120.dp)
                                            .clip(RoundedCornerShape(8.dp)),
                                    )
                                    Spacer(Modifier.height(6.dp))
                                    Text(track.title, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                    } else {
                        shelf.items.filter { it.isPlayable() }.take(8).forEach { track ->
                            TrackRow(track = track, onClick = {
                                val (list, idx) = vm.playableFrom(track, shelf)
                                onPlay(list, idx)
                            })
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }
            }
        }
    }
}
