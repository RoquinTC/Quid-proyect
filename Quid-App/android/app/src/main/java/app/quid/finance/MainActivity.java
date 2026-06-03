package app.quid.finance;

import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(QuidBiometricPlugin.class);
        registerPlugin(QuidCalendarPlugin.class);
        registerPlugin(QuidGoogleAuthPlugin.class);
        super.onCreate(savedInstanceState);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(bridge.getWebView(), true);
    }
}
