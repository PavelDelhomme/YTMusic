package ovh.delhomme.ytmusic;

import android.content.Intent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundAudio")
public class BackgroundAudioPlugin extends Plugin {

    @PluginMethod
    public void enable(PluginCall call) {
        String title = call.getString("title", "PLM");
        String artist = call.getString("artist", "Lecture en cours");
        Intent intent = new Intent(getContext(), MusicKeepAliveService.class);
        intent.putExtra(MusicKeepAliveService.EXTRA_TITLE, title);
        intent.putExtra(MusicKeepAliveService.EXTRA_ARTIST, artist);
        ContextCompat.startForegroundService(getContext(), intent);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void update(PluginCall call) {
        enable(call);
    }

    @PluginMethod
    public void disable(PluginCall call) {
        Intent intent = new Intent(getContext(), MusicKeepAliveService.class);
        getContext().stopService(intent);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }
}
