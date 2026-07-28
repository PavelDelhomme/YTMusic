package ovh.delhomme.ytmusic.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.LoginBody
import ovh.delhomme.ytmusic.data.RegisterBody
import retrofit2.HttpException

data class AuthUiState(
    val email: String = "",
    val password: String = "",
    val name: String = "",
    val totp: String = "",
    val registerMode: Boolean = false,
    val needs2fa: Boolean = false,
    val loading: Boolean = false,
    val error: String? = null,
    val loggedIn: Boolean = false,
)

class AuthViewModel(private val container: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val token = container.tokenStore.getAccess()
            if (!token.isNullOrBlank()) {
                val ok = runCatching { container.api.me().user != null }.getOrDefault(false) ||
                    container.ensureFreshToken()
                if (ok) _state.value = _state.value.copy(loggedIn = true)
            }
        }
    }

    fun updateEmail(v: String) { _state.value = _state.value.copy(email = v, error = null) }
    fun updatePassword(v: String) { _state.value = _state.value.copy(password = v, error = null) }
    fun updateName(v: String) { _state.value = _state.value.copy(name = v) }
    fun updateTotp(v: String) { _state.value = _state.value.copy(totp = v) }
    fun toggleMode() {
        _state.value = _state.value.copy(registerMode = !_state.value.registerMode, error = null)
    }

    fun submit() {
        val s = _state.value
        if (s.email.isBlank() || s.password.isBlank()) {
            _state.value = s.copy(error = "Email et mot de passe requis")
            return
        }
        viewModelScope.launch {
            _state.value = s.copy(loading = true, error = null)
            try {
                val res = if (s.registerMode) {
                    container.api.register(
                        RegisterBody(s.email.trim(), s.password, s.name.ifBlank { null }),
                    )
                } else {
                    container.api.login(
                        LoginBody(
                            s.email.trim(),
                            s.password,
                            s.totp.ifBlank { null },
                        ),
                    )
                }
                container.tokenStore.saveSession(
                    res.token,
                    res.refreshToken,
                    res.user.email,
                    res.user.name,
                )
                _state.value = _state.value.copy(loading = false, loggedIn = true, needs2fa = false)
            } catch (e: HttpException) {
                val body = e.response()?.errorBody()?.string().orEmpty()
                val needs2fa = e.code() == 401 && (body.contains("2FA") || body.contains("needs2fa"))
                _state.value = _state.value.copy(
                    loading = false,
                    needs2fa = needs2fa,
                    error = if (needs2fa) "Entre ton code 2FA" else (body.ifBlank { e.message() }),
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    loading = false,
                    error = e.message ?: "Erreur de connexion",
                )
            }
        }
    }

    companion object {
        fun factory(container: AppContainer) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                AuthViewModel(container) as T
        }
    }
}
