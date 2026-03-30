import dotenv from "dotenv";

dotenv.config();

function getEnv(key: string, required = true, defaultValue?: string): string {
    const value = process.env[key];
    if (required && !value && defaultValue === undefined) {
        throw new Error(`❌ Missing required environment variable: ${key}`);
    }
    return value || defaultValue || "";
}

// AWS GLOBAL CONFIGURATION
export const AWS_REGION = getEnv("AWS_REGION");
export const AWS_ACCESS_KEY_ID = getEnv("AWS_ACCESS_KEY_ID");
export const AWS_SECRET_ACCESS_KEY = getEnv("AWS_SECRET_ACCESS_KEY");

// S3 CONFIGURATION
export const S3_BUCKET_NAME = getEnv("S3_BUCKET_NAME");

// DATABASE CONFIGURATION
export const DATABASE_URL = getEnv("DATABASE_URL");

// TRANSCODING CONTEXT
export const VIDEO_ID = getEnv("VIDEO_ID");
export const VIDEO_URL = getEnv("VIDEO_URL"); // e.g. videos/<id>/filename.mp4
