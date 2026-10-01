import { logger } from "@exosquad/logger";
import { WorkerApp } from "./app.js";

async function main(): Promise<void> {
  const app = new WorkerApp();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Received shutdown signal");
    await app.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.start();
}

main().catch((err: unknown) => {
  logger.fatal({ err }, "Fatal error during worker startup");
  process.exit(1);
});
