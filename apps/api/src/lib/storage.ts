import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "./env.js";

/**
 * Storage abstraction.
 * - local: files under UPLOAD_DIR, served at /uploads/*
 * - s3: Phase 1 stub — writes locally but documents S3 env for production.
 *   Wire an AWS SDK putObject here when STORAGE_DRIVER=s3 and credentials exist.
 */
export async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(env.uploadDir, { recursive: true });
}

export async function storeImage(
  file: Express.Multer.File,
): Promise<{ url: string }> {
  await ensureUploadDir();
  const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
  const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)
    ? ext
    : ".jpg";
  const filename = `${randomUUID()}${safeExt}`;
  const dest = path.join(env.uploadDir, filename);
  await fs.writeFile(dest, file.buffer);

  if (env.storageDriver === "s3") {
    // Stub: keep local write for MVP demos. Configure S3_* env vars and
    // replace this branch with an S3 PutObject that returns publicBaseUrl.
    if (env.s3.publicBaseUrl) {
      console.warn(
        "[storage] STORAGE_DRIVER=s3 but SDK upload not wired yet; serving local file. See README.",
      );
    }
  }

  return { url: `/uploads/${filename}` };
}
