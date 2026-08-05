package ovh.delhomme.ytmusic.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.RadioCategoryDto
import ovh.delhomme.ytmusic.data.ShelfDto
import ovh.delhomme.ytmusic.data.TrackDto

data class HomeUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val loadingMore: Boolean = false,
    val error: String? = null,
    val shelves: List<ShelfDto> = emptyList(),
    val radios: List<RadioCategoryDto> = emptyList(),
    /** Previews 4 covers pour mosaïque « Mixés pour toi ». */
    val radioPreviews: Map<String, List<TrackDto>> = emptyMap(),
    val savedMixIds: Set<String> = emptySet(),
    val needsOnboarding: Boolean = false,
    val radioLoadingId: String? = null,
    val seeds: List<String> = emptyList(),
    val hasMore: Boolean = false,
    val page: Int = 0,
)

class HomeViewModel(private val container: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    init {
        // Cache-first : contenu immédiat au cold start, refresh réseau derrière
        container.homeCache.read()?.let { cached ->
            _state.value = HomeUiState(
                loading = false,
                shelves = cached.shelves,
                radios = cached.radios,
                seeds = cached.seeds,
                hasMore = cached.hasMore,
            )
        }
        refresh()
    }

    fun refresh(fromUser: Boolean = false) {
        viewModelScope.launch {
            val hadContent = _state.value.shelves.isNotEmpty()
            _state.value = _state.value.copy(
                loading = !fromUser && !hadContent,
                refreshing = fromUser,
                error = null,
            )
            try {
                container.ensureFreshToken()
                runCatching { container.quickAccess.syncFromApi(container.api) }
                val home = container.api.home()
                val savedMixes = runCatching {
                    container.api.library().mixes.map { it.id }.toSet()
                }.getOrDefault(emptySet())
                container.homeCache.write(home)
                _state.value = HomeUiState(
                    loading = false,
                    refreshing = false,
                    // Accès rapide = pins syncés ; on masque le rayon « Épinglé » doublon.
                    shelves = home.shelves.filter {
                        it.items.isNotEmpty() && !it.title.equals("Épinglé", ignoreCase = true)
                    },
                    radios = home.radios,
                    savedMixIds = savedMixes,
                    needsOnboarding = home.needsOnboarding == true,
                    seeds = home.seeds.orEmpty(),
                    hasMore = home.hasMore == true,
                    page = 0,
                    radioPreviews = _state.value.radioPreviews,
                )
                // Mosaïques mix (preview) en arrière-plan
                val previews = mutableMapOf<String, List<TrackDto>>()
                home.radios.take(8).forEach { radio ->
                    runCatching {
                        container.api.recoRadio(radio.id, preview = 1).tracks.take(4)
                    }.onSuccess { tracks ->
                        if (tracks.isNotEmpty()) previews[radio.id] = tracks
                    }
                }
                if (previews.isNotEmpty()) {
                    _state.value = _state.value.copy(radioPreviews = previews)
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    loading = false,
                    refreshing = false,
                    error = if (hadContent) null else (e.message ?: "Erreur accueil"),
                )
            }
        }
    }

    fun loadMore() {
        val cur = _state.value
        if (!cur.hasMore || cur.loadingMore || cur.loading || cur.seeds.isEmpty()) return
        viewModelScope.launch {
            _state.value = cur.copy(loadingMore = true)
            try {
                container.ensureFreshToken()
                val nextPage = cur.page + 1
                val more = container.api.homeMore(nextPage, cur.seeds.joinToString(","))
                val extra = more.shelves.filter { it.items.isNotEmpty() }
                val merged = (cur.shelves + extra).distinctBy { it.title }
                _state.value = _state.value.copy(
                    loadingMore = false,
                    shelves = merged,
                    page = nextPage,
                    hasMore = more.hasMore != false && extra.isNotEmpty(),
                )
            } catch (_: Exception) {
                _state.value = _state.value.copy(loadingMore = false, hasMore = false)
            }
        }
    }

    fun playRadio(
        categoryId: String,
        onQueue: (List<TrackDto>, String) -> Unit,
    ) {
        viewModelScope.launch {
            val title = _state.value.radios.find { it.id == categoryId }?.title ?: "Mix"
            // Preview déjà en mémoire → feedback immédiat, puis file complète
            val preview = _state.value.radioPreviews[categoryId]
                .orEmpty()
                .filter { it.isPlayable() }
            if (preview.isNotEmpty()) {
                onQueue(preview, title)
            } else {
                _state.value = _state.value.copy(radioLoadingId = categoryId)
            }
            runCatching {
                container.ensureFreshToken()
                val mix = container.api.recoRadio(categoryId)
                val tracks = mix.tracks.filter { it.isPlayable() }
                if (tracks.isNotEmpty()) onQueue(tracks, title)
            }
            _state.value = _state.value.copy(radioLoadingId = null)
        }
    }

    fun saveMix(categoryId: String, title: String, covers: List<TrackDto>) {
        viewModelScope.launch {
            runCatching {
                container.ensureFreshToken()
                container.api.saveMix(
                    mapOf(
                        "id" to categoryId,
                        "title" to title,
                        "covers" to covers,
                        "tracks" to covers,
                    ),
                )
                _state.value = _state.value.copy(
                    savedMixIds = _state.value.savedMixIds + categoryId,
                )
            }
        }
    }

    fun clearOnboardingFlag() {
        _state.value = _state.value.copy(needsOnboarding = false)
    }

    fun playableFrom(track: TrackDto, shelf: ShelfDto): Pair<List<TrackDto>, Int> {
        val list = shelf.items.filter { it.isPlayable() }
        val idx = list.indexOfFirst { it.id == track.id }.coerceAtLeast(0)
        return list to idx
    }

    companion object {
        fun factory(c: AppContainer) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = HomeViewModel(c) as T
        }
    }
}
