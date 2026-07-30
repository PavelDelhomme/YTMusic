package ovh.delhomme.ytmusic

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.net.Uri
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
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
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
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.ListenBody
import ovh.delhomme.ytmusic.data.TrackDto
import ovh.delhomme.ytmusic.data.buildRadioQueue
import ovh.delhomme.ytmusic.data.resolveArtistId
import ovh.delhomme.ytmusic.player.PlaybackService
import ovh.delhomme.ytmusic.player.PlayerController
import ovh.delhomme.ytmusic.ui.auth.LoginScreen
import ovh.delhomme.ytmusic.ui.components.AddToPlaylistSheet
import ovh.delhomme.ytmusic.ui.components.CastSheet
import ovh.delhomme.ytmusic.ui.components.MiniPlayerBar
import ovh.delhomme.ytmusic.ui.components.TrackActionsSheet
import ovh.delhomme.ytmusic.ui.detail.ArtistDetailScreen
import ovh.delhomme.ytmusic.ui.detail.ArtistSongsScreen
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
                YtMusicAppContent(
                    container = app.container,
                    openPlayerFromIntent = intent?.getBooleanExtra(EXTRA_OPEN_PLAYER, false) == true,
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    companion object {
        const val EXTRA_OPEN_PLAYER = "ovh.delhomme.ytmusic.OPEN_PLAYER"
    }
}

private sealed class Tab(val route: String, val label: String, val icon: ImageVector) {
    data object Home : Tab("home", "Accueil", Icons.Default.Home)
    data object Search : Tab("search", "Recherche", Icons.Default.Search)
    data object Library : Tab("library", "Biblio", Icons.Default.LibraryMusic)
}

