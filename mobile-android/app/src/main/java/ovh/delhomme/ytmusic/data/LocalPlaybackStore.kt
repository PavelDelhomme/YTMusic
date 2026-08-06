package ovh.delhomme.ytmusic.data

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory

/**
 * Persistance locale file + position (survit force-stop / kill process).
 * Indépendant de la sync multi-appareils.
 */
class LocalPlaybackStore(
    context: Context,
    moshi: Moshi = Moshi.Builder()
        .add(FlexibleStringAdapter())
        .add(KotlinJsonAdapterFactory())
        .build(),
) {
    private val prefs = context.applicationContext.getSharedPreferences("ytm_player", Context.MODE_PRIVATE)
    private val listType = Types.newParameterizedType(List::class.java, TrackDto::class.java)
    private val queueAdapter = moshi.adapter<List<TrackDto>>(listType)

    data class Snapshot(
        val queue: List<TrackDto>,
        val queueIndex: Int,
        val positionMs: Long,
        val userQueueEnd: Int,
        val queueTitle: String,
        val wasPlaying: Boolean,
    )

    fun save(snapshot: Snapshot) {
        if (snapshot.queue.isEmpty()) {
            clear()
            return
        }
        val playable = snapshot.queue.filter { it.isPlayable() }
        if (playable.isEmpty()) {
            clear()
            return
        }
        val idx = snapshot.queueIndex.coerceIn(0, playable.lastIndex)
        runCatching {
            prefs.edit()
                .putString(KEY_QUEUE, queueAdapter.toJson(playable.take(120)))
                .putInt(KEY_INDEX, idx)
                .putLong(KEY_POS, snapshot.positionMs.coerceAtLeast(0L))
                .putInt(KEY_USER_END, snapshot.userQueueEnd.coerceIn(0, playable.size))
                .putString(KEY_TITLE, snapshot.queueTitle.ifBlank { "File d'attente" })
                .putBoolean(KEY_PLAYING, snapshot.wasPlaying)
                .putLong(KEY_SAVED_AT, System.currentTimeMillis())
                .apply()
        }
    }

    fun load(): Snapshot? {
        val raw = prefs.getString(KEY_QUEUE, null) ?: return null
        val queue = runCatching { queueAdapter.fromJson(raw).orEmpty() }
            .getOrDefault(emptyList())
            .filter { it.isPlayable() }
        if (queue.isEmpty()) return null
        val idx = prefs.getInt(KEY_INDEX, 0).coerceIn(0, queue.lastIndex)
        return Snapshot(
            queue = queue,
            queueIndex = idx,
            positionMs = prefs.getLong(KEY_POS, 0L).coerceAtLeast(0L),
            userQueueEnd = prefs.getInt(KEY_USER_END, queue.size).coerceIn(0, queue.size),
            queueTitle = prefs.getString(KEY_TITLE, null)?.ifBlank { null } ?: "File d'attente",
            wasPlaying = prefs.getBoolean(KEY_PLAYING, false),
        )
    }

    fun clear() {
        prefs.edit()
            .remove(KEY_QUEUE)
            .remove(KEY_INDEX)
            .remove(KEY_POS)
            .remove(KEY_USER_END)
            .remove(KEY_TITLE)
            .remove(KEY_PLAYING)
            .remove(KEY_SAVED_AT)
            .apply()
    }

    companion object {
        private const val KEY_QUEUE = "local_queue_json"
        private const val KEY_INDEX = "local_queue_index"
        private const val KEY_POS = "local_position_ms"
        private const val KEY_USER_END = "local_user_queue_end"
        private const val KEY_TITLE = "local_queue_title"
        private const val KEY_PLAYING = "local_was_playing"
        private const val KEY_SAVED_AT = "local_saved_at"
    }
}
