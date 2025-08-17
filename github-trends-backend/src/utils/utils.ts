import { FastifyBaseLogger } from "fastify";

/**
 * Safely parse JSON string with error handling and logging
 * @param jsonString - The JSON string to parse
 * @param logger - Optional logger for error reporting
 * @param context - Context information for logging (e.g., cache key, operation type)
 * @returns Parsed object or null if parsing fails
 */
export function safeJsonParse(
  jsonString: string,
  logger?: FastifyBaseLogger,
  context?: Record<string, any>
): any | null {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (logger) {
      logger.error('Error parsing JSON data', {
        ...context,
        error: errorMessage
      });
    }
    return null;
  }
}