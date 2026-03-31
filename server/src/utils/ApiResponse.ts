/**
 * Standard API Response Wrapper.
 * This class ensures that all successful API responses follow a consistent JSON structure.
 * This uniformity simplifies Frontend development, as the client can always expect 
 * 'success', 'message', and 'data' fields in the response payload.
 */
class ApiResponse {
  // Numeric HTTP status code (e.g. 200 for OK, 201 for Created).
  statusCode: number;
  
  // The primary data payload of the response. Can be an object, array, or null.
  data: any;
  
  // A human-readable success message or summary of the action performed.
  message: string;
  
  // A helper boolean flag derived directly from the status code.
  // This allows frontend developers to check (response.success) instead of parsing ranges.
  success: boolean;

  /**
   * Constructs a new ApiResponse instance.
   * @param statusCode - The specific HTTP status code for this success.
   * @param data - The result data to be sent back to the user.
   * @param message - An optional message to include in the JSON (default: generic 'Success').
   */
  constructor(statusCode: number, data: any, message = "Success") {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    
    // Automatic success determination: Codes 200-399 are considered successful operations.
    this.success = statusCode < 400;
  }
}

// Export the class for use in Express route controllers.
export { ApiResponse };
