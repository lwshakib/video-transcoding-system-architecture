/**
 * PostgreSQL Database Reset Script.
 * This script automates the deletion of all application tables ('deployments' and 'projects')
 * to ensure a clean state for the database.
 */

import pg from "pg";
import { DATABASE_URL } from "../envs";
import logger from "../logger/winston.logger";

/**
 * Main Reset function for PostgreSQL.
 */
async function resetPostgres() {
  logger.info("🗑️ Resetting Postgres database...");

  const connectionString = DATABASE_URL;

  // Validation: Ensure required environment variables are set before proceeding
  if (!connectionString) {
    logger.error("❌ Missing DATABASE_URL environment variable.");
    process.exit(1);
  }

  // Create and connect the PG client using the connection string
  const client = new pg.Client({ connectionString });

  // Define the reset query: Drop tables with CASCADE to handle foreign key dependencies
  const resetQuery = `
    DROP TABLE IF EXISTS videos CASCADE;
  `;

  try {
    // 1. Establish connection to the database
    await client.connect();
    
    // 2. Execute the drop table commands
    await client.query(resetQuery);
    
    logger.info("✅ Postgres tables dropped successfully.");
  } catch (error) {
    logger.error("❌ Postgres reset failed:", error);
    process.exit(1);
  } finally {
    // 3. Gracefully close the database connection
    await client.end();
  }
}

resetPostgres().then(() => {
  process.exit(0);
});
