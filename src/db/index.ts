import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";

// DATABASE_URL set  -> real Postgres (Supabase). Otherwise embedded PGlite, persisted in PGLITE_DIR.
// PGlite is single-process: don't run the collector while `next dev` holds the same data dir.
export type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function create(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: 5 });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    return db as unknown as Db;
  }
  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  if (dir !== "memory") fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir === "memory" ? undefined : dir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return db;
}

const g = globalThis as unknown as { __db?: Promise<Db> };
export function getDb(): Promise<Db> {
  return (g.__db ??= create());
}

export async function memoryDb(): Promise<Db> {
  const db = drizzlePglite(new PGlite(), { schema });
  await migratePglite(db, { migrationsFolder });
  return db;
}
export * as schema from "./schema";
