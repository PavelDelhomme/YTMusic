package ovh.delhomme.ytmusic.data

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import ovh.delhomme.ytmusic.BuildConfig
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.UUID
import java.util.concurrent.TimeUnit

class AppContainer(context: Context) {
    val tokenStore = TokenStore(context.applicationContext)
    val quickAccess = QuickAccessStore(context.applicationContext)
    val deviceId: String by lazy {
        val prefs = context.getSharedPreferences("ytm_device", Context.MODE_PRIVATE)
        prefs.getString("id", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("id", it).apply()
        }
    }

    private val moshi: Moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    private val authInterceptor = Interceptor { chain ->
        // Cache mémoire d’abord — évite runBlocking DataStore à chaque heartbeat
        val token = tokenStore.peekAccess()
            ?: runCatching { runBlocking { tokenStore.getAccess() } }.getOrNull()
        val req = chain.request().newBuilder()
            .header("X-Device-Id", deviceId)
            .header("X-Device-Name", android.os.Build.MODEL ?: "Android")
            .apply {
                if (!token.isNullOrBlank()) header("Authorization", "Bearer $token")
            }
            .build()
        chain.proceed(req)
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .addInterceptor(authInterceptor)
        .addInterceptor(
            HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) {
                    HttpLoggingInterceptor.Level.BASIC
                } else {
                    HttpLoggingInterceptor.Level.NONE
                }
            },
        )
        .build()

    /** Client sans auth interceptor (passkeys login). */
    val httpPlain: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    val apiBaseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/') + "/"

    val api: YtMusicApi = Retrofit.Builder()
        .baseUrl(apiBaseUrl)
        .client(client)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()
        .create(YtMusicApi::class.java)

    fun streamUrl(trackId: String): String =
        // redirect=1 → 302 googlevideo (sans proxy Node) pour un démarrage plus rapide
        BuildConfig.API_BASE_URL.trimEnd('/') + "/api/stream/$trackId?redirect=1"

    /** Pré-chauffe le resolve youtubei côté API (piste courante + suivantes). */
    fun warmStreamUrl(trackId: String): String =
        BuildConfig.API_BASE_URL.trimEnd('/') + "/api/stream/$trackId/url"

    suspend fun ensureFreshToken(): Boolean {
        val access = tokenStore.getAccess()
        val refresh = tokenStore.getRefresh()
        if (refresh.isNullOrBlank()) return !access.isNullOrBlank()
        // Ne refresh que si l’access est absent ou proche de l’expiration (~2 jours)
        if (!access.isNullOrBlank() && jwtExpiresInMs(access) > 2L * 24 * 3600 * 1000) {
            return true
        }
        return try {
            val r = api.refresh(RefreshBody(refresh))
            tokenStore.saveSession(r.token, r.refreshToken ?: refresh, r.user.email, r.user.name)
            true
        } catch (_: Exception) {
            // Garde la session si l’access est encore valide
            !access.isNullOrBlank() && jwtExpiresInMs(access) > 0
        }
    }

    companion object {
        /** Decode JWT exp sans vérif crypto (indicatif client). */
        fun jwtExpiresInMs(jwt: String): Long {
            return try {
                val parts = jwt.split('.')
                if (parts.size < 2) return 0L
                val padded = parts[1]
                    .replace('-', '+')
                    .replace('_', '/')
                    .let {
                        val rem = it.length % 4
                        if (rem == 0) it else it + "=".repeat(4 - rem)
                    }
                val json = String(android.util.Base64.decode(padded, android.util.Base64.DEFAULT))
                val exp = Regex("\"exp\"\\s*:\\s*(\\d+)").find(json)?.groupValues?.get(1)?.toLongOrNull()
                    ?: return 0L
                exp * 1000L - System.currentTimeMillis()
            } catch (_: Exception) {
                0L
            }
        }
    }
}
