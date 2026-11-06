import { PrismaClient, ArtworkKind, ListingStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ensureSeedUpload(): Promise<string> {
  const src = path.join(__dirname, "seed-assets/seed-harbor.png");
  const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? path.join(__dirname, "../uploads"));
  await fs.mkdir(uploadDir, { recursive: true });
  const dest = path.join(uploadDir, "seed-harbor.png");
  await fs.copyFile(src, dest);
  return "/uploads/seed-harbor.png";
}

async function main() {
  const seedImageUrl = await ensureSeedUpload();
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
  }

  console.log("Seeded users: mira@artsie.studio / buyer@artsie.studio (password123)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
