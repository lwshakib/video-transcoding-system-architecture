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

  // Schema: Projects table stores repository and sub-domain mapping
  const createProjectsTable = `
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      git_url TEXT NOT NULL,
      sub_domain TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // Schema: Deployments table tracks the status of builds linked to projects
  const createDeploymentsTable = `
    CREATE TABLE IF NOT EXISTS deployments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'QUEUED',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    // 1. Create Projects table
    await client.query(createProjectsTable);
    logger.info("✅ Projects table is ready.");
    
    // 2. Create Deployments table
    await client.query(createDeploymentsTable);
    logger.info("✅ Deployments table is ready.");
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
