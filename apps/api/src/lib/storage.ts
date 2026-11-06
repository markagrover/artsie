import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "./env.js";

/**
 * Storage abstraction.
 * - local: files under UPLOAD_DIR, served at /uploads/*
 * - s3: Phase 1 stub — writes locally but documents S3 env for production.
 */
export async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(env.uploadDir, { recursive: true });
}

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export function safeImageExt(originalname: string): string {
  const ext = path.extname(originalname).toLowerCase() || ".jpg";
  return ALLOWED_EXT.has(ext) ? ext : ".jpg";
}

/** Persist an already-buffered or disk-staged multer file; return public URL path. */
export async function storeImage(
  file: Express.Multer.File,
): Promise<{ url: string }> {
  await ensureUploadDir();

  // Disk storage: multer already wrote the file under uploadDir.
  if (file.path && file.filename) {
    if (env.storageDriver === "s3" && env.s3.publicBaseUrl) {
      console.warn(
        "[storage] STORAGE_DRIVER=s3 but SDK upload not wired yet; serving local file.",
      );
    }
    return { url: `/uploads/${file.filename}` };
  }

  const filename = `${randomUUID()}${safeImageExt(file.originalname)}`;
  const dest = path.join(env.uploadDir, filename);
  if (!file.buffer) {
    throw new Error("Upload missing file data");
  }
  await fs.writeFile(dest, file.buffer);

  if (env.storageDriver === "s3" && env.s3.publicBaseUrl) {
    console.warn(
      "[storage] STORAGE_DRIVER=s3 but SDK upload not wired yet; serving local file.",
    );
  }

  return { url: `/uploads/${filename}` };
}

/** Best-effort delete of a local upload referenced by /uploads/<name>. */
export async function deleteStoredImage(url: string): Promise<void> {
  if (!url.startsWith("/uploads/")) return;
  const name = path.basename(url);
  if (!name || name === "." || name === "..") return;
  const dest = path.join(env.uploadDir, name);
  try {
    await fs.unlink(dest);
  } catch {
    // ignore missing files
  }
}
