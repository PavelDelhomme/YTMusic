package ovh.delhomme.ytmusic.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("ytmusic_prefs")

class TokenStore(private val context: Context) {
    private val accessKey = stringPreferencesKey("access_token")
    private val refreshKey = stringPreferencesKey("refresh_token")
    private val emailKey = stringPreferencesKey("user_email")
    private val nameKey = stringPreferencesKey("user_name")

    val accessToken: Flow<String?> = context.dataStore.data.map { it[accessKey] }
    val userEmail: Flow<String?> = context.dataStore.data.map { it[emailKey] }

    suspend fun getAccess(): String? = context.dataStore.data.first()[accessKey]
    suspend fun getRefresh(): String? = context.dataStore.data.first()[refreshKey]

    suspend fun saveSession(token: String, refresh: String?, email: String?, name: String?) {
        context.dataStore.edit {
            it[accessKey] = token
            if (refresh != null) it[refreshKey] = refresh
            if (email != null) it[emailKey] = email
            if (name != null) it[nameKey] = name
        }
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
