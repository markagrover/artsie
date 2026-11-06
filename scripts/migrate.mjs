/**
 * Apply Prisma migrations when DATABASE_URL is set (Cursor Publish build/runtime).
 * Skips cleanly when unset so local builds without Postgres still succeed.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL?.trim() ?? "";
if (url === "") {
  console.log("migrate: DATABASE_URL unset — skipping");
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "apps/api");

const generate = spawnSync("npx", ["prisma", "generate"], {
  cwd: apiDir,
  stdio: "inherit",
  env: process.env,
  shell: false,
});
if (generate.status !== 0) {
  process.exit(generate.status ?? 1);
}

const deploy = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  cwd: apiDir,
  stdio: "inherit",
  env: process.env,
  shell: false,
});
process.exit(deploy.status ?? 1);
