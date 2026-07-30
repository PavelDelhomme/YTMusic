package ovh.delhomme.ytmusic.player

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import ovh.delhomme.ytmusic.data.TrackDto

enum class RepeatMode { Off, All, One }

data class PlayerUiState(
    val track: TrackDto? = null,
    val playing: Boolean = false,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val queueSize: Int = 0,
    val queueIndex: Int = 0,
    val queue: List<TrackDto> = emptyList(),
    val sleepLabel: String? = null,
    val shuffle: Boolean = false,
    val repeat: RepeatMode = RepeatMode.Off,
    /** Libellé source : « File d'attente », nom de playlist, mix… */
    val queueTitle: String = "File d'attente",
    /** Fin exclusive de la file lancée par l’utilisateur ; au-delà = suggestions auto. */
    val userQueueEnd: Int = 0,
    /** Lecture automatique (suggestions après la file). */
    val autoplaySuggestions: Boolean = true,
)

/** Pont UI ↔ Media3 PlaybackService (lecture arrière-plan). */
class PlayerController(
    private val context: Context,
    private val streamUrl: (String) -> String,
    private val warmUrl: (String) -> String = { id ->
        streamUrl(id).substringBefore('?').replace("/api/stream/$id", "/api/stream/$id/url")
    },
) {
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var controller: MediaController? = null
    private var pending: Pair<List<TrackDto>, Int>? = null
    private var pendingSeekMs: Long = 0L
    private var pendingAutoplay: Boolean = true

    private val _state = MutableStateFlow(PlayerUiState())
    val state: StateFlow<PlayerUiState> = _state.asStateFlow()

    private val sleepHandler = Handler(Looper.getMainLooper())
    private var sleepRunnable: Runnable? = null
    private var pauseAtEndOfTrack = false
    private var sleepLabel: String? = null
    private var queueTitle: String = "File d'attente"
    private var shuffleEnabled: Boolean = false
    private var repeatMode: RepeatMode = RepeatMode.Off
    private var userQueueEnd: Int = 0
    private val playerPrefs = context.getSharedPreferences("ytm_player", Context.MODE_PRIVATE)
    private var autoplaySuggestions: Boolean =
        playerPrefs.getBoolean("autoplay_suggestions", true)

    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) {
            syncFrom(player)
        }
    }

    fun connect() {
        ensureService()
        if (controller != null || controllerFuture != null) return
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        val future = MediaController.Builder(context, token).buildAsync()
        controllerFuture = future
        future.addListener({
            runCatching {
                val c = future.get()
                controller = c
                c.addListener(listener)
                applyRepeatShuffle(c)
                syncFrom(c)
                pending?.let { (tracks, idx) ->
                    val seek = pendingSeekMs
                    val auto = pendingAutoplay
                    pending = null
                    pendingSeekMs = 0L
                    pendingAutoplay = true
                    playNow(c, tracks, idx, autoplay = auto, startPositionMs = seek)
                    if (!auto) c.pause()
                    syncFrom(c)
                }
            }
        }, MoreExecutors.directExecutor())
    }

    fun release() {
        clearSleepTimer()
        controller?.removeListener(listener)
        controllerFuture?.let { MediaController.releaseFuture(it) }
        controller = null
        controllerFuture = null
    }

    fun play(
        tracks: List<TrackDto>,
        startIndex: Int = 0,
        title: String? = null,
        /** Fin exclusive file utilisateur ; null = toute la file lancée est « user ». */
        userQueueEnd: Int? = null,
    ) {
        if (title != null) queueTitle = title
        ensureService()
        connect()
        warmAround(tracks, startIndex)
        val playable = tracks.filter { it.isPlayable() }
        this.userQueueEnd = (userQueueEnd ?: playable.size).coerceIn(0, playable.size)
        val c = controller
        if (c != null) {
            playNow(c, tracks, startIndex)
        } else {
            pending = tracks to startIndex
            PlaybackService.Holder.queue = playable
            PlaybackService.Holder.player?.let { exo ->
                exo.playTracks(streamUrl, tracks, startIndex)
                applyRepeatShuffle(exo)
                syncFrom(exo)
            }
        }
    }

    fun toggleAutoplaySuggestions() {
        setAutoplaySuggestions(!autoplaySuggestions)
    }

    fun setAutoplaySuggestions(on: Boolean) {
        autoplaySuggestions = on
        playerPrefs.edit().putBoolean("autoplay_suggestions", on).apply()
        if (!on) {
            val queue = PlaybackService.Holder.queue
            val end = userQueueEnd.coerceIn(0, queue.size).coerceAtLeast(
                (_state.value.queueIndex + 1).coerceAtMost(queue.size),
            )
            val trimmed = queue.take(end)
            userQueueEnd = trimmed.size
            PlaybackService.Holder.queue = trimmed
            val c = player()
            if (c != null && trimmed.isNotEmpty()) {
                val idx = c.currentMediaItemIndex.coerceIn(0, trimmed.lastIndex)
                c.setMediaItems(trimmed.map { mediaItem(it) }, idx, c.currentPosition)
                c.prepare()
                syncFrom(c)
            } else {
                _state.value = _state.value.copy(
                    queue = trimmed,
                    queueSize = trimmed.size,
                    userQueueEnd = userQueueEnd,
                    autoplaySuggestions = false,
                )
            }
            return
        }
        _state.value = _state.value.copy(autoplaySuggestions = true)
    }

    /** Ajoute des suggestions après la file utilisateur (zone auto). */
    fun appendAutoTracks(tracks: List<TrackDto>) {
        if (!autoplaySuggestions) return
        val extra = tracks.filter { it.isPlayable() }
        if (extra.isEmpty()) return
        val c = player() ?: return
        val queue = PlaybackService.Holder.queue.toMutableList()
        val existing = queue.map { it.id }.toHashSet()
        val toAdd = extra.filter { it.id !in existing }.take(80)
        if (toAdd.isEmpty()) return
        if (userQueueEnd <= 0) userQueueEnd = (_state.value.queueIndex + 1).coerceAtMost(queue.size)
        queue.addAll(toAdd)
        PlaybackService.Holder.queue = queue
        toAdd.forEach { c.addMediaItem(mediaItem(it)) }
        warmAround(queue, c.currentMediaItemIndex.coerceAtLeast(0))
        syncFrom(c)
    }

    fun setQueueTitle(title: String) {
        queueTitle = title.ifBlank { "File d'attente" }
        _state.value = _state.value.copy(queueTitle = queueTitle)
    }

    fun toggle() {
        connect()
        val p = player() ?: run {
            // Contrôleur pas encore prêt : bascule via ExoPlayer direct
            val exo = PlaybackService.Holder.player ?: return
            if (exo.isPlaying) exo.pause() else exo.play()
            syncFrom(exo)
            return
        }
        if (p.isPlaying) p.pause() else p.play()
    }

    fun pause() {
        connect()
        player()?.pause() ?: PlaybackService.Holder.player?.pause()
    }

    fun playResume() {
        connect()
        player()?.play() ?: PlaybackService.Holder.player?.play()
    }

    fun skipNext() {
        connect()
        val p = player() ?: PlaybackService.Holder.player ?: return
        // REPEAT_MODE_ONE bloque le next ExoPlayer : on le désactive le temps du saut
        val wasOne = repeatMode == RepeatMode.One
        if (wasOne) p.repeatMode = Player.REPEAT_MODE_OFF
        when {
            p.hasNextMediaItem() -> {
                p.seekToNextMediaItem()
                p.play()
            }
            repeatMode == RepeatMode.All && p.mediaItemCount > 0 -> {
                p.seekTo(0, 0L)
                p.play()
            }
            p.mediaItemCount > 1 -> {
                val next = (p.currentMediaItemIndex + 1) % p.mediaItemCount
                p.seekTo(next, 0L)
                p.play()
            }
            else -> {
                p.seekTo(0L)
                p.play()
            }
        }
        if (wasOne) {
            p.repeatMode = Player.REPEAT_MODE_ONE
            repeatMode = RepeatMode.One
        }
        syncFrom(p)
    }

    /**
     * Précédent YTM :
     * - si position > 3 s → retour début du titre
     * - sinon → titre précédent dans la file
     */
    fun skipPrev() {
        connect()
        val p = player() ?: PlaybackService.Holder.player ?: return
        if (p.currentPosition > 3000L) {
            p.seekTo(0L)
            syncFrom(p)
            return
        }
        val wasOne = repeatMode == RepeatMode.One
        if (wasOne) p.repeatMode = Player.REPEAT_MODE_OFF
        when {
            p.hasPreviousMediaItem() -> {
                p.seekToPreviousMediaItem()
                p.play()
            }
            p.mediaItemCount > 1 -> {
                val prev = if (p.currentMediaItemIndex > 0) p.currentMediaItemIndex - 1 else p.mediaItemCount - 1
                p.seekTo(prev, 0L)
                p.play()
            }
            else -> p.seekTo(0L)
        }
        if (wasOne) {
            p.repeatMode = Player.REPEAT_MODE_ONE
            repeatMode = RepeatMode.One
        }
        syncFrom(p)
    }

    fun skipPrevOrRestart(forcePrevious: Boolean) {
        connect()
        val p = player() ?: PlaybackService.Holder.player ?: return
        if (forcePrevious) {
            val wasOne = repeatMode == RepeatMode.One
            if (wasOne) p.repeatMode = Player.REPEAT_MODE_OFF
            if (p.hasPreviousMediaItem()) {
                p.seekToPreviousMediaItem()
                p.play()
            } else if (p.mediaItemCount > 1) {
                val prev = if (p.currentMediaItemIndex > 0) p.currentMediaItemIndex - 1 else p.mediaItemCount - 1
                p.seekTo(prev, 0L)
                p.play()
            }
            if (wasOne) {
                p.repeatMode = Player.REPEAT_MODE_ONE
                repeatMode = RepeatMode.One
            }
            syncFrom(p)
        } else {
            skipPrev()
        }
    }

    fun seek(ms: Long) {
        player()?.seekTo(ms.coerceAtLeast(0L))
    }

    /** Restaure une file sync (autres appareils) + timecode, sans forcer le play. */
    fun restoreQueue(
        tracks: List<TrackDto>,
        startIndex: Int,
        positionMs: Long,
        autoplay: Boolean,
        title: String? = "File d'attente",
        userQueueEnd: Int? = null,
    ) {
        if (tracks.isEmpty()) return
        if (title != null) queueTitle = title
        this.userQueueEnd = (userQueueEnd ?: tracks.size).coerceIn(0, tracks.size)
        ensureService()
        connect()
        val c = controller ?: PlaybackService.Holder.player
        if (c != null) {
            playNow(c, tracks, startIndex, autoplay = autoplay, startPositionMs = positionMs)
            if (!autoplay) c.pause()
            syncFrom(c)
        } else {
            pending = tracks to startIndex
            pendingSeekMs = positionMs
            pendingAutoplay = autoplay
        }
    }

    fun playAt(index: Int) {
        val p = player() ?: return
        if (index !in PlaybackService.Holder.queue.indices) return
        p.seekTo(index, 0L)
        p.play()
        syncFrom(p)
    }

    fun removeFromQueue(index: Int) {
        val p = player() ?: return
        val queue = PlaybackService.Holder.queue.toMutableList()
        val cur = p.currentMediaItemIndex.coerceAtLeast(0)
        if (index !in queue.indices || index == cur) return
        queue.removeAt(index)
        if (index < userQueueEnd) userQueueEnd = (userQueueEnd - 1).coerceAtLeast(0)
        PlaybackService.Holder.queue = queue
        p.removeMediaItem(index)
        syncFrom(p)
    }

    fun moveInQueue(from: Int, to: Int) {
        val p = player() ?: return
        val queue = PlaybackService.Holder.queue.toMutableList()
        if (from !in queue.indices || to !in queue.indices || from == to) return
        val item = queue.removeAt(from)
        queue.add(to, item)
        if (from < userQueueEnd) userQueueEnd -= 1
        if (to < userQueueEnd) userQueueEnd += 1
        userQueueEnd = userQueueEnd.coerceIn(0, queue.size)
        PlaybackService.Holder.queue = queue
        p.moveMediaItem(from, to)
        syncFrom(p)
    }

    fun toggleShuffle() {
        shuffleEnabled = !shuffleEnabled
        player()?.let {
            it.shuffleModeEnabled = shuffleEnabled
            syncFrom(it)
        } ?: run {
            _state.value = _state.value.copy(shuffle = shuffleEnabled)
        }
    }

    fun cycleRepeat() {
        repeatMode = when (repeatMode) {
            RepeatMode.Off -> RepeatMode.All
            RepeatMode.All -> RepeatMode.One
            RepeatMode.One -> RepeatMode.Off
        }
        player()?.let {
            applyRepeatShuffle(it)
            syncFrom(it)
        } ?: run {
            _state.value = _state.value.copy(repeat = repeatMode)
        }
    }

    fun tick() {
        val p = player() ?: return
        if (pauseAtEndOfTrack) {
            val dur = p.duration
            val pos = p.currentPosition
            if (dur > 0 && pos >= dur - 900) {
                p.pause()
                clearSleepTimer()
            }
        }
        syncFrom(p)
    }

    fun clearSleepTimer() {
        sleepRunnable?.let { sleepHandler.removeCallbacks(it) }
        sleepRunnable = null
        pauseAtEndOfTrack = false
        sleepLabel = null
        player()?.let { syncFrom(it) } ?: run {
            _state.value = _state.value.copy(sleepLabel = null)
        }
    }

    fun setSleepTimer(delayMs: Long?, label: String) {
        clearSleepTimer()
        sleepLabel = label
        if (delayMs == null) {
            pauseAtEndOfTrack = true
            player()?.let { syncFrom(it) } ?: run {
                _state.value = _state.value.copy(sleepLabel = label)
            }
            return
        }
        val r = Runnable {
            player()?.pause()
            clearSleepTimer()
        }
        sleepRunnable = r
        sleepHandler.postDelayed(r, delayMs)
        player()?.let { syncFrom(it) } ?: run {
            _state.value = _state.value.copy(sleepLabel = label)
        }
    }

    fun playNext(track: TrackDto) {
        if (!track.isPlayable()) return
        val c = player() ?: run {
            play(listOf(track), 0)
            return
        }
        val queue = PlaybackService.Holder.queue.toMutableList()
        val idx = c.currentMediaItemIndex.coerceAtLeast(0)
        val insertAt = (idx + 1).coerceAtMost(queue.size)
        queue.add(insertAt, track)
        PlaybackService.Holder.queue = queue
        if (insertAt < userQueueEnd) userQueueEnd += 1
        else userQueueEnd = insertAt + 1
        c.addMediaItem(insertAt, mediaItem(track))
        StreamPrefetcher.warmTrack(ovh.delhomme.ytmusic.BuildConfig.API_BASE_URL, track.id)
        syncFrom(c)
    }

    fun addToQueue(track: TrackDto) {
        if (!track.isPlayable()) return
        val c = player() ?: run {
            play(listOf(track), 0)
            return
        }
        val queue = PlaybackService.Holder.queue.toMutableList()
        val end = userQueueEnd.coerceIn(0, queue.size).coerceAtLeast(
            (c.currentMediaItemIndex + 1).coerceAtMost(queue.size),
        )
        queue.add(end, track)
        userQueueEnd = end + 1
        PlaybackService.Holder.queue = queue
        c.addMediaItem(end, mediaItem(track))
        StreamPrefetcher.warmTrack(ovh.delhomme.ytmusic.BuildConfig.API_BASE_URL, track.id)
        syncFrom(c)
    }

    private fun mediaItem(t: TrackDto): MediaItem =
        MediaItem.Builder()
            .setMediaId(t.id)
            .setUri(streamUrl(t.id))
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(t.title)
                    .setArtist(t.artistLine())
                    .setArtworkUri(t.coverUrl()?.let { android.net.Uri.parse(it) })
                    .build(),
            )
            .build()

    private fun playNow(
        player: Player,
        tracks: List<TrackDto>,
        startIndex: Int,
        autoplay: Boolean = true,
        startPositionMs: Long = 0L,
    ) {
        val playable = tracks.filter { it.isPlayable() }
        if (playable.isEmpty()) return
        val idx = startIndex.coerceIn(0, playable.lastIndex)
        PlaybackService.Holder.queue = playable
        PlaybackService.Holder.index = idx
        if (userQueueEnd <= 0 || userQueueEnd > playable.size) {
            userQueueEnd = playable.size
        }
        warmAround(playable, idx)
        player.setMediaItems(
            playable.map { mediaItem(it) },
            idx,
            startPositionMs.coerceAtLeast(0L),
        )
        applyRepeatShuffle(player)
        player.prepare()
        if (autoplay) player.play() else player.pause()
        syncFrom(player)
    }

    private fun warmAround(tracks: List<TrackDto>, startIndex: Int) {
        val playable = tracks.filter { it.isPlayable() }
        if (playable.isEmpty()) return
        val idx = startIndex.coerceIn(0, playable.lastIndex)
        val base = ovh.delhomme.ytmusic.BuildConfig.API_BASE_URL.trimEnd('/')
        StreamPrefetcher.warmAround(
            base,
            playable.map { it.id },
            idx,
            ahead = 12,
            behind = 2,
        )
    }

    private fun applyRepeatShuffle(player: Player) {
        player.shuffleModeEnabled = shuffleEnabled
        player.repeatMode = when (repeatMode) {
            RepeatMode.Off -> Player.REPEAT_MODE_OFF
            RepeatMode.All -> Player.REPEAT_MODE_ALL
            RepeatMode.One -> Player.REPEAT_MODE_ONE
        }
    }

    private fun player(): Player? = controller ?: PlaybackService.Holder.player

    private fun ensureService() {
        ContextCompat.startForegroundService(context, Intent(context, PlaybackService::class.java))
    }

    private fun syncFrom(player: Player) {
        val queue = PlaybackService.Holder.queue
        val idx = player.currentMediaItemIndex.coerceAtLeast(0)
        val track = queue.getOrNull(idx)
            ?: queue.getOrNull(PlaybackService.Holder.index)
        shuffleEnabled = player.shuffleModeEnabled
        repeatMode = when (player.repeatMode) {
            Player.REPEAT_MODE_ONE -> RepeatMode.One
            Player.REPEAT_MODE_ALL -> RepeatMode.All
            else -> RepeatMode.Off
        }
        _state.value = PlayerUiState(
            track = track,
            playing = player.isPlaying,
            positionMs = player.currentPosition.coerceAtLeast(0),
            durationMs = player.duration.coerceAtLeast(0),
            queueSize = queue.size,
            queueIndex = idx.coerceIn(0, (queue.size - 1).coerceAtLeast(0)),
            queue = queue,
            sleepLabel = sleepLabel,
            shuffle = shuffleEnabled,
            repeat = repeatMode,
            queueTitle = queueTitle,
            userQueueEnd = userQueueEnd.coerceIn(0, queue.size),
            autoplaySuggestions = autoplaySuggestions,
        )
        if (idx in queue.indices) PlaybackService.Holder.index = idx
    }
}
