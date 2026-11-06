import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { ArtworkKind, ListingStatus, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { storeImage } from "../lib/storage.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const listingsRouter = Router();

/** Postgres INTEGER (signed 32-bit) upper bound for money columns. */
const MAX_INT32 = 2_147_483_647;
/** Practical listing price cap ($10M) — still within INTEGER. */
const MAX_PRICE_CENTS = 1_000_000_000;
/** Practical shipping cap ($100k). */
const MAX_SHIPPING_CENTS = 10_000_000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
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
    });
    if (!existing || existing.sellerId !== req.user!.id) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    await prisma.listing.delete({ where: { id: existing.id } });
    res.status(204).send();
  }),
);

listingsRouter.post(
  "/:id/images",
  requireAuth,
  upload.array("images", 6),
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
    if (existing.images.length + files.length > 6) {
      res.status(400).json({ error: "Maximum 6 images per listing" });
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
