/**
 * Quick sanity check (no network). Run: npm run kyn:doctor
 */
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const examplePath = join(root, ".env.example");

let code = 0;
if (!existsSync(envPath)) {
  console.warn("[kyn:doctor] No .env file — copy .env.example to .env and add your keys.");
  code = 1;
} else {
  console.log("[kyn:doctor] .env found.");
}
if (existsSync(examplePath)) {
  console.log("[kyn:doctor] .env.example present (reference for required variables).");
}
console.log("[kyn:doctor] Run `npm run kyn:ready` for full lint + build + API tests.");
process.exit(code);
