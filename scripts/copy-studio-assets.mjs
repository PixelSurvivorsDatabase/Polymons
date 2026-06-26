import { copyFile, mkdir, writeFile } from "node:fs/promises";

await mkdir("studio-dist/main", { recursive: true });
await copyFile("studio/preload.cjs", "studio-dist/main/preload.cjs");
await writeFile(
  "studio-dist/main/release-tag.txt",
  (process.env.POLYMONS_RELEASE_TAG || process.env.GITHUB_REF_NAME || "").trim(),
  "utf8",
);
