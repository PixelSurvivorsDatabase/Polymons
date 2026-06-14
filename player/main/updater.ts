import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, open, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";

const RELEASE_API =
  "https://api.github.com/repos/PixelSurvivorsDatabase/Polymons/releases/latest";

export type UpdateState = {
  status:
    | "unsupported"
    | "checking"
    | "current"
    | "available"
    | "downloading"
    | "ready"
    | "installing"
    | "error";
  version: string | null;
  publishedAt: string | null;
  progress: number | null;
  message: string;
};

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  digest?: string | null;
  size: number;
};

type ReleaseResponse = {
  tag_name: string;
  published_at: string;
  assets: ReleaseAsset[];
};

type UpdaterConfig = {
  assetName: string;
  productName: string;
};

function broadcast(state: UpdateState) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("updates:state", state);
  }
}

async function fileSha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function assetDigest(asset: ReleaseAsset): string | null {
  const match = asset.digest?.match(/^sha256:([a-f0-9]{64})$/i);
  return match?.[1].toLowerCase() ?? null;
}

function runningExecutable(): string {
  return resolve(process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath);
}

export function registerUpdater(config: UpdaterConfig) {
  let state: UpdateState = {
    status: app.isPackaged && process.platform === "win32"
      ? "current"
      : "unsupported",
    version: null,
    publishedAt: null,
    progress: null,
    message:
      app.isPackaged && process.platform === "win32"
        ? "Updates are checked automatically."
        : "Updates are available in packaged Windows builds.",
  };
  let pendingDownload: { path: string; digest: string } | null = null;
  let checkPromise: Promise<UpdateState> | null = null;

  const updateState = (patch: Partial<UpdateState>) => {
    state = { ...state, ...patch };
    broadcast(state);
    return state;
  };

  const download = async (
    asset: ReleaseAsset,
    digest: string,
    version: string,
    publishedAt: string,
  ) => {
    const destination = join(
      app.getPath("temp"),
      `polymons-${basename(config.assetName, ".exe")}-${digest.slice(0, 12)}.exe`,
    );
    const response = await fetch(asset.browser_download_url, {
      headers: { "User-Agent": "Polymons-Updater" },
      redirect: "follow",
    });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed with status ${response.status}.`);
    }
    const handle = await open(destination, "w");
    const hash = createHash("sha256");
    let received = 0;
    let lastReportedProgress = -1;
    try {
      for await (const chunk of response.body) {
        const data = Buffer.from(chunk);
        await handle.write(data);
        hash.update(data);
        received += data.length;
        const progress =
          asset.size > 0 ? Math.min(1, received / asset.size) : null;
        if (
          progress === null ||
          progress === 1 ||
          progress - lastReportedProgress >= 0.01
        ) {
          lastReportedProgress = progress ?? lastReportedProgress;
          updateState({
            status: "downloading",
            version,
            publishedAt,
            progress,
            message: `Downloading ${config.productName} update...`,
          });
        }
      }
    } finally {
      await handle.close();
    }
    if (hash.digest("hex") !== digest) {
      await unlink(destination).catch(() => undefined);
      throw new Error("The downloaded update did not pass verification.");
    }
    pendingDownload = { path: destination, digest };
    return updateState({
      status: "ready",
      version,
      publishedAt,
      progress: 1,
      message: "Update downloaded. Restart when you are ready.",
    });
  };

  const check = async (autoDownload = true): Promise<UpdateState> => {
    if (checkPromise) return checkPromise;
    checkPromise = (async () => {
      if (!app.isPackaged || process.platform !== "win32") return state;
      updateState({
        status: "checking",
        progress: null,
        message: "Checking for updates...",
      });
      try {
        const response = await fetch(RELEASE_API, {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "Polymons-Updater",
          },
        });
        if (!response.ok) {
          throw new Error(`Update check failed with status ${response.status}.`);
        }
        const release = (await response.json()) as ReleaseResponse;
        const asset = release.assets.find(
          (candidate) => candidate.name === config.assetName,
        );
        if (!asset) throw new Error(`${config.assetName} is missing from the release.`);
        const digest = assetDigest(asset);
        if (!digest) throw new Error("The release is missing its SHA-256 digest.");
        const currentDigest = await fileSha256(runningExecutable());
        if (currentDigest === digest) {
          pendingDownload = null;
          return updateState({
            status: "current",
            version: release.tag_name,
            publishedAt: release.published_at,
            progress: null,
            message: `${config.productName} is up to date.`,
          });
        }
        updateState({
          status: "available",
          version: release.tag_name,
          publishedAt: release.published_at,
          progress: null,
          message: "A new update is available.",
        });
        return autoDownload
          ? await download(asset, digest, release.tag_name, release.published_at)
          : state;
      } catch (error) {
        return updateState({
          status: "error",
          progress: null,
          message:
            error instanceof Error ? error.message : "Could not check for updates.",
        });
      } finally {
        checkPromise = null;
      }
    })();
    return checkPromise;
  };

  const install = async () => {
    if (state.status === "installing") return state;
    if (!pendingDownload) {
      await check(true);
      if (!pendingDownload) return state;
    }
    const target = runningExecutable();
    const pending = pendingDownload;
    try {
      await access(pending.path);
      await access(target);
    } catch {
      pendingDownload = null;
      return updateState({
        status: "error",
        progress: null,
        message: "The downloaded update is no longer available. Check again.",
      });
    }
    const scriptPath = join(
      app.getPath("temp"),
      `polymons-updater-${process.pid}-${Date.now()}.ps1`,
    );
    const script = String.raw`param(
  [int]$ProcessId,
  [string]$Source,
  [string]$Target,
  [string]$ProductName,
  [string]$ScriptPath,
  [string]$ExpectedDigest,
  [string]$WorkingDirectory
)
$ErrorActionPreference = "Stop"
$backup = "$Target.old"
$replacement = "$Target.new"
$installed = $false
$lastError = $null
try {
  Wait-Process -Id $ProcessId -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 1000
  for ($attempt = 1; $attempt -le 120; $attempt++) {
    try {
      if (Test-Path -LiteralPath $Target) {
        $targetDigest = (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($targetDigest -eq $ExpectedDigest) {
          $installed = $true
          break
        }
      }

      Remove-Item -LiteralPath $replacement -Force -ErrorAction SilentlyContinue
      Copy-Item -LiteralPath $Source -Destination $replacement -Force
      $replacementDigest = (Get-FileHash -LiteralPath $replacement -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($replacementDigest -ne $ExpectedDigest) {
        throw "The replacement executable failed verification."
      }

      if (Test-Path -LiteralPath $backup) {
        Remove-Item -LiteralPath $backup -Force
      }
      if (Test-Path -LiteralPath $Target) {
        Move-Item -LiteralPath $Target -Destination $backup -Force
      }
      Move-Item -LiteralPath $replacement -Destination $Target -Force
      $targetDigest = (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($targetDigest -ne $ExpectedDigest) {
        throw "The installed executable failed verification."
      }
      $installed = $true
      break
    } catch {
      $lastError = $_
      if ((Test-Path -LiteralPath $backup) -and -not (Test-Path -LiteralPath $Target)) {
        Move-Item -LiteralPath $backup -Destination $Target -Force -ErrorAction SilentlyContinue
      }
      Remove-Item -LiteralPath $replacement -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not $installed) {
    if ($lastError) { throw $lastError }
    throw "Windows did not release the current executable in time."
  }

  Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $Source -Force -ErrorAction SilentlyContinue
  Start-Process -FilePath $Target -WorkingDirectory $WorkingDirectory
} catch {
  if ((Test-Path -LiteralPath $backup) -and -not (Test-Path -LiteralPath $Target)) {
    Move-Item -LiteralPath $backup -Destination $Target -Force -ErrorAction SilentlyContinue
  }
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    ("The update could not be installed. Please download $ProductName again." +
      [Environment]::NewLine + [Environment]::NewLine + $_.Exception.Message),
    "$ProductName update failed"
  ) | Out-Null
} finally {
  Remove-Item -LiteralPath $replacement -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $ScriptPath -Force -ErrorAction SilentlyContinue
}
`;
    await writeFile(scriptPath, script, "utf8");
    updateState({
      status: "installing",
      progress: 1,
      message: "Restarting to install the update...",
    });
    let child: ReturnType<typeof spawn>;
    try {
      child = await new Promise<ReturnType<typeof spawn>>((resolve, reject) => {
        const childProcess = spawn(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-File",
            scriptPath,
            process.pid.toString(),
            pending.path,
            target,
            config.productName,
            scriptPath,
            pending.digest,
            dirname(target),
          ],
          { detached: true, stdio: "ignore", windowsHide: true },
        );
        childProcess.once("spawn", () => resolve(childProcess));
        childProcess.once("error", reject);
      });
    } catch (error) {
      await unlink(scriptPath).catch(() => undefined);
      return updateState({
        status: "error",
        progress: null,
        message:
          error instanceof Error
            ? `Could not start the updater: ${error.message}`
            : "Could not start the updater.",
      });
    }
    child.unref();
    setTimeout(() => app.exit(0), 500);
    return state;
  };

  ipcMain.handle("updates:get", () => state);
  ipcMain.handle("updates:check", () => check(true));
  ipcMain.handle("updates:install", install);

  return {
    checkAutomatically: () => void check(true),
  };
}
