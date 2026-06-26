import { Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export default function UpdateBanner() {
  const [update, setUpdate] = useState<DesktopUpdateState | null>(null);

  useEffect(() => {
    void window.polyStudio.getUpdateState().then(setUpdate);
    return window.polyStudio.onUpdateState(setUpdate);
  }, []);

  if (
    !update ||
    ["unsupported", "current", "checking"].includes(update.status)
  ) {
    return null;
  }

  const downloading =
    update.status === "available" || update.status === "downloading";
  const installerReady = update.message.toLowerCase().includes("installer");
  return (
    <aside className={`desktop-update-banner ${update.status}`}>
      <div>
        {downloading ? <Download size={17} /> : <RefreshCw size={17} />}
        <span>
          <strong>
            {update.status === "ready"
              ? "Studio update ready"
              : update.status === "installing"
                ? "Installing update"
                : update.status === "error"
                  ? "Update check failed"
                  : "Downloading Studio update"}
          </strong>
          <small>
            {update.status === "ready"
              ? installerReady
                ? "Save your project, then open the installer."
                : "Save your project, then restart to install."
              : update.message}
          </small>
        </span>
      </div>
      {update.status === "downloading" && update.progress !== null && (
        <progress value={update.progress} max={1} />
      )}
      {update.status === "ready" && (
        <button onClick={() => void window.polyStudio.installUpdate()}>
          {installerReady ? "Open installer" : "Restart to update"}
        </button>
      )}
      {update.status === "error" && (
        <button onClick={() => void window.polyStudio.checkForUpdates()}>
          Try again
        </button>
      )}
    </aside>
  );
}
