import { FastifyInstance } from "fastify";
import { toSafeFailedReason } from "../services/ErrorUtils";

/**
 * Global Fastify error handler that converts internal errors into
 * user-facing safe messages.
 *
 * This middleware should be registered early (before route declarations)
 * so that it can intercept errors thrown from controllers or other
 * plugins in the request/response lifecycle.
 */
export const safeErrorHandler = async (fastify: FastifyInstance) => {
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    const safeMessage = toSafeFailedReason(error);

    const statusCode = (error as any)?.statusCode ?? (error as any)?.validation ? 400 : 500;

    reply.status(statusCode).send({ error: safeMessage });
  });
};
