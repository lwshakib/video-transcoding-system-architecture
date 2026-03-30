/**
 * Custom API Error Class.
 * This class extends the native Error to provide additional context for HTTP responses,
 * such as status codes and specific error details. It is designed to be caught 
 * by the centralized errorHandler middleware.
 */
export class ApiError extends Error {
  // HTTP status code (e.g., 400, 404, 500)
  readonly statusCode: number;
  // Always null for error responses to maintain consistent payload shape
  readonly data: null;
  // Explicit flag to indicate failure to the client
  readonly success: false;
  // Array to store multiple error details (e.g., Zod validation issues)
  readonly errors: unknown[];

  /**
   * @param statusCode - The HTTP status code
   * @param message - Human-readable error message
   * @param errors - Array of specific error details
   * @param stack - Optional stack trace override
   */
  constructor(
    statusCode: number,
    message: string = "Something went wrong",
    errors: unknown[] = [],
    stack: string = ""
  ) {
    // Call the parent Error constructor
    super(message);

    this.statusCode = statusCode;
    this.data = null;
    this.success = false;
    this.errors = errors;

    // Handle stack trace generation or override
    if (stack) {
      this.stack = stack;
    } else {
      // captureStackTrace is a V8-specific method that creates the .stack property 
      // on the instance, excluding the constructor call itself from the trace.
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
