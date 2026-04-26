import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // `drizzle-kit generate` is offline and does not need a live database.
    // `migrate` / `push` still require DATABASE_URL to point at Postgres.
    url: databaseUrl ?? "postgres://user:pass@localhost:5432/agentmkt",
  },
  strict: true,
  verbose: true,
});
