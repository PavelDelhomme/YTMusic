package ovh.delhomme.ytmusic

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.zIndex
import androidx.core.content.ContextCompat
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.launch
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.ListenBody
import ovh.delhomme.ytmusic.data.TrackDto
import ovh.delhomme.ytmusic.data.buildRadioQueue
import ovh.delhomme.ytmusic.player.PlayerController
import ovh.delhomme.ytmusic.ui.auth.LoginScreen
import ovh.delhomme.ytmusic.ui.components.AddToPlaylistSheet
import ovh.delhomme.ytmusic.ui.components.CastSheet
import ovh.delhomme.ytmusic.ui.components.MiniPlayerBar
import ovh.delhomme.ytmusic.ui.components.TrackActionsSheet
import ovh.delhomme.ytmusic.ui.detail.CollectionDetailScreen
import ovh.delhomme.ytmusic.ui.detail.DetailKind
import ovh.delhomme.ytmusic.ui.home.HomeScreen
import ovh.delhomme.ytmusic.ui.library.LibraryScreen
import ovh.delhomme.ytmusic.ui.player.NowPlayingScreen
import ovh.delhomme.ytmusic.ui.prefs.RecoPrefsScreen
import ovh.delhomme.ytmusic.ui.search.SearchScreen
import ovh.delhomme.ytmusic.ui.theme.YtMusicTheme
import androidx.navigation.NavType
import androidx.navigation.navArgument
import android.net.Uri

class MainActivity : ComponentActivity() {
    private val notifPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* ignore */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Splash → thème app après le premier frame
        setTheme(R.style.Theme_YTMusic)
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
    val scope = rememberCoroutineScope()
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

    BackHandler(enabled = loggedIn == true && showNowPlaying) {
        showNowPlaying = false
    }

    when (loggedIn) {
        null -> Box(
            Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
        )
        false -> LoginScreen(container = container, onLoggedIn = { loggedIn = true })
        true -> {
            MainTabs(
                container = container,
                player = player,
                expanded = showNowPlaying,
                onOpenPlayer = { showNowPlaying = true },
                onClosePlayer = { showNowPlaying = false },
                onPlayTracks = { tracks, idx ->
                    player.play(tracks, idx)
                    showNowPlaying = false
                },
                onLoggedOut = { loggedIn = false },
                onStartRadioFromNowPlaying = {
                    val t = player.state.value.track ?: return@MainTabs
                    scope.launch {
                        val mix = buildRadioQueue(container.api, "track", t.id, t)
                        if (mix.isNotEmpty()) player.play(mix, 0)
                    }
                },
            )
        }
    }
}

