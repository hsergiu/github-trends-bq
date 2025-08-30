import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { apiRoutes } from "./api/routes";
import RedisService from "./redis/RedisService";
import { safeErrorHandler } from "./middleware/SafeErrorHandler";

export const createApp = async (): Promise<FastifyInstance> => {
  const app: FastifyInstance = Fastify({
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
        },
      },
    },
  });

  const redisService = RedisService.getInstance(app.log);
  await redisService.initializeService();

  app.register(safeErrorHandler);

  app.register(cors, {
    origin: true,
  });

  app.register(apiRoutes, { prefix: "/api" });

  app.get("/", async () => {
    return { message: "GitHub Trends Analyzer API" };
  });

  return app;
};
