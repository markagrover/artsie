import { Router } from "express";
import path from "node:path";
import { ListingStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { env } from "../lib/env.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { verifyMediaToken, verifyToken } from "../lib/auth.js";
import { detectSafeImageMime, SAFE_IMAGE_MIMES } from "../lib/storage.js";

export const mediaRouter = Router();

async function isListingOwner(
  sellerId: string,
  authorization: string | undefined,
): Promise<boolean> {
  if (!authorization?.startsWith("Bearer ")) return false;
  try {
    const payload = verifyToken(authorization.slice(7));
    return payload.sub === sellerId;
  } catch {
    return false;
  }
}

/**
 * Serve a listing image by id. Inline payloads stay in Postgres; JSON APIs
 * only return `/api/media/:id` so uploads/list responses stay small.
 * Draft images require the listing owner (Bearer) or a short-lived `?t=` token
 * issued in owner listing responses (so `<img>` tags work).
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
      include: {
        listing: { select: { sellerId: true, status: true } },
      },
    });
    if (!image) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    if (image.listing.status !== ListingStatus.PUBLISHED) {
      const access =
        typeof req.query.t === "string" ? req.query.t : undefined;
      const tokenOk = access ? verifyMediaToken(access, image.id) : false;
      const owner = tokenOk
        ? true
        : await isListingOwner(
            image.listing.sellerId,
            req.headers.authorization,
          );
      if (!owner) {
        res.status(404).json({ error: "Not found" });
        return;
      }
    }

    const { url } = image;
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader(
      "Cache-Control",
      image.listing.status === ListingStatus.PUBLISHED
        ? "public, max-age=86400"
        : "private, max-age=300",
    );

    if (url.startsWith("data:")) {
      const match = /^data:([^;,]+);base64,(.+)$/s.exec(url);
      if (!match) {
        res.status(500).json({ error: "Corrupt image data" });
        return;
      }
      const claimedMime = match[1].toLowerCase();
      const buf = Buffer.from(match[2], "base64");
      const detected = detectSafeImageMime(buf);
      const mime =
        detected && SAFE_IMAGE_MIMES.has(detected)
          ? detected
          : SAFE_IMAGE_MIMES.has(claimedMime)
            ? claimedMime
            : null;
      if (!mime) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.setHeader("Content-Type", mime);
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

    // Never redirect to arbitrary external URLs from stored data.
    res.status(404).json({ error: "Not found" });
  }),
);
