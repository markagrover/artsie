import { ArtworkKind, ListingStatus } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";
import { env } from "../lib/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ensureSeedUpload(): Promise<string> {
  // Prefer committed seed asset (survives publish pack); fall back to cwd.
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
 * Populate demo users + sample listing when the database is empty.
 * Safe to call on every boot — no-ops when any user already exists.
 */
export async function seedIfEmpty(): Promise<boolean> {
  const count = await prisma.user.count();
  if (count > 0) return false;

  const seedImageUrl = await ensureSeedUpload();
  const passwordHash = await bcrypt.hash("password123", 10);

  const artist = await prisma.user.create({
    data: {
      email: "mira@artsie.studio",
      passwordHash,
      displayName: "Mira Chen",
      bio: "Oil and mixed media. Based in Portland.",
      isArtist: true,
    },
  });

  await prisma.user.create({
    data: {
      email: "buyer@artsie.studio",
      passwordHash,
      displayName: "Alex Rivera",
      isArtist: false,
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

  await prisma.listing.create({
    data: {
      sellerId: artist.id,
      title: "Studio Still Life (draft)",
      description: "Work in progress — not ready for the floor yet.",
      medium: "Acrylic on panel",
      dimensions: "16 × 20 in",
      kind: ArtworkKind.ORIGINAL,
      status: ListingStatus.DRAFT,
      priceCents: 90000,
      shippingPriceCents: 3500,
      estimatedShipDays: 7,
    },
  });

  console.log(
    "Seeded empty database: mira@artsie.studio / buyer@artsie.studio (password123)",
  );
  return true;
}
