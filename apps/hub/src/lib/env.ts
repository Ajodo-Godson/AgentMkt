// Loaded once at process start. We `dotenv.config()` from the repo root so
// every service shares the same .env file (per spec section 4).

import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as z from "zod";

// Resolve the repo root (../../.. from this file).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");

loadEnv({ path: path.join(repoRoot, ".env") });

const envSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgres")),

  HUB_LIGHTNING_BACKEND: z.enum(["lexe", "lnd"]).default("lexe"),
  LEXE_SIDECAR_URL: z.string().url().default("http://localhost:5393"),
  LEXE_NETWORK: z.enum(["mainnet", "testnet", "regtest"]).default("mainnet"),
  HUB_BASE_URL: z.string().url().default("http://localhost:4002"),
  LEXE_CLIENT_CREDENTIALS: z.string().optional().default(""),
  LEXE_CLIENT_CREDENTIALS_PATH: z.string().optional().default(""),
  LEXE_ROOT_SEED: z.string().optional().default(""),
  LEXE_ROOT_SEED_PATH: z.string().optional().default(""),
  LEXE_DATA_DIR: z.string().optional().default(""),
  LEXE_AUTOSPAWN: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  LND_REST_URL: z.string().url().default("https://127.0.0.1:8080"),
  LND_MACAROON_HEX: z.string().optional().default(""),
  LND_MACAROON_PATH: z.string().optional().default(""),
  LND_TLS_CERT_PATH: z.string().optional().default(""),
  LND_TLS_CERT_PEM: z.string().optional().default(""),
  LND_TLS_SKIP_VERIFY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  LND_PRIVATE_INVOICES: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  HUB_ADMIN_TOKEN: z.string().optional().default(""),

  HUB_MAX_ROUTING_FEE_SATS: z.coerce.number().int().nonnegative().default(50),
  HUB_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(500),
  HUB_DEFAULT_INVOICE_EXPIRY_SECS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),

  PORT_HUB: z.coerce.number().int().positive().default(4002),
  TG_BOT_URL: z.string().url().default("http://localhost:4004"),
  USE_MOCKS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  HUB_LOG_PRETTY: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid hub environment:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
export const REPO_ROOT = repoRoot;
