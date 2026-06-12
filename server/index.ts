import { createServer } from "node:http";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { ensureOfficialAccount } from "./official-account.js";
import { createAdminClient } from "./supabase.js";
import { attachWebSocketServer } from "./websocket.js";

const config = readConfig();
const admin = createAdminClient(config);
await ensureOfficialAccount(admin);
const server = createServer();
const sockets = attachWebSocketServer(server, config, admin);
const app = createApp(config, admin, () => sockets.snapshot());
server.on("request", app);

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Polymons Server listening on port ${config.port}.`);
});

function shutdown(signal: string) {
  console.log(`${signal} received. Closing Polymons Server.`);
  sockets.close();
  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
