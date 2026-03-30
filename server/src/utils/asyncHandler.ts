/**
 * Async Route Handler Wrapper.
 * This Higher-Order Function (HOF) wraps asynchronous Express route handlers
 * to ensure that any rejected promises are automatically caught and passed 
 * to the next() error-handling middleware.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Higher-order function that wraps async route handlers to catch errors.
 * @param requestHandler - An asynchronous function that takes (req, res, next)
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
    // Standard Promise wrapping technique to catch errors without try/catch blocks in routes
    Promise.resolve(requestHandler(req, res, next)).catch(next);
  };

export { asyncHandler };
