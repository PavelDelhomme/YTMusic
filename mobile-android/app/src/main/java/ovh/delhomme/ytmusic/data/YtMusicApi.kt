package ovh.delhomme.ytmusic.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface YtMusicApi {
    @GET("api/health")
    suspend fun health(): Map<String, Any>

    @GET("api/auth/me")
    suspend fun me(): MeResponse

    @POST("api/auth/login")
    suspend fun login(@Body body: LoginBody): AuthResponse

    @POST("api/auth/register")
    suspend fun register(@Body body: RegisterBody): AuthResponse

    @POST("api/auth/refresh")
    suspend fun refresh(@Body body: RefreshBody): AuthResponse

    @POST("api/auth/logout")
    suspend fun logout(@Body body: RefreshBody = RefreshBody(null)): Map<String, Any>

    @GET("api/home")
    suspend fun home(): HomeResponse

    @GET("api/search")
    suspend fun search(
        @Query("q") q: String,
        @Query("filter") filter: String = "all",
    ): SearchResponse

    @GET("api/track/{id}")
    suspend fun track(@Path("id") id: String): TrackInfoResponse
}
