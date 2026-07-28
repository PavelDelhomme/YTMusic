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
        val token = runBlocking { tokenStore.getAccess() }
        val req = chain.request().newBuilder()
            .header("X-Device-Id", deviceId)
            .apply {
                if (!token.isNullOrBlank()) header("Authorization", "Bearer $token")
            }
            .build()
        chain.proceed(req)
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .addInterceptor(authInterceptor)
        .addInterceptor(
            HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BASIC
            },
        )
        .build()

    val apiBaseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/') + "/"

    val api: YtMusicApi = Retrofit.Builder()
        .baseUrl(apiBaseUrl)
        .client(client)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()
        .create(YtMusicApi::class.java)

    fun streamUrl(trackId: String): String =
        BuildConfig.API_BASE_URL.trimEnd('/') + "/api/stream/$trackId"

    suspend fun ensureFreshToken(): Boolean {
        val refresh = tokenStore.getRefresh() ?: return tokenStore.getAccess() != null
        return try {
            val r = api.refresh(RefreshBody(refresh))
            tokenStore.saveSession(r.token, r.refreshToken ?: refresh, r.user.email, r.user.name)
            true
        } catch (_: Exception) {
            false
        }
    }
}
