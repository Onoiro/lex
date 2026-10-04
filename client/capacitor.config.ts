import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ru.lex.app",
  appName: "Lex",
  webDir: "dist",
  backgroundColor: "#ffffff",
  android: {
    backgroundColor: "#ffffff",
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#ffffff",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      style: "DEFAULT",
      backgroundColor: "#1095C1",
      // Keep the WebView below the status bar. With the default (true) the
      // WebView is drawn under the system bar, and Capacitor's SystemBars
      // plugin only injects a non-zero --safe-area-inset-top on Android 15+
      // (or with WebView >= 140), so on older devices the content was clipped.
      overlaysWebView: false,
    },
  },
};

export default config;