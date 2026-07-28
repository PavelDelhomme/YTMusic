package ovh.delhomme.ytmusic.ui.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.TrackDto
import ovh.delhomme.ytmusic.ui.components.TrackRow

data class SearchUiState(
    val query: String = "",
    val loading: Boolean = false,
    val error: String? = null,
    val songs: List<TrackDto> = emptyList(),
)

class SearchViewModel(private val container: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state.asStateFlow()
    private var job: Job? = null

    fun onQuery(q: String) {
        _state.value = _state.value.copy(query = q, error = null)
        job?.cancel()
        if (q.trim().length < 2) {
            _state.value = _state.value.copy(songs = emptyList(), loading = false)
            return
        }
        job = viewModelScope.launch {
            delay(320)
            _state.value = _state.value.copy(loading = true)
            try {
                container.ensureFreshToken()
                val res = container.api.search(q.trim())
                val songs = buildList {
                    res.topResult?.takeIf { it.isPlayable() }?.let { add(it) }
                    addAll(res.songs.filter { it.isPlayable() })
                    addAll(res.videos.filter { it.isPlayable() })
                }.distinctBy { it.id }
                _state.value = _state.value.copy(loading = false, songs = songs)
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message)
            }
        }
    }

    companion object {
        fun factory(c: AppContainer) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = SearchViewModel(c) as T
        }
    }
}

@Composable
fun SearchScreen(
    container: AppContainer,
    onPlay: (List<TrackDto>, Int) -> Unit,
    vm: SearchViewModel = viewModel(factory = SearchViewModel.factory(container)),
) {
    val state by vm.state.collectAsState()

    Column(Modifier.fillMaxSize()) {
        Text(
            "Recherche",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(16.dp),
        )
        OutlinedTextField(
            value = state.query,
            onValueChange = vm::onQuery,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            singleLine = true,
            placeholder = { Text("Titres, artistes…") },
            leadingIcon = { Icon(Icons.Default.Search, null) },
        )
        when {
            state.loading -> {
                Column(
                    Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) { CircularProgressIndicator() }
            }
            state.error != null -> {
                Text(
                    state.error!!,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(16.dp),
                )
            }
            else -> {
                LazyColumn(
                    contentPadding = PaddingValues(bottom = 96.dp, top = 8.dp),
                ) {
                    items(state.songs, key = { it.id }) { track ->
                        TrackRow(
                            track = track,
                            onClick = {
                                val idx = state.songs.indexOf(track).coerceAtLeast(0)
                                onPlay(state.songs, idx)
                            },
                        )
                    }
                }
            }
        }
    }
}
