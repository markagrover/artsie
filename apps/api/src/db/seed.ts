import { randomBytes } from "node:crypto";
import { ArtworkKind, ListingStatus } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";
import { env } from "../lib/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ensureSeedUpload(): Promise<string> {
  const candidates = [
    path.join(__dirname, "../../prisma/seed-assets/seed-harbor.png"),
    path.join(process.cwd(), "apps/api/prisma/seed-assets/seed-harbor.png"),
    path.join(process.cwd(), "prisma/seed-assets/seed-harbor.png"),
  ];
  let src: string | null = null;
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      src = candidate;
      break;
    } catch {
      // try next
    }
  }
  if (!src) {
    throw new Error("Seed artwork asset not found (seed-harbor.png)");
  }

  await fs.mkdir(env.uploadDir, { recursive: true });
  const dest = path.join(env.uploadDir, "seed-harbor.png");
  await fs.copyFile(src, dest);
  return "/uploads/seed-harbor.png";
}

/**
 * When the database has no users, add one sample published listing so browse
 * is not blank. The catalog seller uses a random password that is never
 * logged or documented — visitors register their own accounts to sell.
 */
export async function seedIfEmpty(): Promise<boolean> {
  const count = await prisma.user.count();
  if (count > 0) return false;

  const seedImageUrl = await ensureSeedUpload();
  const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);

  const artist = await prisma.user.create({
    data: {
      email: `catalog-${randomBytes(8).toString("hex")}@artsie.local`,
      passwordHash,
      displayName: "Studio Catalog",
      bio: "Sample originals for browsing Artsie Phase 1.",
      isArtist: true,
    },
  });

  await prisma.listing.create({
    data: {
      sellerId: artist.id,
      title: "Evening Harbor",
      description:
        "Oil on linen. Soft harbor lights over cool water — painted from sketches made on the Willamette.",
      medium: "Oil on linen",
      dimensions: "30 × 40 in",
      kind: ArtworkKind.ORIGINAL,
      status: ListingStatus.PUBLISHED,
      priceCents: 240000,
      shippingPriceCents: 6500,
      shippingNotes: "Ships rolled in a tube with certificate of authenticity.",
      estimatedShipDays: 5,
      images: {
        create: [{ url: seedImageUrl, sortOrder: 0 }],
      },
    },
  });

  console.log("Seeded empty database with a sample published listing");
  return true;
}
