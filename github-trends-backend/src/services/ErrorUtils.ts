export class UserFacingError extends Error {
  public code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'UserFacingError';
    this.code = code;
  }
}

/**
 * Convert an error to a safe string message.
 * @param err The error to convert.
 * @returns A safe string message.
 */
export function toSafeFailedReason(err: unknown): string {
  if (err instanceof UserFacingError) {
    return err.message;
  }

  // Allow plain string reasons if explicitly provided
  if (typeof err === 'string') {
    return err;
  }

  // Fallback generic message for unexpected/internal errors
  return 'An unexpected error occurred. Please try again later.';
} 