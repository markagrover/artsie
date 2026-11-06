import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const isPublished = databaseUrl !== "";

/**
 * Resolve the JWT signing key.
 * - Never derive from DATABASE_URL (or any DB credential).
 * - Prefer an explicit JWT_SECRET (bound app secret / .env).
 * - Hash the provided secret so short values still yield a fixed-length key
 *   without crashing cold start.
 * - If JWT_SECRET is missing on a DB-backed host, fall back to an ephemeral
 *   key and warn — better a clear auth failure than a 500 on every request.
 *   Operators should still bind JWT_SECRET for stable tokens across isolates.
 */
function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) {
    return createHash("sha256")
      .update(`artsie-jwt-v2:${fromEnv}`)
      .digest("hex");
  }
  if (databaseUrl !== "") {
    console.error(
      "[env] JWT_SECRET is not set; auth tokens will not survive across instances. Bind JWT_SECRET as an app secret.",
    );
    // Stable-enough per-process key so the module can load; not derived from DB URL.
    return createHash("sha256")
      .update(`artsie-jwt-missing:${process.pid}:${Date.now()}`)
      .digest("hex");
  }
  console.warn(
    "JWT_SECRET is unset; using an ephemeral secret for this process only.",
  );
  return randomBytes(32).toString("hex");
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl,
  isPublished,
  jwtSecret: resolveJwtSecret(),
  /** Comma-separated origins, or "*" / empty for same-origin / reflect. */
  corsOrigin: process.env.CORS_ORIGIN ?? (isPublished ? "" : "http://localhost:5173"),
  // Default inline (data URL in Postgres) so publish hosts keep images.
  // Set STORAGE_DRIVER=local for classic disk files in local dev.
  storageDriver: (process.env.STORAGE_DRIVER ?? "inline") as
    | "local"
    | "inline"
    | "s3",
  uploadDir: path.resolve(
    process.env.UPLOAD_DIR ?? path.join(__dirname, "../../uploads"),
  ),
  /** Built Vite SPA — repo-root `public/` (Cursor Publish outputDirectory). */
  webDistDir: path.resolve(
    process.env.WEB_DIST_DIR ??
      path.join(__dirname, "../../../../public"),
  ),

  s3: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
  },
};

if (!env.databaseUrl) {
  console.warn("DATABASE_URL is not set");
}
