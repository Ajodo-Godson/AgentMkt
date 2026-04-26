// Top-level entry: `pnpm db:seed`.
// Loads .env, runs the seed defined in @agentmkt/db.
import "dotenv/config";
import { seed } from "@agentmkt/db/seed";
import { closeDb } from "@agentmkt/db";

seed()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
