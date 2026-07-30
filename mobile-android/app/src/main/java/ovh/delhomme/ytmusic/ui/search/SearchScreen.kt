package ovh.delhomme.ytmusic.ui.search

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
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

data class SearchSection(val title: String, val items: List<TrackDto>)

data class SearchUiState(
    val query: String = "",
    val filter: String = "all",
    val loading: Boolean = false,
    val error: String? = null,
    val sections: List<SearchSection> = emptyList(),
)

private val FILTERS = listOf(
    "all" to "Tout",
    "song" to "Titres",
    "artist" to "Artistes",
    "album" to "Albums",
    "playlist" to "Playlists",
    "video" to "Vidéos",
)

class SearchViewModel(private val container: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state.asStateFlow()
    private var job: Job? = null

    fun onQuery(q: String) {
        _state.value = _state.value.copy(query = q, error = null)
        scheduleSearch()
    }

    fun onFilter(filter: String) {
        if (_state.value.filter == filter) return
        _state.value = _state.value.copy(filter = filter)
        scheduleSearch()
    }

    private fun scheduleSearch() {
        job?.cancel()
        val q = _state.value.query
        if (q.trim().length < 2) {
            _state.value = _state.value.copy(sections = emptyList(), loading = false)
            return
        }
        val filter = _state.value.filter
        job = viewModelScope.launch {
            delay(280)
            val currentQ = _state.value.query.trim()
            val currentFilter = _state.value.filter
            if (currentQ.length < 2) return@launch
            _state.value = _state.value.copy(loading = true, error = null, sections = emptyList())
            try {
                container.ensureFreshToken()
                // Live typing : ne pas polluer l’historique (préfixes Keny / Keny Ar…)
                val res = container.api.search(currentQ, currentFilter, noHistory = "1")
                // Ignore si l’utilisateur a déjà changé la requête
                if (_state.value.query.trim() != currentQ || _state.value.filter != currentFilter) {
                    return@launch
                }
                val sections = buildList {
                    res.topResult?.let {
                        add(SearchSection("Meilleur résultat", listOf(it)))
                    }
                    val topId = res.topResult?.id
                    val songs = res.songs.filter { it.id != topId }
                    val artists = res.artists.filter { it.id != topId }
                    val albums = res.albums.filter { it.id != topId }
                    if (songs.isNotEmpty()) add(SearchSection("Titres", songs.take(20)))
                    if (artists.isNotEmpty()) add(SearchSection("Artistes", artists.take(12)))
                    if (albums.isNotEmpty()) add(SearchSection("Albums", albums.take(12)))
                    if (res.playlists.isNotEmpty()) {
                        add(SearchSection("Playlists", res.playlists.filter { it.id != topId }.take(12)))
                    }
                    if (res.videos.isNotEmpty()) {
                        add(SearchSection("Vidéos", res.videos.filter { it.id != topId }.take(12)))
                    }
                }
                _state.value = _state.value.copy(loading = false, sections = sections, error = null)
            } catch (e: Exception) {
                if (_state.value.query.trim() != currentQ) return@launch
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
    onMore: (TrackDto) -> Unit,
    onOpenDetail: (TrackDto) -> Unit,
    onOpenArtist: ((String?, String) -> Unit)? = null,
    vm: SearchViewModel = viewModel(factory = SearchViewModel.factory(container)),
) {
    val state by vm.state.collectAsState()
    val scope = rememberCoroutineScope()

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
            placeholder = { Text("Titres, artistes, albums…") },
            leadingIcon = { Icon(Icons.Default.Search, null) },
            shape = RoundedCornerShape(12.dp),
        )
        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FILTERS.forEach { (id, label) ->
                FilterChip(
                    selected = state.filter == id,
                    onClick = { vm.onFilter(id) },
                    label = { Text(label) },
                )
            }
        }
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
            state.query.length < 2 -> {
                Text(
                    "Cherche un titre ou un artiste — ex. « Poto Demi Portion ».",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(24.dp),
                )
            }
            !state.loading && state.sections.isEmpty() -> {
                Text(
                    "Aucun résultat pour « ${state.query} ». Essaie un autre filtre.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(24.dp),
                )
            }
            else -> {
                LazyColumn(contentPadding = PaddingValues(bottom = 24.dp, top = 4.dp)) {
                    state.sections.forEach { section ->
                        item {
                            Text(
                                section.title,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                            )
                        }
                        items(section.items, key = { "${section.title}-${it.id}" }) { track ->
                            TrackRow(
                                track = track,
                                highlighted = section.title == "Meilleur résultat",
                                onClick = {
                                    val q = state.query.trim()
                                    if (q.length >= 2) {
                                        scope.launch {
                                            runCatching {
                                                container.api.recordSearchClick(
                                                    mapOf(
                                                        "query" to q,
                                                        "clickedId" to track.id,
                                                        "clickedKind" to (track.type ?: "song"),
                                                    ),
                                                )
                                            }
                                        }
                                    }
                                    if (track.isPlaylist() || track.isAlbum() || track.isArtist()) {
                                        onOpenDetail(track)
                                        return@TrackRow
                                    }
                                    scope.launch {
                                        if (track.isPlayable()) {
                                            val playable = section.items.filter { it.isPlayable() }
                                            val idx = playable.indexOfFirst { it.id == track.id }
                                                .coerceAtLeast(0)
                                            onPlay(playable.ifEmpty { listOf(track) }, idx)
                                        } else {
                                            onOpenDetail(track)
                                        }
                                    }
                                },
                                onMore = { onMore(track) },
                                onOpenArtist = onOpenArtist,
                            )
                        }
                    }
                }
            }
        }
    }
}
