import { Router } from "express";
import path from "node:path";
import { prisma } from "../db/prisma.js";
import { env } from "../lib/env.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const mediaRouter = Router();

/**
 * Serve a listing image by id. Inline payloads stay in Postgres; JSON APIs
 * only return `/api/media/:id` so uploads/list responses stay small.
 * IDs are unguessable cuids — `<img>` tags cannot send Bearer tokens.
 */
mediaRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id || id.includes("..")) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const image = await prisma.listingImage.findUnique({
      where: { id },
    });
    if (!image) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { url } = image;
    if (url.startsWith("data:")) {
      const match = /^data:([^;,]+);base64,(.+)$/s.exec(url);
      if (!match) {
        res.status(500).json({ error: "Corrupt image data" });
        return;
      }
      const mime = match[1];
      const buf = Buffer.from(match[2], "base64");
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.send(buf);
      return;
    }

    if (url.startsWith("/uploads/")) {
      const filename = path.basename(url);
      res.sendFile(path.join(env.uploadDir, filename), (err) => {
        if (err && !res.headersSent) {
          res.status(404).json({ error: "Not found" });
        }
      });
      return;
    }

    if (url.startsWith("http://") || url.startsWith("https://")) {
      res.redirect(302, url);
      return;
    }

    res.status(404).json({ error: "Not found" });
  }),
);
