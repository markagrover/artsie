import { seedIfEmpty } from "../src/db/seed.js";
import { prisma } from "../src/db/prisma.js";

async function main() {
  // CLI seed always upserts demo accounts even when DB is not empty.
  // For empty DBs, seedIfEmpty covers the happy path; when users exist we
  // still ensure the demo artist listing is present for local demos.
  const { ArtworkKind, ListingStatus } = await import("@prisma/client");
  const bcrypt = await import("bcryptjs");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { env } = await import("../src/lib/env.js");

  const seeded = await seedIfEmpty();
  if (seeded) return;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const src = path.join(__dirname, "seed-assets/seed-harbor.png");
  await fs.mkdir(env.uploadDir, { recursive: true });
  const dest = path.join(env.uploadDir, "seed-harbor.png");
  await fs.copyFile(src, dest);
  const seedImageUrl = "/uploads/seed-harbor.png";
  const passwordHash = await bcrypt.hash("password123", 10);

  const artist = await prisma.user.upsert({
    where: { email: "mira@artsie.studio" },
    update: {},
    create: {
      email: "mira@artsie.studio",
      passwordHash,
      displayName: "Mira Chen",
      bio: "Oil and mixed media. Based in Portland.",
      isArtist: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "buyer@artsie.studio" },
    update: {},
    create: {
      email: "buyer@artsie.studio",
      passwordHash,
      displayName: "Alex Rivera",
      isArtist: false,
    },
  });

  const existing = await prisma.listing.count({
    where: { sellerId: artist.id },
  });
  if (existing === 0) {
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
        shippingNotes:
          "Ships rolled in a tube with certificate of authenticity.",
        estimatedShipDays: 5,
        images: {
          create: [{ url: seedImageUrl, sortOrder: 0 }],
        },
      },
    });
  }

  console.log(
    "Seeded users: mira@artsie.studio / buyer@artsie.studio (password123)",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
