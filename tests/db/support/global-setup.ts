import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import type { TestProject } from "vitest/node";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const DB_NAME = "finance_track_test";

/** Creates a fresh database, then applies the Supabase shim and every migration in order. */
export default async function setup(project: TestProject) {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${DB_NAME} with (force)`);
  await admin.query(`create database ${DB_NAME}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${DB_NAME}`;
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(await readFile(path.join(ROOT, "tests/db/support/supabase-shim.sql"), "utf8"));
    const dir = path.join(ROOT, "supabase/migrations");
    for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
      try {
        await db.query(await readFile(path.join(dir, file), "utf8"));
      } catch (error) {
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
  } finally {
    await db.end();
  }

  project.provide("databaseUrl", url.toString());
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
