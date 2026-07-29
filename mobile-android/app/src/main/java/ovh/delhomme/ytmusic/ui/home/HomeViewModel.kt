package ovh.delhomme.ytmusic.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.ShelfDto
import ovh.delhomme.ytmusic.data.TrackDto

data class HomeUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val shelves: List<ShelfDto> = emptyList(),
    val needsOnboarding: Boolean = false,
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
                val home = container.api.home()
                _state.value = HomeUiState(
                    loading = false,
                    shelves = home.shelves.filter { it.items.isNotEmpty() },
                    needsOnboarding = home.needsOnboarding == true,
                )
            } catch (e: Exception) {
                _state.value = HomeUiState(loading = false, error = e.message ?: "Erreur accueil")
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
