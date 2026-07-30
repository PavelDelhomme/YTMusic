package ovh.delhomme.ytmusic.ui.library

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.libraryFilterStore by preferencesDataStore("library_filters")

/** Filtres horizontaux Bibliothèque — masquables localement. */
enum class LibraryFilter(val label: String) {
    Downloads("Téléchargés"),
    Playlists("Playlists"),
    Tracks("Titres"),
    Liked("J'aime"),
    Albums("Albums"),
    Artists("Artistes"),
    Profiles("Profils"),
    Podcasts("Podcasts"),
    Additions("Ajouts"),
    DeviceFiles("Fichiers de l'appareil"),
    ;

    companion object {
        val defaultVisible: Set<String> = entries.map { it.name }.toSet()
        val defaultSelected: LibraryFilter = Additions
    }
}

class LibraryFilterStore(private val context: Context) {
    private val hiddenKey = stringSetPreferencesKey("hidden_filters")

    val hiddenIds: Flow<Set<String>> =
        context.libraryFilterStore.data.map { it[hiddenKey] ?: emptySet() }

    suspend fun hide(filter: LibraryFilter) {
        context.libraryFilterStore.edit { prefs ->
            val cur = prefs[hiddenKey]?.toMutableSet() ?: mutableSetOf()
            cur.add(filter.name)
            prefs[hiddenKey] = cur
        }
    }

    suspend fun resetHidden() {
        context.libraryFilterStore.edit { it.remove(hiddenKey) }
    }
}