@Composable
private fun MainTabs(
    container: AppContainer,
    player: PlayerController,
    expanded: Boolean,
    onOpenPlayer: () -> Unit,
    onClosePlayer: () -> Unit,
    onPlayTracks: (List<TrackDto>, Int) -> Unit,
    onLoggedOut: () -> Unit,
    onStartRadioFromNowPlaying: () -> Unit,
) {
    val nav = rememberNavController()
    val tabs = listOf(Tab.Home, Tab.Search, Tab.Library)
    val backStack by nav.currentBackStackEntryAsState()
    val current = backStack?.destination?.route
    val playerUi by player.state.collectAsState()
    val scope = rememberCoroutineScope()

    fun openDetail(item: TrackDto) {
        val kind = when {
            item.isAlbum() -> "album"
            item.isArtist() -> "artist"
            else -> "playlist"
        }
        nav.navigate("detail/$kind/${Uri.encode(item.id)}")
    }

    var menuTrack by remember { mutableStateOf<TrackDto?>(null) }
    var menuPlaylistId by remember { mutableStateOf<String?>(null) }
    var detailReloadToken by remember { mutableStateOf(0) }
    var addToPlaylistTrack by remember { mutableStateOf<TrackDto?>(null) }
    var showCast by remember { mutableStateOf(false) }
    var likedIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var forceOnboarding by remember { mutableStateOf(false) }
    var onboardingChecked by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        likedIds = runCatching {
            container.api.library().liked.map { it.id }.toSet()
        }.getOrDefault(emptySet())
        if (!onboardingChecked) {
            onboardingChecked = true
            forceOnboarding = runCatching {
                val p = container.api.prefs().prefs
                !p.onboardingDone || (p.genres.isEmpty() && p.moods.isEmpty())
            }.getOrDefault(false)
        }
    }

    // Signaux d’écoute pour le moteur de reco
    var lastListenStartId by remember { mutableStateOf<String?>(null) }
    var completedIds by remember { mutableStateOf(setOf<String>()) }
    LaunchedEffect(playerUi.track?.id) {
        val t = playerUi.track ?: return@LaunchedEffect
        if (t.id == lastListenStartId) return@LaunchedEffect
        lastListenStartId = t.id
        runCatching {
            container.api.listen(ListenBody(t.id, "start", track = t))
        }
    }
    LaunchedEffect(playerUi.track?.id, playerUi.positionMs, playerUi.durationMs) {
        val t = playerUi.track ?: return@LaunchedEffect
        if (playerUi.durationMs <= 0 || t.id in completedIds) return@LaunchedEffect
        val pct = playerUi.positionMs.toDouble() / playerUi.durationMs
        if (pct >= 0.85) {
            completedIds = completedIds + t.id
            runCatching {
                container.api.listen(
                    ListenBody(
                        t.id,
                        "complete",
                        progressPct = pct,
                        durationMs = playerUi.durationMs,
                        track = t,
                    ),
                )
            }
        }
    }

    LaunchedEffect(playerUi.playing, playerUi.track?.id) {
        while (playerUi.playing && playerUi.track != null) {
            player.tick()
            kotlinx.coroutines.delay(500)
        }
    }

    Scaffold(
        bottomBar = {
            if (!expanded) {
                Column {
                    playerUi.track?.let { track ->
                        MiniPlayerBar(
                            track = track,
                            playing = playerUi.playing,
                            progress = if (playerUi.durationMs > 0) {
                                (playerUi.positionMs.toFloat() / playerUi.durationMs).coerceIn(0f, 1f)
                            } else {
                                0f
                            },
                            onToggle = player::toggle,
                            onCast = { showCast = true },
                            onOpen = onOpenPlayer,
                            onSeek = { ratio ->
                                val dur = playerUi.durationMs
                                if (dur > 0) player.seek((ratio * dur).toLong())
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(MaterialTheme.colorScheme.surfaceVariant),
                        )
                    }
                    NavigationBar(
                        containerColor = MaterialTheme.colorScheme.surface,
                    ) {
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
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = Tab.Home.route,
            modifier = Modifier.padding(padding),
        ) {
            composable(Tab.Home.route) {
                HomeScreen(
                    container = container,
                    onPlay = onPlayTracks,
                    onMore = { menuTrack = it; menuPlaylistId = null },
                    onOpenDetail = ::openDetail,
                    onOpenRecoPrefs = { nav.navigate("reco_prefs") },
                    onLoggedOut = onLoggedOut,
                )
            }
            composable(Tab.Search.route) {
                SearchScreen(
                    container = container,
                    onPlay = onPlayTracks,
                    onMore = { menuTrack = it; menuPlaylistId = null },
                    onOpenDetail = ::openDetail,
                )
            }
            composable(Tab.Library.route) {
                LibraryScreen(
                    container = container,
                    onPlay = onPlayTracks,
                    onMore = { menuTrack = it; menuPlaylistId = null },
                    onOpenDetail = ::openDetail,
                    onOpenRecoPrefs = { nav.navigate("reco_prefs") },
                    onLoggedOut = onLoggedOut,
                )
            }
            composable("reco_prefs") {
                RecoPrefsScreen(
                    container = container,
                    forceOnboarding = false,
                    onDone = { nav.popBackStack() },
                    onBack = { nav.popBackStack() },
                )
            }
            composable(
                route = "detail/{kind}/{id}",
                arguments = listOf(
                    navArgument("kind") { type = NavType.StringType },
                    navArgument("id") { type = NavType.StringType },
                ),
            ) { entry ->
                val kindStr = entry.arguments?.getString("kind") ?: "playlist"
                val id = entry.arguments?.getString("id") ?: return@composable
                val kind = when (kindStr) {
                    "album" -> DetailKind.Album
                    "artist" -> DetailKind.Artist
                    else -> DetailKind.Playlist
                }
                CollectionDetailScreen(
                    container = container,
                    kind = kind,
                    id = id,
                    reloadToken = detailReloadToken,
                    onBack = { nav.popBackStack() },
                    onPlay = onPlayTracks,
                    onMore = { track, playlistId ->
                        menuTrack = track
                        menuPlaylistId = playlistId
                    },
                )
            }
        }
    }

    menuTrack?.let { track ->
        TrackActionsSheet(
            track = track,
            container = container,
            player = player,
            likedIds = likedIds,
            onDismiss = {
                menuTrack = null
                menuPlaylistId = null
            },
            onLikedChanged = { likedIds = it },
            onOpenAddToPlaylist = {
                addToPlaylistTrack = track
                menuTrack = null
                menuPlaylistId = null
            },
            onOpenAlbum = { id ->
                nav.navigate("detail/album/${Uri.encode(id)}")
            },
            onOpenArtist = { id ->
                nav.navigate("detail/artist/${Uri.encode(id)}")
            },
            playlistId = menuPlaylistId,
            onRemovedFromPlaylist = { detailReloadToken++ },
        )
    }

    addToPlaylistTrack?.let { track ->
        AddToPlaylistSheet(
            track = track,
            container = container,
            onDismiss = { addToPlaylistTrack = null },
        )
    }

    AnimatedVisibility(
        visible = expanded,
        enter = fadeIn() + slideInVertically { it },
        exit = fadeOut() + slideOutVertically { it },
        modifier = Modifier
            .fillMaxSize()
            .zIndex(10f),
    ) {
        NowPlayingScreen(
            player = player,
            ui = playerUi,
            container = container,
            likedIds = likedIds,
            onLikedChanged = { likedIds = it },
            onClose = onClosePlayer,
            onMore = { menuTrack = it; menuPlaylistId = null },
            onCast = { showCast = true },
            onOpenAddToPlaylist = { addToPlaylistTrack = it },
        )
    }

    if (showCast) {
        CastSheet(container = container, onDismiss = { showCast = false })
    }

    if (forceOnboarding) {
        Box(
            Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .zIndex(20f),
        ) {
            RecoPrefsScreen(
                container = container,
                forceOnboarding = true,
                onDone = {
                    forceOnboarding = false
                },
            )
        }
    }
}
