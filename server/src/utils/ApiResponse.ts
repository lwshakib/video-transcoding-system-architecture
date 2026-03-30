/**
 * Standard API Response Wrapper.
 * This class ensures that all successful API responses follow a consistent
 * structure, making it easier for front-end clients to parse and handle data.
 */
class ApiResponse {
  // HTTP status code (e.g., 200, 201)
  statusCode: number;
  // The primary data payload of the response
  data: any;
  // Human-readable summary message (default: "Success")
  message: string;
  // Boolean flag derived from the status code for easy checking
  success: boolean;

  /**
   * @param statusCode - HTTP status code
   * @param data - Any data to be returned to the client
   * @param message - Optional success message
   */
  constructor(statusCode: number, data: any, message = "Success") {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    // Automatic success flag determination based on HTTP conventions
    this.success = statusCode < 400;
  }
}

export { ApiResponse };
