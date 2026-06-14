import { Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export default function UpdateBanner() {
  const [update, setUpdate] = useState<DesktopUpdateState | null>(null);

  useEffect(() => {
    void window.polymons.getUpdateState().then(setUpdate);
    return window.polymons.onUpdateState(setUpdate);
  }, []);

  if (
    !update ||
    ["unsupported", "current", "checking"].includes(update.status)
  ) {
    return null;
  }

  const downloading =
    update.status === "available" || update.status === "downloading";
  return (
    <aside className={`desktop-update-banner ${update.status}`}>
      <div>
        {downloading ? <Download size={17} /> : <RefreshCw size={17} />}
        <span>
          <strong>
            {update.status === "ready"
              ? "Player update ready"
              : update.status === "installing"
                ? "Installing update"
                : update.status === "error"
                  ? "Update check failed"
                  : "Downloading Player update"}
          </strong>
          <small>{update.message}</small>
        </span>
      </div>
      {update.status === "downloading" && update.progress !== null && (
        <progress value={update.progress} max={1} />
      )}
      {update.status === "ready" && (
        <button onClick={() => void window.polymons.installUpdate()}>
          Restart to update
        </button>
      )}
      {update.status === "error" && (
        <button onClick={() => void window.polymons.checkForUpdates()}>
          Try again
        </button>
      )}
    </aside>
  );
}
