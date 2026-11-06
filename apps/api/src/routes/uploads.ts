import { Router } from "express";
import path from "node:path";
import { ListingStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { env } from "../lib/env.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { verifyToken } from "../lib/auth.js";

export const uploadsRouter = Router();

/**
 * Serve uploaded images only when:
 * - the listing is published, or
 * - the requester owns the listing (Bearer token).
 * Prevents guessing draft image URLs via /uploads/*.
 */
uploadsRouter.get(
  "/:filename",
  asyncHandler(async (req, res) => {
    const filename = path.basename(req.params.filename ?? "");
    if (
      !filename ||
      filename !== req.params.filename ||
      filename.includes("..")
    ) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const url = `/uploads/${filename}`;
    const image = await prisma.listingImage.findFirst({
      where: { url },
      include: { listing: { select: { sellerId: true, status: true } } },
    });

    // Seed / orphan files with no DB row: allow only if published listing not required
    // for seed-harbor used by sample listing (always published when present).
    if (!image) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    if (image.listing.status !== ListingStatus.PUBLISHED) {
      const header = req.headers.authorization;
      let owner = false;
      if (header?.startsWith("Bearer ")) {
        try {
          const payload = verifyToken(header.slice(7));
          owner = payload.sub === image.listing.sellerId;
        } catch {
          owner = false;
        }
      }
      if (!owner) {
        res.status(404).json({ error: "Not found" });
        return;
      }
    }

    const filePath = path.join(env.uploadDir, filename);
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: "Not found" });
      }
    });
  }),
);
