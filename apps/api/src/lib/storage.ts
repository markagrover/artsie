import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "./env.js";

/**
 * Storage abstraction.
 * Default: store images as data URLs in Postgres (ListingImage.url) so they
 * survive Cursor Publish / serverless hosts with ephemeral disks.
 * Opt into local files with STORAGE_DRIVER=local.
 */
export async function ensureUploadDir(): Promise<void> {
  if (env.storageDriver !== "local") return;
  await fs.mkdir(env.uploadDir, { recursive: true });
}

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function safeImageExt(originalname: string): string {
  const ext = path.extname(originalname).toLowerCase() || ".jpg";
  return ALLOWED_EXT.has(ext) ? ext : ".jpg";
}

function toDataUrl(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function mimeForFile(file: Express.Multer.File): string {
  if (file.mimetype && file.mimetype.startsWith("image/")) return file.mimetype;
  return MIME_BY_EXT[safeImageExt(file.originalname)] ?? "image/jpeg";
}

/** Persist an already-buffered multer file; return a URL or data URL. */
export async function storeImage(
  file: Express.Multer.File,
): Promise<{ url: string }> {
  let buffer = file.buffer;
  if (!buffer && file.path) {
    buffer = await fs.readFile(file.path);
  }
  if (!buffer) {
    throw new Error("Upload missing file data");
  }

  const mime = mimeForFile(file);

  // Durable default: inline in DB (required on publish hosts).
  if (env.storageDriver !== "local") {
    return { url: toDataUrl(buffer, mime) };
  }

  await ensureUploadDir();
  const filename = `${randomUUID()}${safeImageExt(file.originalname)}`;
  const dest = path.join(env.uploadDir, filename);
  await fs.writeFile(dest, buffer);
  return { url: `/uploads/${filename}` };
}

/** Best-effort delete of a local upload. Data URLs need no file cleanup. */
export async function deleteStoredImage(url: string): Promise<void> {
  if (url.startsWith("data:")) return;
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

/** Load a seed asset as a data URL (works on published hosts without disk). */
export async function seedAssetDataUrl(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const ext = safeImageExt(filePath);
  const mime = MIME_BY_EXT[ext] ?? "image/png";
  return toDataUrl(buffer, mime);
}
