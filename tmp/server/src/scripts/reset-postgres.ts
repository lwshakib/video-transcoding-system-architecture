/**
 * PostgreSQL Database Table Reset Script.
 * This script automates the complete deletion of the video library records 
 * and schema to ensure the system starts with zero database overhead.
 * 
 * Flow:
 * 1. Establish a single client connection to the Neon/Postgres endpoint.
 * 2. Execute 'DROP TABLE' for the core 'videos' table.
 * 3. Cascade dependencies to ensure foreign keys or constraints are also purged.
 */

import pg from "pg";
import { DATABASE_URL } from "../envs";
import logger from "../logger/winston.logger";

/**
 * Main Database Orchestration Function for Postgres Reset.
 */
async function resetPostgres() {
  logger.info("🗑️ Purging Postgres database tables...");

  const connectionString = DATABASE_URL;

  // Validation: Ensure the script has the DATABASE_URL required for SQL execution.
  if (!connectionString) {
    logger.error("❌ Missing DATABASE_URL credentials. Cannot proceed with schema reset.");
    process.exit(1);
  }

  // Create a specialized PG client for the reset operation.
  const client = new pg.Client({ connectionString });

  // Define the core destructive SQL query.
  // DROP TABLE IF EXISTS: Ensures idempotency (no error if already deleted).
  // CASCADE: Discards any dependent objects (triggers, indices) tied to the 'videos' table.
  const resetQuery = `
    DROP TABLE IF EXISTS videos CASCADE;
  `;

  try {
    // 1. Handshake: Establish the network connection to the Postgres server.
    await client.connect();
    
    // 2. Execution: Dispatch the drop command to clear the table registry.
    await client.query(resetQuery);
    
    logger.info("✅ Postgres tables and dependencies dropped successfully.");
  } catch (error) {
    // Catch and log SQL-level permission or connection failures.
    logger.error("❌ Postgres reset failed:", error);
    process.exit(1);
  } finally {
    // 3. Cleanup: Close the client session to free up Neon connection slots.
    await client.end();
  }
}

// Execute the reset and handle the process lifecycle.
resetPostgres().then(() => {
  process.exit(0);
});
