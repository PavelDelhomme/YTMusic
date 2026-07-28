package ovh.delhomme.ytmusic.player

import android.content.ComponentName
import android.content.Context
import android.content.Intent
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

data class PlayerUiState(
    val track: TrackDto? = null,
    val playing: Boolean = false,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val queueSize: Int = 0,
)

/** Pont UI ↔ Media3 PlaybackService (lecture arrière-plan). */
class PlayerController(
    private val context: Context,
    private val streamUrl: (String) -> String,
) {
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var controller: MediaController? = null
    private var pending: Pair<List<TrackDto>, Int>? = null

    private val _state = MutableStateFlow(PlayerUiState())
    val state: StateFlow<PlayerUiState> = _state.asStateFlow()

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
                syncFrom(c)
                pending?.let { (tracks, idx) ->
                    pending = null
                    playNow(c, tracks, idx)
                }
            }
        }, MoreExecutors.directExecutor())
    }

    fun release() {
        controller?.removeListener(listener)
        controllerFuture?.let { MediaController.releaseFuture(it) }
        controller = null
        controllerFuture = null
    }

    fun play(tracks: List<TrackDto>, startIndex: Int = 0) {
        ensureService()
        connect()
        val c = controller
        if (c != null) {
            playNow(c, tracks, startIndex)
        } else {
            pending = tracks to startIndex
            PlaybackService.Holder.player?.let { exo ->
                exo.playTracks(streamUrl, tracks, startIndex)
                syncFrom(exo)
            }
        }
    }

    fun toggle() {
        val p = player() ?: return
        if (p.isPlaying) p.pause() else p.play()
    }

    fun skipNext() {
        player()?.seekToNextMediaItem()
    }

    fun skipPrev() {
        player()?.seekToPreviousMediaItem()
    }

    fun seek(ms: Long) {
        player()?.seekTo(ms)
    }

    fun tick() {
        player()?.let { syncFrom(it) }
    }

    private fun playNow(player: Player, tracks: List<TrackDto>, startIndex: Int) {
        val playable = tracks.filter { it.isPlayable() }
        if (playable.isEmpty()) return
        val idx = startIndex.coerceIn(0, playable.lastIndex)
        PlaybackService.Holder.queue = playable
        PlaybackService.Holder.index = idx
        val items = playable.map { t ->
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
        }
        player.setMediaItems(items, idx, 0L)
        player.prepare()
        player.play()
        syncFrom(player)
    }

    private fun player(): Player? = controller ?: PlaybackService.Holder.player

    private fun ensureService() {
        context.startService(Intent(context, PlaybackService::class.java))
    }

    private fun syncFrom(player: Player) {
        val queue = PlaybackService.Holder.queue
        val idx = player.currentMediaItemIndex.coerceAtLeast(0)
        val track = queue.getOrNull(idx)
            ?: queue.getOrNull(PlaybackService.Holder.index)
        _state.value = PlayerUiState(
            track = track,
            playing = player.isPlaying,
            positionMs = player.currentPosition.coerceAtLeast(0),
            durationMs = player.duration.coerceAtLeast(0),
            queueSize = queue.size,
        )
        if (idx in queue.indices) PlaybackService.Holder.index = idx
    }
}
