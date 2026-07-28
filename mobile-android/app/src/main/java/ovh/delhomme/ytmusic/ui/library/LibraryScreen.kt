package ovh.delhomme.ytmusic.ui.library

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ovh.delhomme.ytmusic.BuildConfig
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.RefreshBody

@Composable
fun LibraryScreen(
    container: AppContainer,
    onLoggedOut: () -> Unit,
) {
    val email by container.tokenStore.userEmail.collectAsState(initial = null)
    val scope = rememberCoroutineScope()

    Column(
        Modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        Text(
            "Bibliothèque",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(16.dp))
        Text(
            email ?: "Connecté",
            style = MaterialTheme.typography.titleMedium,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "API : ${BuildConfig.API_BASE_URL}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Client Kotlin natif — ExoPlayer / Media3, pas de WebView ni Passkey.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(28.dp))
        OutlinedButton(
            onClick = {
                scope.launch {
                    runCatching {
                        container.api.logout(RefreshBody(container.tokenStore.getRefresh()))
                    }
                    container.tokenStore.clear()
                    onLoggedOut()
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Se déconnecter")
        }
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = { /* placeholder */ },
            enabled = false,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Favoris & playlists (bientôt)")
        }
    }
}
