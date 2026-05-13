/**
 * PostgreSQL Database Service.
 * This module manages the connection lifecycle for the primary relational database (Neon/Postgres).
 * It uses a Connection Pool to efficiently handle multiple concurrent requests without 
 * the overhead of creating a new physical connection for every SQL query.
 */

import { Pool, PoolConfig } from 'pg';
import logger from "../logger/winston.logger";
import { DATABASE_URL } from "../envs";

class PostgresService {
  // Shared connection pool instance for centralized resource management.
  private pool: Pool;

  /**
   * Infrastructure Initialization.
   * Parses the DATABASE_URL connection string and establishes the baseline pool configuration.
   */
  constructor() {
    // The connection URI containing the host, user, password, and DB name.
    const connectionString = DATABASE_URL;

    // Critical check: If the URL is missing, we cannot proceed with any data-driven tasks.
    if (!connectionString) {
      throw new Error("❌ DATABASE_URL environment variable is missing.");
    }

    // Standard driver configuration for the 'pg' library.
    const config: PoolConfig = {
      connectionString,
    };

    // Instantiate the pool. 
    // Physical connections are opened lazily as needed.
    this.pool = new Pool(config);

    // Global 'error' listener to catch fatal issues on idle clients (e.g. server-side timeouts).
    this.pool.on('error', (err: Error) => {
      logger.error('Unexpected error on idle PostgreSQL client', err);
      // In a production environment, we exit the process to allow the orchestrator (ECS/PM2) 
      // to restart a fresh container and restore connectivity.
      process.exit(-1);
    });
  }

  /**
   * Executes a parameterized SQL query.
   * This method handles the 'checkout' and 'release' lifecycle of clients internally.
   * @param text - The raw SQL query string with placeholders (e.g., SELECT * FROM table WHERE id = $1).
   * @param params - An array of values to safely inject into the query placeholders.
   * @returns The standard 'pg' QueryResult object.
   */
  async query(text: string, params?: any[]) {
    // Track the start time to monitor database performance and latency.
    const start = Date.now();
    try {
      // Execute the query via the pool.
      const res = await this.pool.query(text, params);
      // Calculate how long the database took to respond.
      const duration = Date.now() - start;
      
      // Log the query telemetry for observability and debugging.
      logger.info('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      // Catch and log SQL syntax errors, constraint violations, or network timeouts.
      logger.error('Database query error', error);
      throw error;
    }
  }

  /**
   * Gracefully shuts down the connection pool.
   * Should be called during internal server maintenance or application shutdown.
   */
  async close() {
    // Ends all active and idle connections in the pool.
    await this.pool.end();
    logger.info("👋 Postgres disconnected");
  }
}

// Export a singleton instance to the rest of the application.
export const postgresService = new PostgresService();
export default postgresService;
