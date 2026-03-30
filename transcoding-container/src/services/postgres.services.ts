import { Pool } from "pg";
import logger from "../logger/winston.logger";
import { DATABASE_URL, VIDEO_ID } from "../envs";

class PostgresService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: DATABASE_URL,
    });

    this.pool.on("error", (err) => {
      logger.error("❌ Unexpected error on idle client", err);
    });
  }

  /**
   * General purpose query method
   */
  async query(text: string, params?: any[]) {
    try {
      const res = await this.pool.query(text, params);
      return res;
    } catch (err) {
      logger.error("❌ Database query error", err);
      throw err;
    }
  }

  /**
   * Updates the video status to Processing
   */
  async setProcessing() {
    await this.query("UPDATE videos SET status = 'PROCESSING' WHERE id = $1", [VIDEO_ID]);
    logger.info(`✅ Status updated to PROCESSING for video: ${VIDEO_ID}`);
  }

  /**
   * Updates the video to Completed, saving URLs
   */
  async setCompleted(m3u8Url: string, subtitlesUrl?: string) {
    if (subtitlesUrl) {
      await this.query(
        "UPDATE videos SET status = 'COMPLETED', m3u8_url = $1, subtitles_url = $2 WHERE id = $3", 
        [m3u8Url, subtitlesUrl, VIDEO_ID]
      );
    } else {
      await this.query(
        "UPDATE videos SET status = 'COMPLETED', m3u8_url = $1 WHERE id = $2", 
        [m3u8Url, VIDEO_ID]
      );
    }
    logger.info(`✅ Status updated to COMPLETED for video: ${VIDEO_ID}`);
  }

  /**
   * Updates the video status to Failed
   */
  async setFailed() {
    await this.query("UPDATE videos SET status = 'FAILED' WHERE id = $1", [VIDEO_ID]);
    logger.info(`❌ Status updated to FAILED for video: ${VIDEO_ID}`);
  }

  /**
   * Closes the database pool
   */
  async end() {
    await this.pool.end();
  }
}

export const postgresService = new PostgresService();
export default postgresService;
