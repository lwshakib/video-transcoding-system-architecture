/**
 * PostgreSQL Database Setup Script.
 * This script initializes the main application database by:
 * 1. Establishing a connection using either a URL or individual parameters.
 * 2. Creating the 'projects' and 'deployments' tables with appropriate schemas and relations.
 */

import pg from "pg";
import { DATABASE_URL } from "../envs";
import logger from "../logger/winston.logger";

/**
 * Main Setup function for PostgreSQL.
 */
async function setupPostgres() {
  const connectionString = DATABASE_URL;

  // Validation: Ensure required environment variables are set before proceeding
  if (!connectionString) {
    logger.error("❌ Missing DATABASE_URL environment variable.");
    process.exit(1);
  }

  // Create and connect the PG client using the connection string
  const client = new pg.Client({ connectionString });
  await client.connect();

  logger.info("🚀 Starting PostgreSQL setup...");

  // Schema: Videos table stores the core transcoding task metadata
  const createVideosTable = `
    CREATE TABLE IF NOT EXISTS videos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      m3u8_url TEXT, -- Optional, populated after transcoding
      subtitles_url TEXT, -- Optional, populated after AI transcription
      status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, QUEUED, PROCESSING, COMPLETED, FAILED
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    // 1. Create Videos table
    await client.query(createVideosTable);
    logger.info("✅ Videos table is ready.");
  } catch (error) {
    logger.error("❌ PostgreSQL setup failed:", error);
    process.exit(1);
  } finally {
    // 3. Gracefully close the database connection
    await client.end();
    logger.info("👋 Database connection closed.");
  }
}

setupPostgres().then(() => {
  process.exit(0);
});
