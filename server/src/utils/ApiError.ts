/**
 * Custom API Error Class.
 * This class extends the native JavaScript Error to provide structured metadata 
 * specifically tailored for HTTP/REST API responses.
 * 
 * Benefits:
 * 1. Consistent error payload structure across the entire backend.
 * 2. Ability to attach numeric HTTP status codes (400, 404, 500, etc.).
 * 3. Support for complex error details (e.g. nested validation failures).
 */
export class ApiError extends Error {
  // The numeric HTTP status code to be returned to the client.
  readonly statusCode: number;
  
  // Hardcoded to null to ensure error responses maintain a consistent JSON shape 
  // where the 'data' field is always present but empty.
  readonly data: null;
  
  // A boolean 'success' flag, hardcoded to false for this class.
  readonly success: false;
  
  // A generic array to store granular error details (e.g. Zod or Joi validation issues).
  readonly errors: unknown[];

  /**
   * Constructs a new ApiError instance.
   * @param statusCode - The specific HTTP status code for this error.
   * @param message - A human-readable summary of what went wrong (default: generic).
   * @param errors - An optional array of additional error metadata or sub-errors.
   * @param stack - An optional pre-captured stack trace.
   */
  constructor(
    statusCode: number,
    message: string = "Something went wrong",
    errors: unknown[] = [],
    stack: string = ""
  ) {
    // Invoke the parent Error constructor with the primary message.
    super(message);

    this.statusCode = statusCode;
    this.data = null; // Error payloads should not contain data.
    this.success = false;
    this.errors = errors;

    // Logic to either apply a provided stack trace or generate a new one.
    if (stack) {
      // Use the provided stack if we are wrapping an existing error.
      this.stack = stack;
    } else {
      // V8-specific helper: captures the current execution stack.
      // This allows developers to see exactly where in the code the error was thrown.
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
