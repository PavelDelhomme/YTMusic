package ovh.delhomme.ytmusic.data

import com.squareup.moshi.FromJson
import com.squareup.moshi.JsonReader
import com.squareup.moshi.JsonWriter
import com.squareup.moshi.ToJson
import kotlin.math.floor

/**
 * Accepte string | number | bool | null pour les champs [String]/[String?].
 * Évite les plantages Moshi quand l’API envoie `duration: 212` (secondes) au lieu de `"3:32"`.
 */
class FlexibleStringAdapter {
    @FromJson
    fun fromJson(reader: JsonReader): String? {
        return when (reader.peek()) {
            JsonReader.Token.NULL -> {
                reader.nextNull<Unit>()
                null
            }
            JsonReader.Token.STRING -> reader.nextString()
            JsonReader.Token.NUMBER -> {
                val n = reader.nextDouble()
                if (n == floor(n) && n.isFinite()) n.toLong().toString() else n.toString()
            }
            JsonReader.Token.BOOLEAN -> reader.nextBoolean().toString()
            else -> {
                reader.skipValue()
                null
            }
        }
    }

    @ToJson
    fun toJson(writer: JsonWriter, value: String?) {
        if (value == null) writer.nullValue() else writer.value(value)
    }
}
