import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  storageDriver: (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3",
  uploadDir: path.resolve(
    process.env.UPLOAD_DIR ?? path.join(__dirname, "../../uploads"),
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
