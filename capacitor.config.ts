import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.polymons.player",
  appName: "Polymons",
  webDir: "mobile-dist",
  backgroundColor: "#0c0b12",
  loggingBehavior: "debug",
  zoomEnabled: false,
  android: {
    backgroundColor: "#0c0b12",
    allowMixedContent: false,
    appendUserAgent: " PolymonsAndroid/0.1",
  },
  server: {
    hostname: "localhost",
    androidScheme: "https",
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#0c0b12",
      showSpinner: false,
    },
  },
};

export default config;
