import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * as schema from "./schema.js";
export { sql, eq, and, or, desc, asc, inArray, isNull, isNotNull } from "drizzle-orm";

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb(databaseUrl: string = requireUrl()) {
  if (!_db) {
    _client = postgres(databaseUrl, { max: 10 });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

export async function closeDb() {
  if (_client) {
    await _client.end();
    _client = null;
    _db = null;
  }
}

function requireUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env at the repo root.",
    );
  }
  return url;
}

export type Db = ReturnType<typeof getDb>;
