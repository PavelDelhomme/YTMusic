package ovh.delhomme.ytmusic.debug

import android.content.Context
import android.os.BatteryManager
import android.os.Debug
import java.io.File
import ovh.delhomme.ytmusic.player.PlayerCache
import ovh.delhomme.ytmusic.ui.player.SessionMediaMode

/** Snapshot batterie / mémoire / caches — uniquement quand l’écran debug est ouvert. */
object PerfSnapshot {
    fun capture(context: Context): String {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        val level = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        val currentUa = runCatching {
            bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
        }.getOrNull()
        val rt = Runtime.getRuntime()
        val usedMb = (rt.totalMemory() - rt.freeMemory()) / (1024.0 * 1024.0)
        val maxMb = rt.maxMemory() / (1024.0 * 1024.0)
        val nativeMb = Debug.getNativeHeapAllocatedSize() / (1024.0 * 1024.0)
        val cacheDir = context.cacheDir
        fun dirMb(name: String): String {
            val d = File(cacheDir, name)
            if (!d.exists()) return "$name=0"
            val bytes = d.walkTopDown().filter { it.isFile }.sumOf { it.length() }
            return "$name=${"%.1f".format(bytes / (1024.0 * 1024.0))}Mo"
        }
        val exo = runCatching { PlayerCache.get(context).cacheSpace }.getOrNull()
        val exoMb = if (exo != null) "exoCache=${"%.1f".format(exo / (1024.0 * 1024.0))}Mo" else "exoCache=?"
        return buildString {
            appendLine("battery=${level}% currentUa=${currentUa ?: "?"}")
            appendLine("javaHeap=${"%.1f".format(usedMb)}/${"%.1f".format(maxMb)}Mo native=${"%.1f".format(nativeMb)}Mo")
            appendLine(exoMb)
            appendLine(dirMb("exo-media"))
            appendLine(dirMb("coil-covers"))
            appendLine(dirMb("stream-prefetch"))
            appendLine("videoMode=${SessionMediaMode.video}")
        }
    }
}
