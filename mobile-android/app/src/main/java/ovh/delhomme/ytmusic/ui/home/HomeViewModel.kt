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
    val error: String? = null,
    val shelves: List<ShelfDto> = emptyList(),
    val radios: List<RadioCategoryDto> = emptyList(),
    val needsOnboarding: Boolean = false,
    val radioLoadingId: String? = null,
)

class HomeViewModel(private val container: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                container.ensureFreshToken()
                runCatching { container.quickAccess.syncFromApi(container.api) }
                val home = container.api.home()
                _state.value = HomeUiState(
                    loading = false,
                    shelves = home.shelves.filter { it.items.isNotEmpty() },
                    radios = home.radios,
                    needsOnboarding = home.needsOnboarding == true,
                )
            } catch (e: Exception) {
                _state.value = HomeUiState(loading = false, error = e.message ?: "Erreur accueil")
            }
        }
    }

    fun playRadio(
        categoryId: String,
        onQueue: (List<TrackDto>, String) -> Unit,
    ) {
        viewModelScope.launch {
            _state.value = _state.value.copy(radioLoadingId = categoryId)
            runCatching {
                container.ensureFreshToken()
                val mix = container.api.recoRadio(categoryId)
                val tracks = mix.tracks.filter { it.isPlayable() }
                if (tracks.isNotEmpty()) {
                    val title = _state.value.radios.find { it.id == categoryId }?.title ?: "Mix"
                    onQueue(tracks, title)
                }
            }
            _state.value = _state.value.copy(radioLoadingId = null)
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
