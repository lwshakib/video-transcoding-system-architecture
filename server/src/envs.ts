/**
 * Main Server Environment Configuration.
 * This module is the central authority for loading and validating all environment variables
 * required for the backend server to communicate with external infrastructure like AWS and PostgreSQL.
 */

import dotenv from "dotenv";

// Initialize dotenv to parse the .env file and populate process.env.
dotenv.config();

/**
 * Utility function to retrieve an environment variable with optional validation.
 * @param key - The exact name of the environment variable (e.g., "AWS_REGION").
 * @param required - If true, the server will throw an error if the variable is missing (default: true).
 * @param defaultValue - An optional fallback value if the variable is not defined.
 * @returns The resolved value of the environment variable.
 * @throws Error if a required variable is missing and no default is provided.
 */
function getEnv(key: string, required = true, defaultValue?: string): string {
    const value = process.env[key];
    
    // Check if the variable is mandatory but missing.
    if (required && !value && defaultValue === undefined) {
        // We halt the server startup to prevent partially configured, unstable states.
        throw new Error(`❌ Missing required environment variable: ${key}`);
    }
    
    // Return the found value, the default value, or a safe empty string.
    return value || defaultValue || "";
}

// --- SERVER INSTANCE CONFIGURATION ---
// Environment mode (development, production)
export const NODE_ENV = getEnv("NODE_ENV", false, "development");
// Internal port for the Express server (default: 8000)
export const PORT = parseInt(getEnv("PORT", false, "8000"), 10);

// --- AWS GLOBAL CONFIGURATION ---
// AWS region for all service interactions (e.g., 'ap-south-1')
export const AWS_REGION = getEnv("AWS_REGION", false, "ap-south-1");
// IAM credentials used for S3, SQS, and ECS operations
export const AWS_ACCESS_KEY_ID = getEnv("AWS_ACCESS_KEY_ID", false);
export const AWS_SECRET_ACCESS_KEY = getEnv("AWS_SECRET_ACCESS_KEY", false);
// The URL of the SQS queue that triggers the build-container process
export const AWS_SQS_QUEUE_URL = getEnv("AWS_SQS_QUEUE_URL", false);

// --- S3 BUCKET CONFIGURATION ---
// The S3 bucket where deployment artifacts are stored and served from
export const S3_BUCKET_NAME = getEnv("S3_BUCKET_NAME", false);

// --- POSTGRESQL (MAIN DB) CONFIGURATION ---
// The full connection URI for the Neon database.
export const DATABASE_URL = getEnv("DATABASE_URL", false);

// --- AWS ECS (COMPUTE) CONFIGURATION ---
// Name of the container within the Task Definition
export const ECS_CONTAINER_NAME = getEnv("ECS_CONTAINER_NAME", false, "transcoding-container");
// ARN of the ECS cluster where builds will run
export const ECS_CLUSTER_ARN = getEnv("ECS_CLUSTER_ARN", false);
// ARN of the Task Definition to use for build containers
export const ECS_TASK_DEFINITION_ARN = getEnv("ECS_TASK_DEFINITION_ARN", false);
// Networking configurations for Fargate tasks (formatted as comma-separated strings)
export const ECS_SUBNETS = getEnv("ECS_SUBNETS", false);
export const ECS_SECURITY_GROUPS = getEnv("ECS_SECURITY_GROUPS", false);

// Kafka and ClickHouse variables are omitted as per user request.
