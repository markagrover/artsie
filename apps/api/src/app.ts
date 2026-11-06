import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { env } from "./lib/env.js";
import { ensureUploadDir } from "./lib/storage.js";
import { seedIfEmpty } from "./db/seed.js";
import { authRouter } from "./routes/auth.js";
import { listingsRouter } from "./routes/listings.js";
import { uploadsRouter } from "./routes/uploads.js";

let boot: Promise<void> | undefined;

async function ensureBooted(): Promise<void> {
  if (!boot) {
    boot = (async () => {
      await ensureUploadDir();
      try {
        await seedIfEmpty();
      } catch (err) {
        console.error("[seed] Failed to seed empty database:", err);
      }
    })().catch((err: unknown) => {
      boot = undefined;
      throw err;
    });
  }
  await boot;
}

/** Express app used by local `npm start` and by Cursor Publish / Vercel. */
export function createApp(): express.Express {
  const app = express();

  app.use((req, res, next) => {
    void ensureBooted().then(() => next()).catch(next);
  });

  const corsOrigin = env.corsOrigin.trim();
  if (corsOrigin !== "") {
    app.use(
      cors({
        origin: corsOrigin.split(",").map((s) => s.trim()).filter(Boolean),
        credentials: true,
      }),
    );
  }
  app.use(express.json({ limit: "2mb" }));
  app.use("/uploads", uploadsRouter);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "artsie-api", phase: 1 });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/listings", listingsRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use("/auth", authRouter);
  app.use("/listings", listingsRouter);

  const webDist = env.webDistDir;
  const hasWebDist = fs.existsSync(path.join(webDist, "index.html"));
  if (hasWebDist) {
    // Local unified host. On Vercel/Cursor Publish, `public/` is served by the CDN.
    app.use(express.static(webDist, { index: false }));
    app.get(
      /^(?!\/api(?:\/|$)|\/uploads(?:\/|$)|\/health$).*/,
      (req, res, next) => {
        res.sendFile(path.join(webDist, "index.html"), (err) => {
          if (err) next(err);
        });
      },
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

  return app;
}
