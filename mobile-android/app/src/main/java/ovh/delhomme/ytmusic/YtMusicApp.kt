package ovh.delhomme.ytmusic

import android.app.Application
import ovh.delhomme.ytmusic.data.AppContainer

class YtMusicApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
