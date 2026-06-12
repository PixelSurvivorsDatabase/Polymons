import { copyFile, mkdir } from "node:fs/promises";

await mkdir("admin-dist/main", { recursive: true });
await copyFile("admin/preload.cjs", "admin-dist/main/preload.cjs");
