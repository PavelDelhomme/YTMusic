package ovh.delhomme.ytmusic.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.quickAccessStore by preferencesDataStore("ytmusic_quick_access")

/** Pins locaux + sync serveur (`/api/pins`) pour le rayon Accueil « Épinglé ». */
class QuickAccessStore(private val context: Context) {
    private val key = stringPreferencesKey("pins_json")
    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
    private val adapter = moshi.adapter<List<TrackDto>>(
        Types.newParameterizedType(List::class.java, TrackDto::class.java),
    )

    val pins: Flow<List<TrackDto>> = context.quickAccessStore.data.map { prefs ->
        val raw = prefs[key].orEmpty()
        if (raw.isBlank()) emptyList()
        else runCatching { adapter.fromJson(raw).orEmpty() }.getOrDefault(emptyList())
    }

    suspend fun isPinned(id: String): Boolean = pins.first().any { it.id == id }

    suspend fun replaceAll(tracks: List<TrackDto>) {
        context.quickAccessStore.edit { prefs ->
            prefs[key] = adapter.toJson(tracks.take(48))
        }
    }

    /** Charge les pins serveur et remplace le cache local. */
    suspend fun syncFromApi(api: YtMusicApi) {
        val remote = runCatching { api.pins().pins }.getOrDefault(emptyList())
        val tracks = remote.mapNotNull { pin ->
            pin.payload?.copy(id = pin.payload.id.ifBlank { pin.targetId.orEmpty() })
                ?.takeIf { it.id.isNotBlank() }
        }
        if (tracks.isNotEmpty() || remote.isEmpty()) {
            replaceAll(tracks)
        }
    }

    suspend fun toggle(track: TrackDto, api: YtMusicApi? = null): Boolean {
        var nowPinned = false
        context.quickAccessStore.edit { prefs ->
            val current = prefs[key].orEmpty().let { raw ->
                if (raw.isBlank()) emptyList()
                else runCatching { adapter.fromJson(raw).orEmpty() }.getOrDefault(emptyList())
            }.toMutableList()
            val idx = current.indexOfFirst { it.id == track.id }
            if (idx >= 0) {
                current.removeAt(idx)
                nowPinned = false
            } else {
                current.add(0, track)
                nowPinned = true
            }
            prefs[key] = adapter.toJson(current.take(48))
        }
        if (api != null) {
            runCatching {
                if (nowPinned) {
                    api.addPin(
                        mapOf(
                            "kind" to (track.type ?: "song"),
                            "targetId" to track.id,
                            "payload" to track,
                            "id" to track.id,
                        ),
                    )
                } else {
                    api.removePin(track.id)
                }
            }
        }
        return nowPinned
    }
}
