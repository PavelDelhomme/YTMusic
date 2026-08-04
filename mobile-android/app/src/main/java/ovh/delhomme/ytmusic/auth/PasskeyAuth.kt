package ovh.delhomme.ytmusic.auth

import android.content.Context
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import ovh.delhomme.ytmusic.BuildConfig

/**
 * Passkeys via Android Credential Manager (pas de WebView).
 * L’origine attendue côté API est WEBAUTHN_ANDROID_ORIGINS (apk-key-hash).
 */
class PasskeyAuth(private val context: Context, private val http: OkHttpClient) {
    private val cm = CredentialManager.create(context)
    private val base = BuildConfig.API_BASE_URL.trimEnd('/')
    private val androidOrigin = BuildConfig.ANDROID_WEBAUTHN_ORIGIN
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    suspend fun login(email: String?): AuthTokens {
        val optionsBody = JSONObject().apply {
            if (!email.isNullOrBlank()) put("email", email.trim())
        }
        val options = withContext(Dispatchers.IO) {
            postJson("/api/auth/passkeys/login/options", optionsBody, authed = false)
        }
        val request = GetCredentialRequest(
            listOf(GetPublicKeyCredentialOption(options.toString())),
        )
        val result = cm.getCredential(context, request)
        val cred = result.credential as? PublicKeyCredential
            ?: error("Réponse passkey invalide")
        val responseJson = JSONObject(cred.authenticationResponseJson)
        val verifyBody = JSONObject().put("credential", responseJson)
        val session = withContext(Dispatchers.IO) {
            postJson("/api/auth/passkeys/login/verify", verifyBody, authed = false)
        }
        return AuthTokens(
            token = session.getString("token"),
            refreshToken = session.optString("refreshToken").ifBlank { null },
            email = session.optJSONObject("user")?.optString("email"),
            name = session.optJSONObject("user")?.optString("name"),
        )
    }

    suspend fun register(accessToken: String, deviceName: String = "Android"): JSONObject {
        val options = withContext(Dispatchers.IO) {
            postJson(
                "/api/auth/passkeys/register/options",
                JSONObject(),
                authed = true,
                bearer = accessToken,
            )
        }
        val createReq = CreatePublicKeyCredentialRequest(options.toString())
        val result = cm.createCredential(context, createReq)
        val response = result as? CreatePublicKeyCredentialResponse
            ?: error("Création passkey invalide")
        val responseJson = JSONObject(response.registrationResponseJson)
        val verifyBody = JSONObject()
            .put("credential", responseJson)
            .put("name", deviceName)
        return withContext(Dispatchers.IO) {
            postJson(
                "/api/auth/passkeys/register/verify",
                verifyBody,
                authed = true,
                bearer = accessToken,
            )
        }
    }

    private fun postJson(
        path: String,
        body: JSONObject,
        authed: Boolean,
        bearer: String? = null,
    ): JSONObject {
        val req = Request.Builder()
            .url("$base$path")
            .header("Content-Type", "application/json")
            .header("Origin", androidOrigin)
            .header("X-Client", "android-kotlin")
            .apply {
                if (authed && !bearer.isNullOrBlank()) header("Authorization", "Bearer $bearer")
            }
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                val err = runCatching { JSONObject(text).optString("error") }.getOrNull()
                error(err?.ifBlank { null } ?: "HTTP ${resp.code}")
            }
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        }
    }
}

data class AuthTokens(
    val token: String,
    val refreshToken: String?,
    val email: String?,
    val name: String?,
)
