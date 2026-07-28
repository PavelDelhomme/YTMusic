package ovh.delhomme.ytmusic;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundAudioPlugin.class);
        super.onCreate(savedInstanceState);
        // Autoriser la lecture média sans geste répété + media en arrière-plan
        BridgeActivity self = this;
        self.getBridge().getWebView().post(() -> {
            WebView webView = self.getBridge().getWebView();
            if (webView == null) return;
            WebSettings settings = webView.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.JELLY_BEAN_MR1) {
                settings.setMediaPlaybackRequiresUserGesture(false);
            }
        });
    }
}
