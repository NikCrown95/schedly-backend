import { buildApp } from "./app.js";
import { env } from "@config/env.js";
import { logger } from "@shared/lib/logger.js";

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    logger.info(`🚀 Schedly API listening on ${env.APP_URL} (docs at /docs)`);
  } catch (err) {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
