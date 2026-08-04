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
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import ovh.delhomme.ytmusic.BuildConfig
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.UUID
import java.util.concurrent.TimeUnit

class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    /** Pour caches locaux (home, recherche…) hors DataStore. */
    fun sharedPrefs(name: String) =
        appContext.getSharedPreferences(name, Context.MODE_PRIVATE)
    val tokenStore = TokenStore(appContext)
    val quickAccess = QuickAccessStore(appContext)
    val homeCache = HomeCacheStore(appContext)
    private val apiPrefs = appContext.getSharedPreferences("ytm_api", Context.MODE_PRIVATE)

    val deviceId: String by lazy {
        val prefs = appContext.getSharedPreferences("ytm_device", Context.MODE_PRIVATE)
        prefs.getString("id", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("id", it).apply()
        }
    }

    private val devicePrefs by lazy {
        appContext.getSharedPreferences("ytm_device", Context.MODE_PRIVATE)
    }

    /** Sync lecture multi-appareils (publier + recevoir). Défaut false = file locale. */
    fun receiveRemoteSync(): Boolean {
        // Migration one-shot : lectures indépendantes par défaut
        if (!devicePrefs.getBoolean("playback_sync_independent_v1", false)) {
            devicePrefs.edit()
                .putBoolean("receive_remote_sync", false)
                .putBoolean("playback_sync_independent_v1", true)
                .apply()
        }
        return devicePrefs.getBoolean("receive_remote_sync", false)
    }

    fun setReceiveRemoteSync(on: Boolean) {
        devicePrefs.edit()
            .putBoolean("receive_remote_sync", on)
            .putBoolean("playback_sync_independent_v1", true)
            .apply()
    }

    /** Base API sans slash final (override prefs > BuildConfig). */
    fun resolvedApiBase(): String {
        val override = apiPrefs.getString("base_url", null)?.trim()?.trimEnd('/')
        return if (!override.isNullOrBlank()) override else BuildConfig.API_BASE_URL.trimEnd('/')
    }

    fun apiBaseOverride(): String? =
        apiPrefs.getString("base_url", null)?.trim()?.trimEnd('/')?.takeIf { it.isNotBlank() }

    /** Persiste une URL API (ex. http://192.168.1.134:8787). null = reset BuildConfig. */
    fun setApiBaseOverride(url: String?) {
        val cleaned = url?.trim()?.trimEnd('/')?.takeIf { it.isNotBlank() }
        apiPrefs.edit().apply {
            if (cleaned == null) remove("base_url") else putString("base_url", cleaned)
        }.apply()
    }

    private val moshi: Moshi = Moshi.Builder()
        // Avant KotlinJsonAdapterFactory : duration (et autres) string|number
        .add(FlexibleStringAdapter())
        .add(KotlinJsonAdapterFactory())
        .build()

    private val refreshLock = Any()

    private val rewriteHost = Interceptor { chain ->
        val preferred = (resolvedApiBase() + "/").toHttpUrlOrNull()
            ?: return@Interceptor chain.proceed(chain.request())
        val req = chain.request()
        val nextUrl = req.url.newBuilder()
            .scheme(preferred.scheme)
            .host(preferred.host)
            .port(preferred.port)
            .build()
        chain.proceed(req.newBuilder().url(nextUrl).build())
    }

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
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .addInterceptor(rewriteHost)
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
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .addInterceptor(rewriteHost)
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

    val apiBaseUrl: String
        get() = resolvedApiBase().trimEnd('/') + "/"

    private val refreshApi: YtMusicApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL.trimEnd('/') + "/")
        .client(plainClient)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()
        .create(YtMusicApi::class.java)

    val api: YtMusicApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL.trimEnd('/') + "/")
        .client(client)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()
        .create(YtMusicApi::class.java)

    fun streamUrl(trackId: String): String {
        // Toujours via proxy API : les URLs googlevideo sont liées à l’IP du serveur
        // (?redirect=1 → 403 depuis le téléphone / autre réseau).
        val base = resolvedApiBase() + "/api/stream/$trackId"
        val token = tokenStore.peekAccess()
        return if (!token.isNullOrBlank()) {
            "$base?access_token=${java.net.URLEncoder.encode(token, Charsets.UTF_8.name())}"
        } else {
            base
        }
    }

    /** Pré-chauffe le resolve youtubei côté API (piste courante + suivantes). */
    fun warmStreamUrl(trackId: String): String =
        resolvedApiBase() + "/api/stream/$trackId/url"

    /** Ping /api/health sur l’URL courante (ou une URL candidate). */
    suspend fun probeApiHealth(baseUrl: String? = null): Result<String> {
        val base = (baseUrl ?: resolvedApiBase()).trimEnd('/')
        return runCatching {
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                val probeClient = OkHttpClient.Builder()
                    .connectTimeout(8, TimeUnit.SECONDS)
                    .readTimeout(8, TimeUnit.SECONDS)
                    .build()
                val req = okhttp3.Request.Builder()
                    .url("$base/api/health")
                    .get()
                    .build()
                probeClient.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) error("HTTP ${resp.code}")
                    resp.body?.string()?.take(180) ?: "ok"
                }
            }
        }
    }

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
