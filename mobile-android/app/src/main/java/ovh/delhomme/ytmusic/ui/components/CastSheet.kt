package ovh.delhomme.ytmusic.ui.components

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ovh.delhomme.ytmusic.data.AppContainer
import ovh.delhomme.ytmusic.data.DeviceDto

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CastSheet(
    container: AppContainer,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var devices by remember { mutableStateOf<List<DeviceDto>>(emptyList()) }
    var activeId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        runCatching { container.api.session() }
            .onSuccess {
                devices = it.devices
                activeId = it.activePlayerId
            }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Text(
            "Caster",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
        )
        Text(
            "Choisir où lire la musique",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 20.dp),
        )
        Spacer(Modifier.height(12.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f))

        Row(
            Modifier
                .fillMaxWidth()
                .clickable {
                    Toast.makeText(context, "Lecture sur cet appareil", Toast.LENGTH_SHORT).show()
                    onDismiss()
                }
                .padding(horizontal = 20.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Default.PhoneAndroid, null)
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text("Cet appareil", fontWeight = FontWeight.Medium)
                Text(
                    "Android · ${container.deviceId.take(8)}…",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(Icons.Default.Check, null, tint = MaterialTheme.colorScheme.primary)
        }

        if (devices.isEmpty()) {
            Text(
                "Aucun autre appareil connecté pour le moment. Ouvre YTMusic sur le web ou un autre client pour caster.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(20.dp),
            )
        } else {
            devices.filter { it.id != container.deviceId }.forEach { d ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable {
                            Toast.makeText(
                                context,
                                "Cast vers « ${d.name} » — ouvre la session sur cet appareil",
                                Toast.LENGTH_LONG,
                            ).show()
                            onDismiss()
                        }
                        .padding(horizontal = 20.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        if (d.type == "tv" || d.type == "desktop") Icons.Default.Tv else Icons.Default.Cast,
                        null,
                    )
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        Text(d.name, fontWeight = FontWeight.Medium)
                        Text(
                            d.type ?: "appareil",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (d.id == activeId || d.isActive == true) {
                        Icon(Icons.Default.Check, null, tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}
