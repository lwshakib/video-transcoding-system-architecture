/**
 * Postgres Service.
 * This module manages the connection to the PostgreSQL database (hosted on Neon).
 * It provides high-level methods to update the transcoding status of videos.
 */

import { Pool } from "pg";
import logger from "../logger/winston.logger";
import { DATABASE_URL, VIDEO_ID } from "../envs";

class PostgresService {
  // The 'Pool' manages multiple database client connections for efficiency and reuse.
  private pool: Pool;

  constructor() {
    // Initialize the pool using the connection string from environment variables.
    this.pool = new Pool({
      connectionString: DATABASE_URL,
    });

    // Listen for unexpected errors on idle clients in the pool to prevent process crashes.
    this.pool.on("error", (err) => {
      logger.error("❌ Unexpected error on idle client", err);
    });
  }

  /**
   * General purpose query method.
   * Executes an SQL query using a client from the pool.
   * @param text - The SQL query string.
   * @param params - Optional parameters for the SQL query (parameterized queries).
   */
  async query(text: string, params?: any[]) {
    try {
      // Execute the query and return the result set.
      const res = await this.pool.query(text, params);
      return res;
    } catch (err) {
      // Log any database-level errors before re-throwing.
      logger.error("❌ Database query error", err);
      throw err;
    }
  }

  /**
   * Updates the video status to 'PROCESSING'.
   * Called when the transcoding container starts its operation.
   */
  async setProcessing() {
    // Transition the video record to indicate work is underway.
    await this.query("UPDATE videos SET status = 'PROCESSING' WHERE id = $1", [VIDEO_ID]);
    logger.info(`✅ Status updated to PROCESSING for video: ${VIDEO_ID}`);
  }

  /**
   * Updates the video status to 'COMPLETED'.
   * Called when the HLS transcoding and all secondary tasks (thumbnails, captions) succeed.
   */
  async setCompleted() {
    // Mark the video as ready for playback in the web application.
    await this.query(
      "UPDATE videos SET status = 'COMPLETED' WHERE id = $1", 
      [VIDEO_ID]
    );
    logger.info(`✅ Status updated to COMPLETED for video: ${VIDEO_ID}`);
  }

  /**
   * Updates the video status to 'FAILED'.
   * Called if a critical error occurs during the main transcoding pipeline.
   */
  async setFailed() {
    // Ensure the UI reflects that the transcoding attempt was unsuccessful.
    await this.query("UPDATE videos SET status = 'FAILED' WHERE id = $1", [VIDEO_ID]);
    logger.info(`❌ Status updated to FAILED for video: ${VIDEO_ID}`);
  }

  /**
   * Gracefully closes the database pool.
   * Ensures all active connections are drained before the container exits.
   */
  async end() {
    await this.pool.end();
  }
}

// Export a singleton instance to be shared across the application.
export const postgresService = new PostgresService();
export default postgresService;
