import { randomUUID } from "node:crypto";
import { Socket, createConnection } from "node:net";
import { join } from "node:path";

const DISCORD_CLIENT_ID =
  process.env.POLYMONS_DISCORD_CLIENT_ID?.trim() ||
  "PUT_DISCORD_CLIENT_ID_HERE";

type DiscordActivity = {
  details?: string;
  state?: string;
  timestamps?: { start?: number; end?: number };
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
  buttons?: Array<{ label: string; url: string }>;
};

export type PolymonsPresence =
  | {
      kind: "idle";
      details?: string;
      state?: string;
    }
  | {
      kind: "playing";
      gameTitle: string;
      playerCount?: number;
      gameUrl?: string;
    }
  | {
      kind: "studio-test";
      projectName: string;
    };

function discordPipePath(index: number): string {
  if (process.platform === "win32") return `\\\\?\\pipe\\discord-ipc-${index}`;
  const runtime =
    process.env.XDG_RUNTIME_DIR ||
    process.env.TMPDIR ||
    process.env.TMP ||
    process.env.TEMP ||
    "/tmp";
  return join(runtime, `discord-ipc-${index}`);
}

function writeFrame(socket: Socket, op: number, payload: unknown) {
  const data = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(data.length, 4);
  socket.write(Buffer.concat([header, data]));
}

function activityForPresence(presence: PolymonsPresence): DiscordActivity {
  const startedAt = Math.floor(Date.now() / 1000);
  if (presence.kind === "playing") {
    return {
      details: presence.gameTitle,
      state:
        typeof presence.playerCount === "number"
          ? `${presence.playerCount.toLocaleString()} playing`
          : "Playing a game",
      timestamps: { start: startedAt },
      assets: {
        large_image: "polymons_logo",
        large_text: "Polymons",
        small_image: "playing_game",
        small_text: "In game",
      },
      buttons: presence.gameUrl
        ? [{ label: "View Game", url: presence.gameUrl }]
        : undefined,
    };
  }
  if (presence.kind === "studio-test") {
    return {
      details: presence.projectName,
      state: "Local Studio playtest",
      timestamps: { start: startedAt },
      assets: {
        large_image: "polymons_logo",
        large_text: "Polymons Player",
        small_image: "poly_studio_logo",
        small_text: "Playtesting",
      },
    };
  }
  return {
    details: presence.details ?? "Browsing games",
    state: presence.state ?? "In Polymons Player",
    timestamps: { start: startedAt },
    assets: {
      large_image: "polymons_logo",
      large_text: "Polymons Player",
    },
  };
}

export class DiscordPresenceClient {
  private socket: Socket | null = null;
  private connecting = false;
  private ready = false;
  private disabled =
    !DISCORD_CLIENT_ID || DISCORD_CLIENT_ID === "PUT_DISCORD_CLIENT_ID_HERE";
  private lastPresence: PolymonsPresence = {
    kind: "idle",
    details: "Browsing games",
    state: "In Polymons Player",
  };

  setPresence(presence: PolymonsPresence) {
    this.lastPresence = presence;
    if (this.disabled) return;
    if (!this.ready) {
      void this.connect();
      return;
    }
    this.sendActivity(activityForPresence(presence));
  }

  clear() {
    if (!this.ready || !this.socket) return;
    writeFrame(this.socket, 1, {
      cmd: "SET_ACTIVITY",
      args: { pid: process.pid },
      nonce: randomUUID(),
    });
  }

  destroy() {
    this.clear();
    this.ready = false;
    this.socket?.destroy();
    this.socket = null;
  }

  private async connect() {
    if (this.connecting || this.ready || this.disabled) return;
    this.connecting = true;
    for (let index = 0; index < 10; index += 1) {
      try {
        await this.tryPipe(index);
        return;
      } catch {
        // Try the next Discord pipe. Discord can use any 0-9 slot.
      }
    }
    this.connecting = false;
  }

  private tryPipe(index: number) {
    return new Promise<void>((resolve, reject) => {
      const socket = createConnection(discordPipePath(index));
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new Error("Discord IPC unavailable."));
      };
      socket.once("error", fail);
      socket.once("connect", () => {
        writeFrame(socket, 0, { v: 1, client_id: DISCORD_CLIENT_ID });
      });
      socket.once("data", () => {
        if (settled) return;
        settled = true;
        this.socket = socket;
        this.ready = true;
        this.connecting = false;
        socket.removeListener("error", fail);
        socket.on("close", () => {
          if (this.socket === socket) {
            this.socket = null;
            this.ready = false;
          }
        });
        socket.on("error", () => {
          if (this.socket === socket) {
            this.socket = null;
            this.ready = false;
          }
        });
        this.sendActivity(activityForPresence(this.lastPresence));
        resolve();
      });
      setTimeout(fail, 650);
    });
  }

  private sendActivity(activity: DiscordActivity) {
    if (!this.socket || !this.ready) return;
    writeFrame(this.socket, 1, {
      cmd: "SET_ACTIVITY",
      args: {
        pid: process.pid,
        activity,
      },
      nonce: randomUUID(),
    });
  }
}
