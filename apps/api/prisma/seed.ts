/**
 * CLI seed for local development. Same behavior as boot-time seedIfEmpty:
 * sample published listing only; no known demo passwords.
 */
import { seedIfEmpty } from "../src/db/seed.js";
import { prisma } from "../src/db/prisma.js";

async function main() {
  const seeded = await seedIfEmpty();
  if (!seeded) {
    console.log("Database already has users — seed skipped");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
