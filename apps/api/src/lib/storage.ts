import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "./env.js";

/**
 * Storage abstraction.
 * Default: store images as data URLs in Postgres (ListingImage.url) so they
 * survive Cursor Publish / serverless hosts with ephemeral disks.
 * Opt into local files with STORAGE_DRIVER=local.
 *
 * MIME is never taken from the client. Extension is only a hint; magic bytes
 * decide the type. SVG and other scriptable formats are rejected.
 */
export async function ensureUploadDir(): Promise<void> {
  if (env.storageDriver !== "local") return;
  await fs.mkdir(env.uploadDir, { recursive: true });
}

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** Safe raster MIME types only — never image/svg+xml. */
export const SAFE_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function safeImageExt(originalname: string): string {
  const ext = path.extname(originalname).toLowerCase() || ".jpg";
  return ALLOWED_EXT.has(ext) ? ext : ".jpg";
}

/** Detect image type from magic bytes. Returns null if not a safe raster. */
export function detectSafeImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // Reject anything that looks like markup / SVG up front.
  const head = buffer.subarray(0, Math.min(256, buffer.length)).toString("utf8");
  if (
    /^\s*</.test(head) ||
    /<svg[\s>]/i.test(head) ||
    /<!DOCTYPE\s+svg/i.test(head)
  ) {
    return null;
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  // RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function toDataUrl(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function extForMime(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
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

  const mime = detectSafeImageMime(buffer);
  if (!mime || !SAFE_IMAGE_MIMES.has(mime)) {
    throw new Error("Only JPEG, PNG, or WebP images are allowed");
  }

  // Durable default: inline in DB (required on publish hosts).
  if (env.storageDriver !== "local") {
    return { url: toDataUrl(buffer, mime) };
  }

  await ensureUploadDir();
  const filename = `${randomUUID()}${extForMime(mime)}`;
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
  const mime = detectSafeImageMime(buffer) ?? MIME_BY_EXT[safeImageExt(filePath)];
  if (!mime || !SAFE_IMAGE_MIMES.has(mime)) {
    throw new Error("Seed asset is not a safe raster image");
  }
  return toDataUrl(buffer, mime);
}
