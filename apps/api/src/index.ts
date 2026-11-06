import { env } from "./lib/env.js";
import { createApp } from "./app.js";
import path from "node:path";

const app = createApp();

app.listen(env.port, () => {
  console.log(`Artsie listening on http://localhost:${env.port}`);
  console.log(`Uploads: ${path.resolve(env.uploadDir)} (${env.storageDriver})`);
  console.log(`SPA dir: ${env.webDistDir}`);
});
