/**
 * PostgreSQL Database Service.
 * Manages the connection pool for the main relational database,
 * which stores project metadata, subdomains, and deployment records.
 */

import { Pool, PoolConfig } from 'pg';
import logger from "../logger/winston.logger";
import { DATABASE_URL } from "../envs";

class PostgresService {
  // Shared connection pool for efficient resource management
  private pool: Pool;

  /**
   * Initializes the database connection pool using the DATABASE_URL.
   * All connection parameters including SSL are handled via the URI string.
   */
  constructor() {
    const connectionString = DATABASE_URL;

    if (!connectionString) {
      throw new Error("❌ DATABASE_URL environment variable is missing.");
    }

    const config: PoolConfig = {
      connectionString,
    };

    // Initialize the pool
    this.pool = new Pool(config);

    // Global error listener for the pool to handle unexpected connection drops
    this.pool.on('error', (err: Error) => {
      logger.error('Unexpected error on idle PostgreSQL client', err);
      // Hard exit on fatal DB error to allow container orchestrator to restart
      process.exit(-1);
    });
  }

  /**
   * Execute a SQL query using a client from the pool.
   * @param text - The SQL query string
   * @param params - Optional parameter array for the query
   * @returns The result of the query
   */
  async query(text: string, params?: any[]) {
    const start = Date.now();
    try {
      // Automatic checkout/release from the pool
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      // Log query execution time for performance monitoring
      logger.info('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      logger.error('Database query error', error);
      throw error;
    }
  }

  /**
   * Gracefully shuts down the connection pool.
   */
  async close() {
    await this.pool.end();
    logger.info("👋 Postgres disconnected");
  }
}

// Export a singleton instance for application-wide use
export const postgresService = new PostgresService();
export default postgresService;
