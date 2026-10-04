package ru.lex.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * The system Back button must walk the web history (React Router) instead
     * of finishing the activity. When there is nothing left to go back to,
     * the app is sent to the background — the standard Android behaviour for
     * a root screen — rather than closing and leaving an empty launcher.
     */
    @Override
    public void onBackPressed() {
        if (getBridge() != null
                && getBridge().getWebView() != null
                && getBridge().getWebView().canGoBack()) {
            getBridge().getWebView().goBack();
            return;
        }
        moveTaskToBack(true);
    }
}