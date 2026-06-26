import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

export async function initializeNativeMobileShell() {
  if (!Capacitor.isNativePlatform()) return;

  document.documentElement.classList.add("polymons-native-app");

  await Promise.allSettled([
    StatusBar.setStyle({ style: Style.Light }),
    StatusBar.setBackgroundColor({ color: "#0c0b12" }),
    StatusBar.setOverlaysWebView({ overlay: false }),
    SplashScreen.hide(),
  ]);

  window.addEventListener("polymons:game-mode", (event) => {
    const active = (event as CustomEvent<{ active?: boolean }>).detail?.active;
    void (active ? StatusBar.hide() : StatusBar.show());
  });

  await NativeApp.addListener("backButton", ({ canGoBack }) => {
    if (document.querySelector(".baseplate-player")) {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
      );
      return;
    }
    if (canGoBack) {
      window.history.back();
      return;
    }
    void NativeApp.minimizeApp();
  });

  await NativeApp.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      window.setTimeout(() => window.dispatchEvent(new Event("online")), 350);
    }
  });
}
