export function registerPolymonsServiceWorker() {
  if (
    !import.meta.env.PROD ||
    import.meta.env.MODE === "android" ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js", { scope: "./" }).then(
      (registration) => registration.update(),
      (error: unknown) => {
        console.warn("Polymons offline support could not start.", error);
      },
    );
  });
}
