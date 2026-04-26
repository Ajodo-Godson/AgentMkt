import { pino, type Logger, type LoggerOptions } from "pino";
import { env } from "./env.js";

const baseOptions: LoggerOptions = {
  level: env.NODE_ENV === "production" ? "info" : "debug",
  base: { service: "hub" },
  // Always include job_id / step_id at the top level when present so logs are
  // grep-friendly across services.
  redact: ["preimage", "*.preimage", "*.LEXE_CLIENT_CREDENTIALS"],
};

export const logger: Logger = env.HUB_LOG_PRETTY
  ? pino({
      ...baseOptions,
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
      },
    })
  : pino(baseOptions);

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
