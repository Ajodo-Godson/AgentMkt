// =============================================================================
// Lexe sidecar process manager.
//
// We optionally spawn the `lexe-sidecar` binary as a child process at hub
// startup. If the binary is missing, we log a clear error and continue —
// this lets developers run the sidecar manually in another terminal during
// the h0–h4 milestone work without the hub crash-looping.
//
// The binary lives at apps/hub/bin/lexe-sidecar (gitignored). See
// apps/hub/README.md for the install steps.
// =============================================================================

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HUB_ROOT = path.resolve(__dirname, "../..");

let child: ChildProcess | null = null;

export function sidecarBinaryPath(): string {
  return path.join(HUB_ROOT, "bin", "lexe-sidecar");
}

export function isSidecarBinaryPresent(): boolean {
  return existsSync(sidecarBinaryPath());
}

export interface StartSidecarOpts {
  /** When true, do nothing if the binary is missing (assume it's run externally). */
  optional?: boolean;
}

export function startSidecar(opts: StartSidecarOpts = {}): ChildProcess | null {
  if (child) return child;

  const binPath = sidecarBinaryPath();
  if (!isSidecarBinaryPresent()) {
    const msg = `Lexe sidecar binary not found at ${binPath}.`;
    if (opts.optional) {
      logger.warn(
        { binPath },
        `${msg} Assuming it's running manually on ${env.LEXE_SIDECAR_URL}. (See apps/hub/README.md)`,
      );
      return null;
    }
    throw new Error(`${msg} Run apps/hub/scripts/install-sidecar.sh first.`);
  }

  logger.info({ binPath }, "spawning lexe sidecar");
  const args: string[] = [];
  if (env.LEXE_CLIENT_CREDENTIALS) {
    args.push("--credentials", env.LEXE_CLIENT_CREDENTIALS);
  }
  args.push("--network", env.LEXE_NETWORK);

  child = spawn(binPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  child.stdout?.on("data", (buf: Buffer) => {
    const lines = buf.toString().split("\n").filter(Boolean);
    for (const line of lines) logger.info({ src: "sidecar" }, line);
  });
  child.stderr?.on("data", (buf: Buffer) => {
    const lines = buf.toString().split("\n").filter(Boolean);
    for (const line of lines) logger.warn({ src: "sidecar" }, line);
  });
  child.on("exit", (code, signal) => {
    logger.error({ code, signal }, "sidecar exited");
    child = null;
  });

  return child;
}

export function stopSidecar(): void {
  if (!child) return;
  logger.info("stopping sidecar");
  child.kill("SIGTERM");
  child = null;
}

/** Block until the sidecar's /v2/health returns 200, or throw after timeoutMs. */
export async function waitForSidecarHealth(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${env.LEXE_SIDECAR_URL}/v2/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) {
        logger.info({ ms: Date.now() - start }, "sidecar healthy");
        return;
      }
    } catch (e) {
      lastErr = e;
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(
    `Lexe sidecar at ${env.LEXE_SIDECAR_URL} did not become healthy in ${timeoutMs}ms. Last error: ${lastErr}`,
  );
}
