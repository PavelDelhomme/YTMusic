package ovh.delhomme.ytmusic.player

import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import ovh.delhomme.ytmusic.data.TrackDto

class PlaybackService : MediaSessionService() {
    private var player: ExoPlayer? = null
    private var session: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val exo = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                true,
            )
            .setHandleAudioBecomingNoisy(true)
            .build()
        player = exo
        session = MediaSession.Builder(this, exo).build()
        Holder.player = exo
        Holder.service = this
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = player
        if (p == null || !p.playWhenReady || p.mediaItemCount == 0 || p.playbackState == Player.STATE_ENDED) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        session?.release()
        session = null
        player?.release()
        player = null
        Holder.player = null
        Holder.service = null
        super.onDestroy()
    }

    object Holder {
        @Volatile var player: ExoPlayer? = null
        @Volatile var service: PlaybackService? = null
        @Volatile var queue: List<TrackDto> = emptyList()
        @Volatile var index: Int = 0
    }
}

fun ExoPlayer.playTracks(baseStreamUrl: (String) -> String, tracks: List<TrackDto>, startIndex: Int) {
    val playable = tracks.filter { it.isPlayable() }
    if (playable.isEmpty()) return
    val idx = startIndex.coerceIn(0, playable.lastIndex)
    PlaybackService.Holder.queue = playable
    PlaybackService.Holder.index = idx
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
