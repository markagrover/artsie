/**
 * prisma generate without requiring a live database.
 * Schema still references env("DATABASE_URL"); provide a placeholder when unset.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "apps/api");
const env = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL?.trim() ||
    "postgresql://artsie:artsie@127.0.0.1:5432/artsie",
};

const result = spawnSync("npx", ["prisma", "generate"], {
  cwd: apiDir,
  stdio: "inherit",
  env,
  shell: false,
});
process.exit(result.status ?? 1);
