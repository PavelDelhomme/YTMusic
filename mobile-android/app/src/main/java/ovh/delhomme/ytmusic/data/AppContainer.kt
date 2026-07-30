package ovh.delhomme.ytmusic.data

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.Route
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

    private val refreshLock = Any()

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

    /** Client sans Authenticator (refresh / login) — évite les boucles 401. */
    private val plainClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
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

    private val tokenAuthenticator = Authenticator { _: Route?, response: Response ->
        if (responseCount(response) >= 2) return@Authenticator null
        val path = response.request.url.encodedPath
        if (path.contains("/api/auth/login") ||
            path.contains("/api/auth/register") ||
            path.contains("/api/auth/refresh") ||
            path.contains("/api/auth/passkeys")
        ) {
            return@Authenticator null
        }
        val newToken = synchronized(refreshLock) {
            // Un autre thread a peut-être déjà refresh
            val current = tokenStore.peekAccess()
            val prevAuth = response.request.header("Authorization")
            if (!current.isNullOrBlank() && prevAuth != null && prevAuth != "Bearer $current") {
                return@synchronized current
            }
            runCatching { runBlocking { refreshAccessToken() } }.getOrNull()
        } ?: return@Authenticator null

        response.request.newBuilder()
            .header("Authorization", "Bearer $newToken")
            .build()
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .addInterceptor(authInterceptor)
        .authenticator(tokenAuthenticator)
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
    val httpPlain: OkHttpClient = plainClient

    val apiBaseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/') + "/"

    private val refreshApi: YtMusicApi = Retrofit.Builder()
        .baseUrl(apiBaseUrl)
        .client(plainClient)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()
        .create(YtMusicApi::class.java)

    val api: YtMusicApi = Retrofit.Builder()
        .baseUrl(apiBaseUrl)
        .client(client)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()
        .create(YtMusicApi::class.java)

    fun streamUrl(trackId: String): String =
        // Toujours via proxy API : les URLs googlevideo sont liées à l’IP du serveur
        // (?redirect=1 → 403 depuis le téléphone / autre réseau).
        BuildConfig.API_BASE_URL.trimEnd('/') + "/api/stream/$trackId"

    /** Pré-chauffe le resolve youtubei côté API (piste courante + suivantes). */
    fun warmStreamUrl(trackId: String): String =
        BuildConfig.API_BASE_URL.trimEnd('/') + "/api/stream/$trackId/url"

    /**
     * Refresh JWT via client « plain » (pas d’Authenticator).
     * @return nouvel access token, ou null si échec (session nettoyée).
     */
    private suspend fun refreshAccessToken(): String? {
        val refresh = tokenStore.getRefresh()
        if (refresh.isNullOrBlank()) {
            tokenStore.clear()
            return null
        }
        return try {
            val r = refreshApi.refresh(RefreshBody(refresh))
            tokenStore.saveSession(
                r.token,
                r.refreshToken ?: refresh,
                r.user.email,
                r.user.name,
            )
            r.token
        } catch (_: Exception) {
            tokenStore.clear()
            null
        }
    }

    /**
     * Garde un access token utilisable.
     * Ne se fie PAS uniquement à l’exp JWT (secret API peut avoir changé).
     */
    suspend fun ensureFreshToken(): Boolean {
        tokenStore.warmCache()
        val access = tokenStore.getAccess()
        val refresh = tokenStore.getRefresh()
        if (access.isNullOrBlank() && refresh.isNullOrBlank()) return false

        val ttl = if (!access.isNullOrBlank()) jwtExpiresInMs(access) else -1L
        // Access encore loin de l’expiration → OK (Authenticator rattrape un 401 réel)
        if (ttl > 60_000L) return true

        if (refresh.isNullOrBlank()) {
            if (ttl > 0) return true
            tokenStore.clear()
            return false
        }
        return refreshAccessToken() != null
    }

    /**
     * Validation réelle au démarrage : /api/auth/me doit renvoyer un user.
     * Si le JWT est rejeté (401 silencieux → user null), force un refresh.
     */
    suspend fun validateSession(): Boolean {
        tokenStore.warmCache()
        val access = tokenStore.getAccess()
        val refresh = tokenStore.getRefresh()
        if (access.isNullOrBlank() && refresh.isNullOrBlank()) return false

        val meOk = !access.isNullOrBlank() &&
            runCatching { api.me().user }.getOrNull() != null
        if (meOk) return true

        if (refresh.isNullOrBlank()) {
            tokenStore.clear()
            return false
        }
        if (refreshAccessToken() == null) return false
        return runCatching { api.me().user }.getOrNull() != null
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

        private fun responseCount(response: Response): Int {
            var n = 1
            var prior: Response? = response.priorResponse
            while (prior != null) {
                n++
                prior = prior.priorResponse
            }
            return n
        }
    }
}
