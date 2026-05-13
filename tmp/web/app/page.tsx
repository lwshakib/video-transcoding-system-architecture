"use client";

/**
 * Modern Video Transcoding Dashboard.
 * This is the primary entry point for the frontend application.
 * It manages the global state for videos, handles real-time upload progress,
 * and orchestrates the lifecycle of video objects from creation to deletion.
 */

import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { VideoUpload } from "@/components/video-upload";
import { VideoList, VideoItem } from "@/components/video-list";

export default function Home() {
  // State to store the list of videos (both server-side and active uploads).
  const [videos, setVideos] = useState<VideoItem[]>([]);
  // State to manage the initial loading skeleton of the video list.
  const [loading, setLoading] = useState(true);
  // Store AbortControllers for active uploads to allow users to cancel mid-flight.
  const [abortControllers, setAbortControllers] = useState<Record<string, AbortController>>({});

  /**
   * Fetches the official video library from the backend API.
   * Uses useCallback to prevent unnecessary re-renders in the useEffect dependency array.
   */
  const fetchVideos = useCallback(async () => {
    try {
      // Retrieve the API base URL from environment variables.
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      // Perform a GET request to retrieve all video records.
      const { data } = await axios.get(`${API_URL}/videos`);
      
      /**
       * Merge Logic: We prioritize keeping local 'UPLOADING' items in the state.
       * This ensures that as the server list refreshes, active uploads aren't 
       * blinked out of existence before they appear in the database.
       */
      setVideos((prev) => {
        // 1. Identify videos currently being uploaded in this browser session.
        const uploadingItems = prev.filter(v => v.status === "UPLOADING");
        // 2. Filter server items to remove duplicates that are already in the uploadingItems list.
        const serverItems = data.filter((v: VideoItem) => !uploadingItems.find(u => u.id === v.id));
        // 3. Combine both lists (Active Uploads stay at the top).
        return [...uploadingItems, ...serverItems];
      });
    } catch (err) {
      // Log errors but allow the UI to remain interactive.
      console.error("Failed to fetch videos from API:", err);
    } finally {
      // Dismiss the loading state regardless of the result.
      setLoading(false);
    }
  }, []);

  /**
   * Initial mount effect: Triggers the first video fetch when the page loads.
   */
  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  /**
   * Event Handler: Triggered when a user selects a file for upload.
   * @param newVideo - A temporary VideoItem object representing the upload.
   * @param controller - The AbortController for the XHR/Fetch request.
   */
  const handleVideoAdded = (newVideo: VideoItem, controller: AbortController) => {
    // Optimistically add the video to the top of the list.
    setVideos((prev) => [newVideo, ...prev]);
    // Associate the AbortController with this video's unique ID.
    setAbortControllers((prev) => ({ ...prev, [newVideo.id]: controller }));
  };

  /**
   * Event Handler: Updates the percentage progress of an active upload.
   * @param videoId - The local unique ID of the uploading video.
   * @param progress - The current numeric percentage (0-100).
   */
  const handleProgress = (videoId: string, progress: number) => {
    setVideos((prev) => 
      // Efficiently map the state and update only the specific video progress.
      prev.map((v) => (v.id === videoId ? { ...v, progress } : v))
    );
  };

  /**
   * Event Handler: Triggered when the S3 upload finishes and the server creates a DB record.
   * @param oldId - The temporary local ID used during upload.
   * @param updatedVideo - The official Video record returned from the backend.
   */
  const handleComplete = (oldId: string, updatedVideo: VideoItem) => {
    setVideos((prev) => 
      // Swap the temporary object with the official database object.
      prev.map((v) => (v.id === oldId ? updatedVideo : v))
    );
    // Cleanup: Remove the AbortController as the upload is no longer active.
    setAbortControllers((prev) => {
      const next = { ...prev };
      delete next[oldId];
      return next;
    });
  };

  /**
   * Event Handler: Cancels an active upload and removes it from the UI.
   * @param videoId - The ID of the video to abort.
   */
  const handleAbort = (videoId: string) => {
    const controller = abortControllers[videoId];
    if (controller) {
      // Signal the browser to stop the upload request immediately.
      controller.abort();
    }
    // Remove the video from the UI state.
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
    // Remove the controller from the tracking map.
    setAbortControllers((prev) => {
      const next = { ...prev };
      delete next[videoId];
      return next;
    });
  };

  /**
   * Event Handler: Deletes a video permanently from S3 and the database.
   * @param id - The official database UUID of the video.
   */
  const handleDeleteVideo = async (id: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      // Dispatch a DELETE request to the backend.
      await axios.delete(`${API_URL}/videos/${id}`);
      // Refresh the video list to reflect the change.
      fetchVideos();
    } catch (err) {
      // Provide user feedback on failure.
      console.error("Failed to delete video:", err);
      alert("Failed to delete video. Please try again.");
    }
  };

  return (
    // Root container with dark theme styles and emerald accents.
    <div className="flex flex-col min-h-screen bg-zinc-950 font-sans selection:bg-emerald-500/30">
      <main className="relative z-10 flex flex-col flex-1 items-center p-6 sm:p-12 mt-10">
        <div className="w-full flex flex-col items-center max-w-2xl gap-16">
          {/* Component: Handles file selection and multi-part S3 upload orchestration */}
          <VideoUpload 
            onVideoAdded={handleVideoAdded} 
            onProgress={handleProgress}
            onComplete={handleComplete}
          />
          {/* Component: Renders the list of videos with status tracking and deletion controls */}
          <VideoList 
            videos={videos} 
            loading={loading}
            onDelete={handleDeleteVideo} 
            onAbort={handleAbort}
          />
        </div>
      </main>
    </div>
  );
}
