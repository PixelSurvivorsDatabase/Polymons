import { copyFile, mkdir } from "node:fs/promises";

await mkdir("studio-dist/main", { recursive: true });
await copyFile("studio/preload.cjs", "studio-dist/main/preload.cjs");
