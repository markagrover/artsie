import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { env } from "./lib/env.js";
import { ensureUploadDir } from "./lib/storage.js";
import { seedIfEmpty } from "./db/seed.js";
import { authRouter } from "./routes/auth.js";
import { listingsRouter } from "./routes/listings.js";

await ensureUploadDir();

try {
  await seedIfEmpty();
} catch (err) {
  console.error("[seed] Failed to seed empty database:", err);
}

const app = express();

const corsOrigin = env.corsOrigin;
app.use(
  cors({
    origin:
      corsOrigin === "" || corsOrigin === "*"
        ? true
        : corsOrigin.split(",").map((s) => s.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(env.uploadDir));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "artsie-api", phase: 1 });
});

// Same-origin /api prefix used by the Vite SPA (dev proxy + published host).
app.use("/api/auth", authRouter);
app.use("/api/listings", listingsRouter);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});
// Back-compat for direct API clients during local split-dev.
app.use("/auth", authRouter);
app.use("/listings", listingsRouter);

const webDist = env.webDistDir;
const hasWebDist = fs.existsSync(path.join(webDist, "index.html"));
if (hasWebDist) {
  app.use(express.static(webDist, { index: false }));
  app.get(/^(?!\/api(?:\/|$)|\/uploads(?:\/|$)|\/health$).*/, (req, res, next) => {
    res.sendFile(path.join(webDist, "index.html"), (err) => {
      if (err) next(err);
    });
  });
  console.log(`Serving SPA from ${webDist}`);
} else {
  console.warn(
    `SPA dist not found at ${webDist} — API-only mode (run web build for unified host)`,
  );
}

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  },
);

app.listen(env.port, () => {
  console.log(`Artsie listening on http://localhost:${env.port}`);
  console.log(`Uploads: ${path.resolve(env.uploadDir)} (${env.storageDriver})`);
});
