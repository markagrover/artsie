import express from "express";
import cors from "cors";
import path from "node:path";
import { env } from "./lib/env.js";
import { ensureUploadDir } from "./lib/storage.js";
import { authRouter } from "./routes/auth.js";
import { listingsRouter } from "./routes/listings.js";

await ensureUploadDir();

const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(env.uploadDir));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "artsie-api", phase: 1 });
});

app.use("/auth", authRouter);
app.use("/listings", listingsRouter);

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
  console.log(`Artsie API listening on http://localhost:${env.port}`);
  console.log(`Uploads: ${path.resolve(env.uploadDir)} (${env.storageDriver})`);
});
