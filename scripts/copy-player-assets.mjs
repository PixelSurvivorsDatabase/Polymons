import { copyFile, mkdir, writeFile } from "node:fs/promises";

await mkdir("player-dist/main", { recursive: true });
await copyFile("player/preload.cjs", "player-dist/main/preload.cjs");
await writeFile(
  "player-dist/main/release-tag.txt",
  (process.env.POLYMONS_RELEASE_TAG || process.env.GITHUB_REF_NAME || "").trim(),
  "utf8",
);
