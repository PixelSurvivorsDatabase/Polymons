import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const env = { ...process.env };

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals === -1) continue;
    const key = line.slice(0, equals).trim();
    if (!key || key in env) continue;
    env[key] = stripQuotes(line.slice(equals + 1));
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

env.NODE_ENV ??= "development";
env.PORT ??= "10000";
env.WEB_ORIGIN ??= "http://localhost:5173";
env.VITE_POLYMONS_API_URL ??= `http://localhost:${env.PORT}`;

const requiredServerEnv = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "PLAY_TICKET_SECRET",
];
const missing = requiredServerEnv.filter((key) => !env[key]);

if (missing.length > 0) {
  console.error(
    `Missing local server env: ${missing.join(", ")}\n` +
      "Add them to .env.local, then run npm run dev:local again.",
  );
  process.exit(1);
}

const commands = [
  {
    name: "api",
    command: "npx",
    args: ["tsx", "watch", "server/index.ts"],
  },
  {
    name: "web",
    command: "npx",
    args: ["vite", "--host", "0.0.0.0"],
  },
];

let stopping = false;

const children = commands.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    env,
    shell: process.platform === "win32",
    stdio: ["inherit", "pipe", "pipe"],
  });

  const prefix = `[${name}] `;
  child.stdout.on("data", (chunk) => {
    process.stdout.write(
      String(chunk)
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => `${prefix}${line}`)
        .join("\n") + "\n",
    );
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(
      String(chunk)
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => `${prefix}${line}`)
        .join("\n") + "\n",
    );
  });
  child.on("exit", (code, signal) => {
    if (stopping) return;
    console.error(
      `${prefix}stopped${signal ? ` by ${signal}` : ""}${
        code === null ? "" : ` with code ${code}`
      }.`,
    );
    stopAll(code ?? 1);
  });
  return child;
});

function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  windowlessExit(exitCode);
}

function windowlessExit(exitCode) {
  setTimeout(() => process.exit(exitCode), 100);
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
