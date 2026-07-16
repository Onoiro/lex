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
};

export default config;