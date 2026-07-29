package ovh.delhomme.ytmusic.player

import android.app.PendingIntent
import android.content.Intent
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.CommandButton
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import ovh.delhomme.ytmusic.MainActivity
import ovh.delhomme.ytmusic.R
import ovh.delhomme.ytmusic.YtMusicApp
import ovh.delhomme.ytmusic.data.TrackDto
import ovh.delhomme.ytmusic.BuildConfig

/**
 * Lecture arrière-plan + notification média persistante (style YTM) :
 * précédent / play-pause / suivant + aléatoire / boucle / j’aime.
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {
    private var player: ExoPlayer? = null
    private var session: MediaSession? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val cmdLike = SessionCommand(ACTION_TOGGLE_LIKE, Bundle.EMPTY)
    private val cmdCycleRepeat = SessionCommand(ACTION_CYCLE_REPEAT, Bundle.EMPTY)
    private val cmdToggleShuffle = SessionCommand(ACTION_TOGGLE_SHUFFLE, Bundle.EMPTY)

    private val playerListener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) {
            if (
                events.contains(Player.EVENT_SHUFFLE_MODE_ENABLED_CHANGED) ||
                events.contains(Player.EVENT_REPEAT_MODE_CHANGED) ||
                events.contains(Player.EVENT_MEDIA_ITEM_TRANSITION) ||
                events.contains(Player.EVENT_PLAYBACK_STATE_CHANGED) ||
                events.contains(Player.EVENT_IS_PLAYING_CHANGED)
            ) {
                refreshMediaButtons()
            }
            if (events.contains(Player.EVENT_MEDIA_ITEM_TRANSITION)) {
                warmUpcoming(player.currentMediaItemIndex)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        // Buffer court pour audio : démarrage ~0,6–1 s au lieu du défaut ~2,5 s
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                /* minBufferMs */ 6_000,
                /* maxBufferMs */ 36_000,
                /* bufferForPlaybackMs */ 600,
                /* bufferForPlaybackAfterRebufferMs */ 1_500,
            )
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()
        val exo = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus= */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .setLoadControl(loadControl)
            .build()
        exo.addListener(playerListener)
        player = exo

        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        session = MediaSession.Builder(this, exo)
            .setCallback(SessionCallback())
            .setSessionActivity(openApp)
            .setMediaButtonPreferences(buildMediaButtons(exo))
            .build()

        val notificationProvider = DefaultMediaNotificationProvider.Builder(this).build()
        notificationProvider.setSmallIcon(R.drawable.ic_brand_fg)
        setMediaNotificationProvider(notificationProvider)

        Holder.player = exo
        Holder.service = this
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = player
        // Garder la lecture si un titre tourne encore (notification persistante)
        if (p == null || !p.isPlaying || p.mediaItemCount == 0) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        scope.cancel()
        player?.removeListener(playerListener)
        session?.release()
        session = null
        player?.release()
        player = null
        Holder.player = null
        Holder.service = null
        super.onDestroy()
    }

    private fun refreshMediaButtons() {
        val p = player ?: return
        session?.setMediaButtonPreferences(buildMediaButtons(p))
    }

    private fun buildMediaButtons(p: Player): List<CommandButton> {
        val mediaId = p.currentMediaItem?.mediaId
        val liked = mediaId != null && mediaId in Holder.likedIds
        val shuffleOn = p.shuffleModeEnabled
        val repeatIcon = when (p.repeatMode) {
            Player.REPEAT_MODE_ONE -> CommandButton.ICON_REPEAT_ONE
            Player.REPEAT_MODE_ALL -> CommandButton.ICON_REPEAT_ALL
            else -> CommandButton.ICON_REPEAT_OFF
        }
        val repeatName = when (p.repeatMode) {
            Player.REPEAT_MODE_ONE -> "Boucler le titre"
            Player.REPEAT_MODE_ALL -> "Boucler la file"
            else -> "Boucle désactivée"
        }

        return listOf(
            CommandButton.Builder(if (liked) CommandButton.ICON_HEART_FILLED else CommandButton.ICON_HEART_UNFILLED)
                .setDisplayName(if (liked) "Retirer des J'aime" else "J'aime")
                .setSessionCommand(cmdLike)
                .setSlots(CommandButton.SLOT_OVERFLOW)
                .build(),
            CommandButton.Builder(if (shuffleOn) CommandButton.ICON_SHUFFLE_ON else CommandButton.ICON_SHUFFLE_OFF)
                .setDisplayName(if (shuffleOn) "Aléatoire activé" else "Aléatoire")
                .setSessionCommand(cmdToggleShuffle)
                .setSlots(CommandButton.SLOT_OVERFLOW)
                .build(),
            CommandButton.Builder(repeatIcon)
                .setDisplayName(repeatName)
                .setSessionCommand(cmdCycleRepeat)
                .setSlots(CommandButton.SLOT_OVERFLOW)
                .build(),
        )
    }

    private inner class SessionCallback : MediaSession.Callback {
        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
        ): MediaSession.ConnectionResult {
            val sessionCommands = MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS.buildUpon()
                .add(cmdLike)
                .add(cmdCycleRepeat)
                .add(cmdToggleShuffle)
                .build()
            val playerCommands = MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailableSessionCommands(sessionCommands)
                .setAvailablePlayerCommands(playerCommands)
                .setMediaButtonPreferences(buildMediaButtons(session.player))
                .build()
        }

        override fun onCustomCommand(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            customCommand: SessionCommand,
            args: Bundle,
        ): ListenableFuture<SessionResult> {
            val p = session.player
            when (customCommand.customAction) {
                ACTION_TOGGLE_SHUFFLE -> {
                    p.shuffleModeEnabled = !p.shuffleModeEnabled
                    refreshMediaButtons()
                }
                ACTION_CYCLE_REPEAT -> {
                    p.repeatMode = when (p.repeatMode) {
                        Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
                        Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
                        else -> Player.REPEAT_MODE_OFF
                    }
                    refreshMediaButtons()
                }
                ACTION_TOGGLE_LIKE -> {
                    toggleLikeFromNotification(p)
                }
            }
            return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
        }
    }

    private fun toggleLikeFromNotification(p: Player) {
        val mediaId = p.currentMediaItem?.mediaId ?: return
        val track = Holder.queue.firstOrNull { it.id == mediaId } ?: return
        val app = applicationContext as? YtMusicApp ?: return
        scope.launch {
            runCatching {
                app.container.ensureFreshToken()
                val r = app.container.api.like(track)
                Holder.likedIds = if (r.liked) {
                    Holder.likedIds + mediaId
                } else {
                    Holder.likedIds - mediaId
                }
                Holder.onLikedIdsChanged?.invoke(Holder.likedIds)
                refreshMediaButtons()
            }
        }
    }

    private fun warmUpcoming(fromIndex: Int) {
        val queue = Holder.queue
        if (queue.isEmpty()) return
        val base = BuildConfig.API_BASE_URL.trimEnd('/')
        val ids = listOfNotNull(
            queue.getOrNull(fromIndex)?.id,
            queue.getOrNull(fromIndex + 1)?.id,
            queue.getOrNull(fromIndex + 2)?.id,
        )
        StreamPrefetcher.warmMany(ids.map { "$base/api/stream/$it/url" })
    }

    object Holder {
        @Volatile var player: ExoPlayer? = null
        @Volatile var service: PlaybackService? = null
        @Volatile var queue: List<TrackDto> = emptyList()
        @Volatile var index: Int = 0
        @Volatile var likedIds: Set<String> = emptySet()
        @Volatile var onLikedIdsChanged: ((Set<String>) -> Unit)? = null

        fun syncLikedIds(ids: Set<String>) {
            likedIds = ids
            service?.refreshMediaButtons()
        }
    }

    companion object {
        const val ACTION_TOGGLE_LIKE = "ytm.action.TOGGLE_LIKE"
        const val ACTION_CYCLE_REPEAT = "ytm.action.CYCLE_REPEAT"
        const val ACTION_TOGGLE_SHUFFLE = "ytm.action.TOGGLE_SHUFFLE"
    }
}

fun ExoPlayer.playTracks(baseStreamUrl: (String) -> String, tracks: List<TrackDto>, startIndex: Int) {
    val playable = tracks.filter { it.isPlayable() }
    if (playable.isEmpty()) return
    val idx = startIndex.coerceIn(0, playable.lastIndex)
    PlaybackService.Holder.queue = playable
    PlaybackService.Holder.index = idx
    val base = BuildConfig.API_BASE_URL.trimEnd('/')
    StreamPrefetcher.warmMany(
        listOfNotNull(
            playable.getOrNull(idx)?.id,
            playable.getOrNull(idx + 1)?.id,
            playable.getOrNull(idx + 2)?.id,
        ).map { "$base/api/stream/$it/url" },
    )
    val items = playable.map { t ->
        MediaItem.Builder()
            .setMediaId(t.id)
            .setUri(baseStreamUrl(t.id))
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(t.title)
                    .setArtist(t.artistLine())
                    .setArtworkUri(t.coverUrl()?.let { android.net.Uri.parse(it) })
                    .build(),
            )
            .build()
    }
    setMediaItems(items, idx, 0L)
    prepare()
    playWhenReady = true
}