@Composable
fun YtMusicAppContent(
    container: AppContainer,
    openPlayerFromIntent: Boolean = false,
) {
    val context = LocalContext.current
    val activity = context as? ComponentActivity
    val scope = rememberCoroutineScope()
    var loggedIn by remember { mutableStateOf<Boolean?>(null) }
    var showNowPlaying by remember { mutableStateOf(openPlayerFromIntent) }

    val player = remember(container) {
        PlayerController(
            context.applicationContext,
            container::streamUrl,
            container::warmStreamUrl,
        )
    }
    DisposableEffect(player) {
        player.connect()
        onDispose { player.release() }
    }

    // Clic notification → ouvrir le lecteur (singleTask / onNewIntent)
    DisposableEffect(activity) {
        if (activity == null) return@DisposableEffect onDispose { }
        val listener = androidx.core.util.Consumer<Intent> { intent ->
            if (intent.getBooleanExtra(MainActivity.EXTRA_OPEN_PLAYER, false)) {
                showNowPlaying = true
                intent.removeExtra(MainActivity.EXTRA_OPEN_PLAYER)
            }
        }
        activity.addOnNewIntentListener(listener)
        onDispose { activity.removeOnNewIntentListener(listener) }
    }

    LaunchedEffect(openPlayerFromIntent) {
        if (openPlayerFromIntent) showNowPlaying = true
    }

    LaunchedEffect(Unit) {
        loggedIn = container.validateSession()
    }

    // Si une piste tourne déjà (service survivant) → mini-player / éventuellement notif
    LaunchedEffect(loggedIn) {
        if (loggedIn == true && openPlayerFromIntent) {
            showNowPlaying = true
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
                onPlayNamed = { tracks, idx, title ->
                    val radioish =
                        title.contains("radio", ignoreCase = true) ||
                            title.equals("Mix", ignoreCase = true) ||
                            title.contains("rapport", ignoreCase = true)
                    player.play(
                        tracks,
                        idx,
                        title,
                        userQueueEnd = if (radioish) 1 else null,
                    )
                    showNowPlaying = false
                },
                onLoggedOut = { loggedIn = false },
                onStartRadioFromNowPlaying = {
                    val t = player.state.value.track ?: return@MainTabs
                    scope.launch {
                        val mix = buildRadioQueue(container.api, "track", t.id, t)
                        if (mix.isNotEmpty()) player.play(mix, 0, userQueueEnd = 1)
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
    onPlayNamed: (List<TrackDto>, Int, String) -> Unit = { tracks, idx, _ -> onPlayTracks(tracks, idx) },
    onLoggedOut: () -> Unit,
    onStartRadioFromNowPlaying: () -> Unit,
) {
    val nav = rememberNavController()
    val tabs = listOf(Tab.Home, Tab.Search, Tab.Library)
    val backStack by nav.currentBackStackEntryAsState()
    val current = backStack?.destination?.route
    val playerUi by player.state.collectAsState()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    fun openDetail(item: TrackDto) {
        val kind = when {
            item.isAlbum() -> "album"
            item.isArtist() -> "artist"
            else -> "playlist"
        }
        nav.navigate("detail/$kind/${Uri.encode(item.id)}")
    }

    fun openArtist(id: String?, name: String) {
        scope.launch {
            val resolved = resolveArtistId(container.api, id, name)
            if (resolved.isNullOrBlank()) {
                android.widget.Toast.makeText(
                    context,
                    "Artiste introuvable",
                    android.widget.Toast.LENGTH_SHORT,
                ).show()
                return@launch
            }
            onClosePlayer()
            nav.navigate("detail/artist/${Uri.encode(resolved)}")
        }
    }

    var menuTrack by remember { mutableStateOf<TrackDto?>(null) }
    var menuPlaylistId by remember { mutableStateOf<String?>(null) }
    var detailReloadToken by remember { mutableStateOf(0) }
    var addToPlaylistTrack by remember { mutableStateOf<TrackDto?>(null) }
    var showCast by remember { mutableStateOf(false) }
    var likedIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var forceOnboarding by remember { mutableStateOf(false) }
    var onboardingChecked by remember { mutableStateOf(false) }

    var sessionHydrated by remember { mutableStateOf(false) }
    var pendingRemoteLabel by remember { mutableStateOf<String?>(null) }
    /** Empêche d’écraser l’état web juste après la restauration multi-appareils. */
    var suppressSessionPublishUntil by remember { mutableStateOf(0L) }

    // Sync J’aime ↔ notification média (cœur dans le panneau système)
    LaunchedEffect(likedIds) {
        PlaybackService.Holder.syncLikedIds(likedIds)
    }
    DisposableEffect(Unit) {
        PlaybackService.Holder.onLikedIdsChanged = { ids -> likedIds = ids }
        onDispose { PlaybackService.Holder.onLikedIdsChanged = null }
    }

    LaunchedEffect(Unit) {
        runCatching { container.tokenStore.warmCache() }
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
        if (!sessionHydrated) {
            sessionHydrated = true
            runCatching {
                container.ensureFreshToken()
                val snap = container.api.session()
                val st = snap.state
                val queue = st?.queue.orEmpty().filter { it.isPlayable() }
                val current = st?.current?.takeIf { it.isPlayable() }
                val tracks = when {
                    queue.isNotEmpty() -> queue
                    current != null -> listOf(current)
                    else -> emptyList()
                }
                if (tracks.isNotEmpty()) {
                    val idx = when {
                        current != null -> tracks.indexOfFirst { it.id == current.id }
                            .takeIf { it >= 0 } ?: (st?.queueIndex ?: 0)
                        else -> st?.queueIndex ?: 0
                    }.coerceIn(0, tracks.lastIndex)
                    val posMs = ((st?.progress ?: 0.0) * 1000.0).toLong().coerceAtLeast(0L)
                    // Ne reprend la lecture auto que si l’autre appareil jouait vraiment
                    val autoplay = st?.isPlaying == true
                    suppressSessionPublishUntil = System.currentTimeMillis() + 12_000L
                    player.restoreQueue(
                        tracks = tracks,
                        startIndex = idx,
                        positionMs = posMs,
                        autoplay = autoplay,
                        title = "File synchronisée",
                        userQueueEnd = st?.userQueueEnd,
                    )
                    pendingRemoteLabel = null
                } else if (st?.current != null) {
                    pendingRemoteLabel = st.current.title ?: "Titre en attente"
                }
            }.onFailure {
                pendingRemoteLabel = "Titre en attente"
            }
        }
    }

    // Publier l’état de lecture pour sync multi-appareils (web / desktop / autre mobile)
    suspend fun publishPlayback() {
        if (System.currentTimeMillis() < suppressSessionPublishUntil) return
        val ui = player.state.value
        val t = ui.track ?: return
        runCatching {
            container.api.publishSessionState(
                mapOf(
                    "current" to t,
                    "queue" to ui.queue,
                    "queueIndex" to ui.queueIndex,
                    "userQueueEnd" to ui.userQueueEnd,
                    "autoplay" to ui.autoplaySuggestions,
                    "isPlaying" to ui.playing,
                    "progress" to (ui.positionMs / 1000.0),
                    "duration" to (ui.durationMs / 1000.0).coerceAtLeast(0.0),
                    "shuffle" to ui.shuffle,
                    "repeat" to when (ui.repeat) {
                        ovh.delhomme.ytmusic.player.RepeatMode.Off -> "off"
                        ovh.delhomme.ytmusic.player.RepeatMode.All -> "all"
                        ovh.delhomme.ytmusic.player.RepeatMode.One -> "one"
                    },
                    "updatedAt" to System.currentTimeMillis(),
                    "deviceId" to container.deviceId,
                ),
            )
        }
    }
    LaunchedEffect(playerUi.track?.id, playerUi.playing, playerUi.queueIndex) {
        if (playerUi.track == null) return@LaunchedEffect
        delay(400)
        publishPlayback()
    }
    // Heartbeat progress pendant lecture — rare (énergie)
    LaunchedEffect(playerUi.playing, playerUi.track?.id) {
        if (!playerUi.playing || playerUi.track == null) return@LaunchedEffect
        while (isActive) {
            delay(25_000)
            if (!player.state.value.playing) break
            publishPlayback()
        }
    }

    // Sync multi-appareils : lent en idle, pause si app en arrière-plan sans lecture
    val lifecycleOwner = LocalLifecycleOwner.current
    var lastDeviceRegisterAt by remember { mutableLongStateOf(0L) }
    LaunchedEffect(lifecycleOwner, playerUi.playing) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (isActive) {
                val playing = player.state.value.playing
                val now = System.currentTimeMillis()
                runCatching {
                    if (now - lastDeviceRegisterAt > 5 * 60_000L) {
                        lastDeviceRegisterAt = now
                        container.api.registerSessionDevice(
                            mapOf(
                                "deviceId" to container.deviceId,
                                "name" to (android.os.Build.MODEL ?: "Android"),
                                "deviceType" to "mobile",
                                "canPlay" to true,
                            ),
                        )
                    }
                    // Pendant lecture locale : pas de pull remote (évite radio + restore)
                    if (!playing && now >= suppressSessionPublishUntil) {
                        val snap = container.api.session()
                        val st = snap.state
                        val remoteQueue = st?.queue.orEmpty().filter { it.isPlayable() }
                        val ui = player.state.value
                        val localIds = ui.queue.map { it.id }
                        val remoteIds = remoteQueue.map { it.id }
                        val remoteNewer =
                            (st?.updatedAt ?: 0L) > (now - 120_000) &&
                                remoteIds.isNotEmpty() &&
                                remoteIds != localIds &&
                                snap.activePlayerId != null &&
                                snap.activePlayerId != container.deviceId
                        if (remoteNewer) {
                            val current = st?.current?.takeIf { it.isPlayable() }
                            val idx = when {
                                current != null -> remoteQueue.indexOfFirst { it.id == current.id }
                                    .takeIf { it >= 0 } ?: (st?.queueIndex ?: 0)
                                else -> st?.queueIndex ?: 0
                            }.coerceIn(0, remoteQueue.lastIndex)
                            suppressSessionPublishUntil = System.currentTimeMillis() + 8_000L
                            player.restoreQueue(
                                tracks = remoteQueue,
                                startIndex = idx,
                                positionMs = ((st?.progress ?: 0.0) * 1000.0).toLong().coerceAtLeast(0L),
                                autoplay = false,
                                title = "File synchronisée",
                                userQueueEnd = st?.userQueueEnd,
                            )
                        }
                    }
                }
                delay(if (playing) 45_000 else 30_000)
            }
        }
    }

    // Signaux d’écoute pour le moteur de reco
    var lastListenStartId by remember { mutableStateOf<String?>(null) }
    var completedIds by remember { mutableStateOf(setOf<String>()) }
    var lastProgressSentAt by remember { mutableStateOf(0L) }
    var skipCandidate by remember {
        mutableStateOf<Triple<TrackDto, Long, Long>?>(null) // track, pos, dur
    }

    LaunchedEffect(playerUi.track?.id) {
        val next = playerUi.track
        val prev = skipCandidate
        if (prev != null && next?.id != prev.first.id) {
            val (t, pos, dur) = prev
            val pct = if (dur > 0) pos.toDouble() / dur else 0.0
            if (t.id !in completedIds && (pct < 0.30 || pos < 15_000L)) {
                runCatching {
                    container.api.listen(
                        ListenBody(
                            t.id,
                            "skip",
                            progressPct = pct,
                            durationMs = dur,
                            track = t,
                        ),
                    )
                }
            }
        }
        if (next != null) {
            skipCandidate = Triple(next, playerUi.positionMs, playerUi.durationMs)
            if (next.id != lastListenStartId) {
                lastListenStartId = next.id
                runCatching {
                    container.api.listen(ListenBody(next.id, "start", track = next))
                }
            }
        } else {
            skipCandidate = null
        }
    }

    LaunchedEffect(playerUi.positionMs, playerUi.durationMs, playerUi.track?.id) {
        val t = playerUi.track ?: return@LaunchedEffect
        skipCandidate = Triple(t, playerUi.positionMs, playerUi.durationMs)
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
        if (!playerUi.playing || playerUi.track == null) return@LaunchedEffect
        while (isActive) {
            delay(25_000)
            val t = player.state.value.track ?: break
            val ui = player.state.value
            if (!ui.playing) break
            val now = System.currentTimeMillis()
            if (now - lastProgressSentAt < 20_000) continue
            lastProgressSentAt = now
            val pct = if (ui.durationMs > 0) {
                ui.positionMs.toDouble() / ui.durationMs * 100.0
            } else {
                0.0
            }
            runCatching {
                container.api.listen(
                    ListenBody(
                        t.id,
                        "progress",
                        progressPct = pct,
                        durationMs = ui.durationMs,
                        track = t,
                    ),
                )
            }
        }
    }

    LaunchedEffect(playerUi.playing, playerUi.track?.id) {
        while (playerUi.playing && playerUi.track != null) {
            player.tick()
            delay(500)
        }
    }

    Scaffold(
        contentWindowInsets = WindowInsets.safeDrawing,
        bottomBar = {
            if (!expanded) {
                Column(Modifier.navigationBarsPadding()) {
                    playerUi.track?.let { track ->
                        MiniPlayerBar(
                            track = track,
                            playing = playerUi.playing,
                            progress = if (playerUi.durationMs > 0) {
                                (playerUi.positionMs.toFloat() / playerUi.durationMs).coerceIn(0f, 1f)
                            } else {
                                0f
                            },
                            onToggle = {
                                suppressSessionPublishUntil = 0L
                                player.toggle()
                            },
                            onPrev = {
                                suppressSessionPublishUntil = 0L
                                player.skipPrev()
                            },
                            onNext = {
                                suppressSessionPublishUntil = 0L
                                player.skipNext()
                            },
                            onCast = { showCast = true },
                            onOpen = onOpenPlayer,
                            onSeek = { ratio ->
                                val dur = playerUi.durationMs
                                if (dur > 0) player.seek((ratio * dur).toLong())
                            },
                            onOpenArtist = ::openArtist,
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(MaterialTheme.colorScheme.surfaceVariant),
                        )
                    } ?: pendingRemoteLabel?.let { label ->
                        Text(
                            "En attente · $label",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .padding(16.dp),
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
                    onPlayNamed = onPlayNamed,
                    onMore = { menuTrack = it; menuPlaylistId = null },
                    onOpenDetail = ::openDetail,
                    onOpenArtist = ::openArtist,
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
                    onOpenArtist = ::openArtist,
                )
            }
            composable(Tab.Library.route) {
                LibraryScreen(
                    container = container,
                    onPlay = onPlayTracks,
                    onMore = { menuTrack = it; menuPlaylistId = null },
                    onOpenDetail = ::openDetail,
                    onOpenArtist = ::openArtist,
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
                if (kind == DetailKind.Artist) {
                    ArtistDetailScreen(
                        container = container,
                        artistId = id,
                        reloadToken = detailReloadToken,
                        onBack = { nav.popBackStack() },
                        onPlay = onPlayTracks,
                        onPlayNamed = onPlayNamed,
                        onMore = { track ->
                            menuTrack = track
                            menuPlaylistId = null
                        },
                        onOpenDetail = ::openDetail,
                        onOpenAllSongs = {
                            nav.navigate("artist_songs/${Uri.encode(id)}")
                        },
                    )
                } else {
                    CollectionDetailScreen(
                        container = container,
                        kind = kind,
                        id = id,
                        reloadToken = detailReloadToken,
                        onBack = { nav.popBackStack() },
                        onPlay = onPlayTracks,
                        onPlayNamed = onPlayNamed,
                        onMore = { track, playlistId ->
                            menuTrack = track
                            menuPlaylistId = playlistId
                        },
                    )
                }
            }
            composable(
                route = "artist_songs/{id}",
                arguments = listOf(
                    navArgument("id") { type = NavType.StringType },
                ),
            ) { entry ->
                val id = entry.arguments?.getString("id") ?: return@composable
                ArtistSongsScreen(
                    container = container,
                    artistId = id,
                    reloadToken = detailReloadToken,
                    onBack = { nav.popBackStack() },
                    onPlay = onPlayTracks,
                    onMore = { track ->
                        menuTrack = track
                        menuPlaylistId = null
                    },
                    onOpenDetail = ::openDetail,
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
                onClosePlayer()
                nav.navigate("detail/album/${Uri.encode(id)}")
            },
            onOpenArtist = { id ->
                openArtist(id, "")
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
            onOpenArtist = ::openArtist,
        )
    }

    if (showCast) {
        CastSheet(container = container, player = player, onDismiss = { showCast = false })
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
