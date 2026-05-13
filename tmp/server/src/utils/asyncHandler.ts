/**
 * Async Route Handler Wrapper.
 * This is a Higher-Order Function (HOF) that wraps a standard asynchronous 
 * Express route handler. It provides a centralized, standard promise-catch 
 * mechanism, eliminating the need to use boilerplate 'try/catch' blocks in every route.
 * 
 * Benefits:
 * 1. Code DRYness: No more repeating error handling logic in routes.
 * 2. Reliability: Any unhandled exception or rejected promise is automatically 
 *    caught and passed to the next() error-handling middleware.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Higher-order function that wraps async route handlers to catch errors.
 * @param requestHandler - An asynchronous function that takes (req, res, next) 
 *        and returns a Promise.
 * @returns A standard Express RequestHandler function.
 */
const asyncHandler =
  <T = unknown>(
    requestHandler: (
      req: Request,
      res: Response,
      next: NextFunction
    ) => Promise<T>
  ): RequestHandler =>
  (req, res, next) => {
    // Resolve the promise from the request handler and catch any potential errors.
    // If an error is caught, it's passed directly to (next), which triggers 
    // the global error processing layer.
    Promise.resolve(requestHandler(req, res, next)).catch(next);
  };

// Export the utility for use throughout the Express API routing layer.
export { asyncHandler };
