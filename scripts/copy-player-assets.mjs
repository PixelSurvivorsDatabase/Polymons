import { copyFile, mkdir } from "node:fs/promises";

await mkdir("player-dist/main", { recursive: true });
await copyFile("player/preload.cjs", "player-dist/main/preload.cjs");
