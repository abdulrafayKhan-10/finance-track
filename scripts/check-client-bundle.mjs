#!/usr/bin/env node
// Fails if anything that grants privileged Supabase access is present in the
// browser bundle (.next/static). Run after `next build`.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".next/static");
const needles = ["sb_secret_", "service_role", "SUPABASE_SECRET_KEY"];
if (process.env.SUPABASE_SECRET_KEY) needles.push(process.env.SUPABASE_SECRET_KEY);

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (/\.(js|css|json|html|map)$/.test(entry.name)) yield full;
  }
}

let found = 0;
let scanned = 0;
for await (const file of files(root)) {
  scanned++;
  const text = await readFile(file, "utf8");
  for (const needle of needles) {
    if (text.includes(needle)) {
      found++;
      const label = needle === process.env.SUPABASE_SECRET_KEY ? "<SUPABASE_SECRET_KEY value>" : needle;
      console.error(`✗ ${path.relative(process.cwd(), file)} contains ${label}`);
    }
  }
}
if (scanned === 0) {
  console.error("✗ No client bundle found. Run `pnpm build` first.");
  process.exit(1);
}
if (found > 0) process.exit(1);
console.log(`✓ Client bundle clean (${scanned} files scanned).`);
