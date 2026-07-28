package ovh.delhomme.ytmusic

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.player.PlayerController
import ovh.delhomme.ytmusic.ui.auth.LoginScreen
import ovh.delhomme.ytmusic.ui.components.MiniPlayerBar
import ovh.delhomme.ytmusic.ui.home.HomeScreen
import ovh.delhomme.ytmusic.ui.library.LibraryScreen
import ovh.delhomme.ytmusic.ui.player.NowPlayingScreen
import ovh.delhomme.ytmusic.ui.search.SearchScreen
import ovh.delhomme.ytmusic.ui.theme.YtMusicTheme

class MainActivity : ComponentActivity() {
    private val notifPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* ignore */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (Build.VERSION.SDK_INT >= 33) {
            val ok = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            if (ok != PackageManager.PERMISSION_GRANTED) {
                notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        val app = application as YtMusicApp
        setContent {
            YtMusicTheme {
                YtMusicAppContent(app.container)
            }
        }
    }
}

private sealed class Tab(val route: String, val label: String, val icon: ImageVector) {
    data object Home : Tab("home", "Accueil", Icons.Default.Home)
    data object Search : Tab("search", "Recherche", Icons.Default.Search)
    data object Library : Tab("library", "Biblio", Icons.Default.LibraryMusic)
}

@Composable
fun YtMusicAppContent(container: AppContainer) {
    val context = LocalContext.current
    var loggedIn by remember { mutableStateOf<Boolean?>(null) }
    var showNowPlaying by remember { mutableStateOf(false) }

    val player = remember(container) {
        PlayerController(context.applicationContext, container::streamUrl)
    }
    DisposableEffect(player) {
        player.connect()
        onDispose { player.release() }
    }

    LaunchedEffect(Unit) {
        val token = container.tokenStore.getAccess()
        loggedIn = if (token.isNullOrBlank()) {
            false
        } else {
            runCatching { container.api.me().user != null }.getOrDefault(false) ||
                container.ensureFreshToken()
        }
    }

    when (loggedIn) {
        null -> Box(
            Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
        )
        false -> LoginScreen(container = container, onLoggedIn = { loggedIn = true })
        true -> {
            if (showNowPlaying) {
                val ui by player.state.collectAsState()
                NowPlayingScreen(
                    player = player,
                    ui = ui,
                    onClose = { showNowPlaying = false },
                )
            } else {
                MainTabs(
                    container = container,
                    player = player,
                    onOpenPlayer = { showNowPlaying = true },
                    onLoggedOut = { loggedIn = false },
                )
            }
        }
    }
}

@Composable
private fun MainTabs(
    container: AppContainer,
    player: PlayerController,
    onOpenPlayer: () -> Unit,
    onLoggedOut: () -> Unit,
) {
    val nav = rememberNavController()
    val tabs = listOf(Tab.Home, Tab.Search, Tab.Library)
    val backStack by nav.currentBackStackEntryAsState()
    val current = backStack?.destination?.route
    val playerUi by player.state.collectAsState()

    Scaffold(
        bottomBar = {
            Column {
                playerUi.track?.let { track ->
                    MiniPlayerBar(
                        track = track,
                        playing = playerUi.playing,
                        onToggle = player::toggle,
                        onOpen = onOpenPlayer,
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceVariant),
                    )
                }
                NavigationBar {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = current == tab.route,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo(nav.graph.startDestinationId) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = Tab.Home.route,
            modifier = Modifier.padding(padding),
        ) {
            composable(Tab.Home.route) {
                HomeScreen(container = container, onPlay = player::play)
            }
            composable(Tab.Search.route) {
                SearchScreen(container = container, onPlay = player::play)
            }
            composable(Tab.Library.route) {
                LibraryScreen(container = container, onLoggedOut = onLoggedOut)
            }
        }
    }
}
