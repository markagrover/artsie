import "dotenv/config";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const isPublished = databaseUrl !== "";

function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) {
    if (fromEnv.length < 32) {
      throw new Error(
        "JWT_SECRET must be at least 32 characters. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    return fromEnv;
  }
  // Never derive the signing key from DATABASE_URL (or any shared credential).
  // Published / DB-backed hosts must set JWT_SECRET explicitly.
  if (databaseUrl !== "") {
    throw new Error(
      "JWT_SECRET is required when DATABASE_URL is set. Bind JWT_SECRET as an app secret (or set it in .env for local use).",
    );
  }
  // Local without DB URL: ephemeral is fine (single process).
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
