import pino from "pino";
import { env } from "@config/env.js";

// Log strutturato. Non registrare mai password, token o segreti (redact espliciti).
export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  redact: {
    paths: [
      "req.headers.authorization",
      "*.password",
      "*.passwordHash",
      "*.password_hash",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
    ],
    censor: "[REDACTED]",
  },
});
