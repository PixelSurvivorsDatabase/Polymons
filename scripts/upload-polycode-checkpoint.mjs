import { createReadStream, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { resolve } from "node:path";

const [, , fileArg, bucketArg, objectArg] = process.argv;

const file = resolve(fileArg ?? "polycode/checkpoints/checkpoint-final.pt");
const bucket = bucketArg ?? "polycode-models";
const objectName = objectArg ?? "checkpoints/checkpoint-final.pt";
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl) {
  throw new Error("Set SUPABASE_URL before uploading.");
}

if (!serviceKey) {
  throw new Error("Set SUPABASE_SERVICE_ROLE_KEY before uploading.");
}

const directStorageUrl = supabaseUrl
  .replace(/^https:\/\/([^.]+)\.supabase\.co\/?$/, "https://$1.storage.supabase.co")
  .replace(/\/+$/, "");

function metadataValue(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

async function readChunk(handle, offset, length) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, offset);
  return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
}

async function upload() {
  const { size } = statSync(file);
  const createResponse = await fetch(`${directStorageUrl}/storage/v1/upload/resumable`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(size),
      "Upload-Metadata": [
        `bucketName ${metadataValue(bucket)}`,
        `objectName ${metadataValue(objectName)}`,
        `contentType ${metadataValue("application/octet-stream")}`,
      ].join(","),
      "x-upsert": "true",
    },
  });

  if (!createResponse.ok) {
    throw new Error(
      `Failed to create resumable upload: ${createResponse.status} ${await createResponse.text()}`,
    );
  }

  const location = createResponse.headers.get("location");
  if (!location) {
    throw new Error("Supabase did not return a resumable upload location.");
  }

  const uploadUrl = location.startsWith("http")
    ? location
    : `${directStorageUrl}${location}`;
  const chunkSize = 6 * 1024 * 1024;
  let offset = 0;
  const handle = await open(file, "r");
  try {
    while (offset < size) {
      const chunk = await readChunk(handle, offset, Math.min(chunkSize, size - offset));
      const patchResponse = await fetch(uploadUrl, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Tus-Resumable": "1.0.0",
          "Content-Type": "application/offset+octet-stream",
          "Upload-Offset": String(offset),
        },
        body: chunk,
      });

      if (!patchResponse.ok) {
        throw new Error(
          `Upload failed at byte ${offset}: ${patchResponse.status} ${await patchResponse.text()}`,
        );
      }

      const nextOffset = Number(patchResponse.headers.get("upload-offset"));
      offset = Number.isFinite(nextOffset) && nextOffset > offset
        ? nextOffset
        : offset + chunk.length;
      const percent = ((offset / size) * 100).toFixed(1);
      process.stdout.write(`\rUploaded ${percent}%`);
    }
  } finally {
    await handle.close();
  }

  process.stdout.write("\n");
  console.log(`Uploaded ${file} to ${bucket}/${objectName}.`);
}

upload().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
