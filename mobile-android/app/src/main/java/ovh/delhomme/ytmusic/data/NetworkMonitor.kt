package ovh.delhomme.ytmusic.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Handler
import android.os.Looper
import ovh.delhomme.ytmusic.player.PlaybackService
import ovh.delhomme.ytmusic.player.StreamPrefetcher
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Surveille la connectivité :
 * - hors ligne → coupe le prefetch (économie batterie)
 * - retour en ligne → clear circuit-breaker stream + reprend la lecture si on était en pause réseau
 */
object NetworkMonitor {
    private val started = AtomicBoolean(false)
    @Volatile
    private var online = true
    @Volatile
    private var pausedForNetwork = false
    private val main = Handler(Looper.getMainLooper())

    fun isOnline(): Boolean = online

    fun markPausedForNetwork() {
        pausedForNetwork = true
    }

    fun start(context: Context) {
        if (!started.compareAndSet(false, true)) return
        val app = context.applicationContext
        val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return
        online = cm.activeNetwork?.let { net ->
            cm.getNetworkCapabilities(net)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        } == true

        val req = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        runCatching {
            cm.registerNetworkCallback(
                req,
                object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) {
                        val wasOffline = !online
                        online = true
                        if (wasOffline) onBackOnline()
                    }

                    override fun onLost(network: Network) {
                        // Vérifie qu’il ne reste pas un autre réseau
                        val still = cm.activeNetwork?.let { n ->
                            cm.getNetworkCapabilities(n)
                                ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
                        } == true
                        if (!still) {
                            online = false
                            onGoneOffline()
                        }
                    }
                },
            )
        }
    }

    private fun onGoneOffline() {
        StreamPrefetcher.cancelIdle()
        StreamPrefetcher.markStreamDown(pauseMs = 120_000L)
    }

    private fun onBackOnline() {
        StreamPrefetcher.markStreamOk()
        main.post {
            val exo = PlaybackService.Holder.player ?: return@post
            if (!pausedForNetwork) return@post
            pausedForNetwork = false
            runCatching {
                if (exo.mediaItemCount > 0 && !exo.isPlaying) {
                    exo.prepare()
                    exo.playWhenReady = true
                    exo.play()
                }
            }
        }
    }
}
