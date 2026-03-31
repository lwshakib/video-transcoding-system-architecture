/**
 * Environment configuration module.
 * This file is responsible for loading and validating all required environment variables 
 * from the .env file or the system environment (for Docker/ECS deployments).
 */

import dotenv from "dotenv";

// Initialize dotenv to load environment variables from a .env file if one exists locally.
dotenv.config();

/**
 * Utility function to retrieve an environment variable.
 * @param key - The name of the environment variable.
 * @param required - Whether the variable must be present (defaults to true).
 * @param defaultValue - An optional fallback value if the variable is not set.
 * @returns The value of the environment variable or the default value.
 * @throws Error if the variable is required and missing.
 */
function getEnv(key: string, required = true, defaultValue?: string): string {
    const value = process.env[key];
    
    // If the variable is mandatory and hasn't been set, we halt execution with a clear error.
    if (required && !value && defaultValue === undefined) {
        throw new Error(`❌ Missing required environment variable: ${key}`);
    }
    
    // Return the value, the default, or an empty string as a safe fallback.
    return value || defaultValue || "";
}

// AWS GLOBAL CONFIGURATION: Used for authenticating with AWS S3, SQS, and CloudWatch.
export const AWS_REGION = getEnv("AWS_REGION"); // The physical AWS region (e.g., 'ap-south-1').
export const AWS_ACCESS_KEY_ID = getEnv("AWS_ACCESS_KEY_ID"); // IAM access key for secure API calls.
export const AWS_SECRET_ACCESS_KEY = getEnv("AWS_SECRET_ACCESS_KEY"); // IAM secret key.

// S3 CONFIGURATION: Deployment destination for processed video assets.
export const S3_BUCKET_NAME = getEnv("S3_BUCKET_NAME");

// DATABASE CONFIGURATION: Connection string for the Neon (PostgreSQL) database.
export const DATABASE_URL = getEnv("DATABASE_URL");

// TRANSCODING CONTEXT: Parameters injected into the container by the server or ECS task launcher.
export const VIDEO_ID = getEnv("VIDEO_ID"); // Unique identifier for the video record in the DB.
export const VIDEO_URL = getEnv("VIDEO_URL"); // The S3 key/path of the original source video (e.g. videos/<id>/source.mp4).
