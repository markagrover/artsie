import "dotenv/config";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const isPublished = databaseUrl !== "";

function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) return fromEnv;
  // Never ship a fixed signing secret. Unset → ephemeral per process
  // (local or published). Set JWT_SECRET in the environment for stable sessions.
  const generated = randomBytes(32).toString("hex");
  console.warn(
    "[env] JWT_SECRET unset; using ephemeral secret for this process",
  );
  return generated;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl,
  isPublished,
  jwtSecret: resolveJwtSecret(),
  /** Comma-separated origins, or "*" / empty for same-origin / reflect. */
  corsOrigin: process.env.CORS_ORIGIN ?? (isPublished ? "" : "http://localhost:5173"),
  storageDriver: (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3",
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
