import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ArtworkKind, ListingStatus, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { env } from "../lib/env.js";
import {
  deleteStoredImage,
  ensureUploadDir,
  safeImageExt,
  storeImage,
} from "../lib/storage.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { rateLimit } from "../lib/rateLimit.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const listingsRouter = Router();

/** Postgres INTEGER (signed 32-bit) upper bound for money columns. */
const MAX_INT32 = 2_147_483_647;
/** Practical listing price cap ($10M) — still within INTEGER. */
const MAX_PRICE_CENTS = 1_000_000_000;
/** Practical shipping cap ($100k). */
const MAX_SHIPPING_CENTS = 10_000_000;

/** Resource caps to prevent disk/memory exhaustion on the published host. */
const MAX_LISTINGS_PER_USER = 25;
const MAX_IMAGES_PER_LISTING = 4;
const MAX_IMAGES_PER_USER = 40;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      void ensureUploadDir()
        .then(() => cb(null, env.uploadDir))
        .catch((err: Error) => cb(err, env.uploadDir));
    },
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${safeImageExt(file.originalname)}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_IMAGES_PER_LISTING },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only JPEG, PNG, WebP, or GIF images are allowed"));
  },
});

const createListingLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  name: "listing create",
});
const uploadLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  name: "image upload",
});

const listingBodySchema = z.object({
  title: z.string().min(1).max(140),
  description: z.string().max(5000).optional().default(""),
  medium: z.string().max(120).optional().nullable(),
  dimensions: z.string().max(120).optional().nullable(),
  priceCents: z.number().int().positive().max(Math.min(MAX_PRICE_CENTS, MAX_INT32)),
  shippingPriceCents: z
    .number()
    .int()
    .min(0)
    .max(Math.min(MAX_SHIPPING_CENTS, MAX_INT32))
    .optional()
    .default(0),
  shippingNotes: z.string().max(500).optional().nullable(),
  estimatedShipDays: z.number().int().positive().max(90).optional().nullable(),
  status: z.nativeEnum(ListingStatus).optional(),
  quantity: z.number().int().positive().max(1).optional().default(1),
  kind: z.nativeEnum(ArtworkKind).optional().default(ArtworkKind.ORIGINAL),
});

type ListingWithRelations = {
  id: string;
  title: string;
  description: string;
  medium: string | null;
  dimensions: string | null;
  kind: ArtworkKind;
  status: ListingStatus;
  priceCents: number;
  currency: string;
  quantity: number;
  shippingPriceCents: number;
  shippingNotes: string | null;
  estimatedShipDays: number | null;
  createdAt: Date;
  updatedAt: Date;
  images: Array<{
    id: string;
    url: string;
    sortOrder: number;
  }>;
  seller: {
    id: string;
    displayName: string;
    bio: string | null;
  };
};

function serializeListing(listing: ListingWithRelations) {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    medium: listing.medium,
    dimensions: listing.dimensions,
    kind: listing.kind,
    status: listing.status,
    priceCents: listing.priceCents,
    currency: listing.currency,
    quantity: listing.quantity,
    shippingPriceCents: listing.shippingPriceCents,
    shippingNotes: listing.shippingNotes,
    estimatedShipDays: listing.estimatedShipDays,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    images: [...listing.images]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((img) => ({
        id: img.id,
        url: img.url,
        sortOrder: img.sortOrder,
      })),
    seller: {
      id: listing.seller.id,
      displayName: listing.seller.displayName,
      bio: listing.seller.bio,
    },
  };
}

const include = {
  images: true,
  seller: {
    select: { id: true, displayName: true, bio: true },
  },
} as const;

/** Public catalog: published originals. */
listingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const where: Prisma.ListingWhereInput = {
      status: ListingStatus.PUBLISHED,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { medium: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const listings = await prisma.listing.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
    });
    res.json({ listings: listings.map(serializeListing) });
  }),
);

/** Seller's own listings (all statuses). */
listingsRouter.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const listings = await prisma.listing.findMany({
      where: { sellerId: req.user!.id },
      include,
      orderBy: { updatedAt: "desc" },
    });
    res.json({ listings: listings.map(serializeListing) });
  }),
);

listingsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      include,
    });
    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    if (listing.status === ListingStatus.DRAFT) {
      const header = req.headers.authorization;
      let owner = false;
      if (header?.startsWith("Bearer ")) {
        try {
          const { verifyToken } = await import("../lib/auth.js");
          const payload = verifyToken(header.slice(7));
          owner = payload.sub === listing.sellerId;
        } catch {
          owner = false;
        }
      }
      if (!owner) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }
    }
    res.json({ listing: serializeListing(listing) });
  }),
);

listingsRouter.post(
  "/",
  requireAuth,
  createListingLimit,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
    });
    if (!user.isArtist) {
      res.status(403).json({
        error: "Enable artist mode on your profile before creating listings",
      });
      return;
    }
    const listingCount = await prisma.listing.count({
      where: { sellerId: user.id },
    });
    if (listingCount >= MAX_LISTINGS_PER_USER) {
      res.status(400).json({
        error: `Maximum ${MAX_LISTINGS_PER_USER} listings per account`,
      });
      return;
    }
    const parsed = listingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    if (data.kind !== ArtworkKind.ORIGINAL) {
      res.status(400).json({
        error: "Phase 1 supports physical originals only",
      });
      return;
    }
    const listing = await prisma.listing.create({
      data: {
        sellerId: user.id,
        title: data.title,
        description: data.description,
        medium: data.medium,
        dimensions: data.dimensions,
        priceCents: data.priceCents,
        shippingPriceCents: data.shippingPriceCents,
        shippingNotes: data.shippingNotes,
        estimatedShipDays: data.estimatedShipDays,
        status: data.status ?? ListingStatus.DRAFT,
        quantity: 1,
        kind: ArtworkKind.ORIGINAL,
      },
      include,
    });
    res.status(201).json({ listing: serializeListing(listing) });
  }),
);

listingsRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.listing.findUnique({
      where: { id: req.params.id },
    });
    if (!existing || existing.sellerId !== req.user!.id) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    const parsed = listingBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    if (parsed.data.kind && parsed.data.kind !== ArtworkKind.ORIGINAL) {
      res.status(400).json({
        error: "Phase 1 supports physical originals only",
      });
      return;
    }
    const listing = await prisma.listing.update({
      where: { id: existing.id },
      data: {
        ...parsed.data,
        kind: ArtworkKind.ORIGINAL,
        quantity: 1,
      },
      include,
    });
    res.json({ listing: serializeListing(listing) });
  }),
);

listingsRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      include: { images: true },
    });
    if (!existing || existing.sellerId !== req.user!.id) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    await prisma.listing.delete({ where: { id: existing.id } });
    await Promise.all(existing.images.map((img) => deleteStoredImage(img.url)));
    res.status(204).send();
  }),
);

listingsRouter.post(
  "/:id/images",
  requireAuth,
  uploadLimit,
  (req, res, next) => {
    upload.array("images", MAX_IMAGES_PER_LISTING)(req, res, (err) => {
      if (err) {
        const message =
          err instanceof multer.MulterError
            ? err.code === "LIMIT_FILE_SIZE"
              ? `Each image must be at most ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`
              : err.message
            : err instanceof Error
              ? err.message
              : "Upload failed";
        res.status(400).json({ error: message });
        return;
      }
      next();
    });
  },
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      include: { images: true },
    });
    if (!existing || existing.sellerId !== req.user!.id) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: "No images uploaded" });
      return;
    }
    if (existing.images.length + files.length > MAX_IMAGES_PER_LISTING) {
      res.status(400).json({
        error: `Maximum ${MAX_IMAGES_PER_LISTING} images per listing`,
      });
      return;
    }
    const userImageCount = await prisma.listingImage.count({
      where: { listing: { sellerId: req.user!.id } },
    });
    if (userImageCount + files.length > MAX_IMAGES_PER_USER) {
      res.status(400).json({
        error: `Maximum ${MAX_IMAGES_PER_USER} images per account`,
      });
      return;
    }
    let order = existing.images.length;
    const created = [];
    for (const file of files) {
      const { url } = await storeImage(file);
      const img = await prisma.listingImage.create({
        data: {
          listingId: existing.id,
          url,
          sortOrder: order++,
        },
      });
      created.push(img);
    }
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: existing.id },
      include,
    });
    res.status(201).json({
      images: created,
      listing: serializeListing(listing),
    });
  }),
);
