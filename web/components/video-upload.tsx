"use client";

/**
 * Interactive Video Upload Component.
 * This component handles the multi-stage upload process:
 * 1. File validation and drag-and-drop interaction.
 * 2. Fetching a secure Pre-Signed URL from the backend.
 * 3. Direct-to-S3 binary upload with real-time progress tracking.
 * 4. Finalizing the database record and triggering the transcoding pipeline.
 */

import React, { useState, useCallback } from "react";
import { Upload, FileVideo, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import axios, { isAxiosError } from "axios";

import { VideoItem } from "./video-list";

interface VideoUploadProps {
  // Callback to inform the parent that a new (temporary) video item has been added.
  onVideoAdded: (video: VideoItem, controller: AbortController) => void;
  // Callback to update the parent on the current upload percentage.
  onProgress: (videoId: string, progress: number) => void;
  // Callback to signal that the upload and DB record creation are successful.
  onComplete: (videoId: string, updatedVideo: VideoItem) => void;
}

export function VideoUpload({ onVideoAdded, onProgress, onComplete }: VideoUploadProps) {
  // State: Tracks if a file is currently hovering over the drop zone.
  const [dragActive, setDragActive] = useState(false);
  // State: Stores human-readable error messages for UI feedback.
  const [error, setError] = useState<string | null>(null);
  // State: Tracks if a network request is currently in flight.
  const [isUploading, setIsUploading] = useState(false);

  /**
   * Handler: Manages the visual 'active' state of the drop zone during drag events.
   */
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  /**
   * Utility: Ensures the selected file is actually a video format.
   */
  const validateFile = (file: File) => {
    if (!file.type.startsWith("video/")) {
      setError("Please upload a valid video file (MP4, MKV, etc.)");
      return false;
    }
    setError(null);
    return true;
  };

  /**
   * Core Orchestrator: Executes the 6-step upload and registration sequence.
   */
  const startUpload = async (file: File) => {
    setIsUploading(true);
    setError(null);
    
    // Create an AbortController to allow users to cancel the upload at any point.
    const controller = new AbortController();
    // Generate a temporary ID for UI tracking before we have a real DB UUID.
    const tempId = `temp-${Date.now()}`;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      
      // --- STEP 1: PRE-SIGNED URL ---
      // Request a secure upload path from the backend. This avoids piping large binaries 
      // through our Express server, saving bandwidth and memory.
      const { data: uploadInfo } = await axios.get(`${API_URL}/videos/upload-url`, {
        params: {
          fileName: file.name,
          contentType: file.type
        },
        signal: controller.signal
      });

      const { uploadUrl, key } = uploadInfo;

      // --- STEP 2: OPTIMISTIC UI ---
      // Immediately show the video in the list with an 'UPLOADING' status.
      onVideoAdded({
        id: tempId,
        title: file.name.split(".")[0],
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        status: "UPLOADING",
        progress: 0,
        createdAt: new Date().toISOString()
      }, controller);

      // --- STEP 3: DIRECT S3 UPLOAD ---
      // Execute a PUT request to the pre-signed URL. We use Axios's onUploadProgress 
      // to drive the progress bar in the UI.
      await axios.put(uploadUrl, file, {
        headers: { "Content-Type": file.type },
        signal: controller.signal,
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || file.size));
          onProgress(tempId, percentCompleted);
        }
      });

      // --- STEP 4: DB REGISTRATION ---
      // Now that the file is safely in S3, we create the official record in PostgreSQL.
      const { data: recordData } = await axios.post(`${API_URL}/videos`, {
        title: file.name.split(".")[0],
        fileName: file.name,
        contentType: file.type,
        key: key
      }, { signal: controller.signal });

      const { videoId } = recordData;

      // --- STEP 5: TRIGGER TRANSCODING ---
      // Inform the backend that the file is ready for processing.
      // This will trigger an SQS message and subsequent ECS/Docker transcoding.
      await axios.post(`${API_URL}/videos/${videoId}/start`, {}, { signal: controller.signal });

      // --- STEP 6: SUCCESS CLEANUP ---
      // Replace the temporary UI object with the real video record from the database.
      onComplete(tempId, {
        id: videoId,
        title: file.name.split(".")[0],
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        status: "QUEUED",
        createdAt: new Date().toISOString()
      });
      setIsUploading(false);
      
    } catch (err: unknown) {
      // Handle manual cancellation logic separately from real network errors.
      if (axios.isCancel(err)) {
        console.log("Upload aborted by user action.");
        return;
      }
      
      console.error("Critical upload failure:", err);
      setError("Upload failed. Please check your connection and try again.");
      setIsUploading(false);
    }
  };

  /**
   * Handler: Triggered when a file is dropped directly onto the component.
   */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFile(droppedFile)) {
        startUpload(droppedFile);
      }
    }
  }, []);

  /**
   * Handler: Triggered when a file is selected via the native OS file picker.
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        startUpload(selectedFile);
      }
    }
  };

  return (
    <div className="w-full px-4">
      {/* Visual Drop Zone: Changes color and border style based on drag state */}
      <div
        className={cn(
          "relative group rounded-xl border border-dashed transition-all duration-200 py-16 flex flex-col items-center justify-center gap-4",
          dragActive
            ? "border-primary bg-primary/5" // Active state (Emerald)
            : "border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/50", // Idle/Hover state
          "cursor-pointer"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {/* Animated Central Icon */}
        <div className="p-4 rounded-full bg-zinc-800 mb-2">
          <Upload className="w-6 h-6 text-zinc-500" />
        </div>
        
        {/* Instruction Text */}
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-300">
            {dragActive ? "Drop to start upload" : "Drag and drop your video file"}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            or click anywhere to browse your computer
          </p>
        </div>
        
        {/* Hidden Native File Input: Transparently covers the entire component area */}
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleChange}
          accept="video/*"
        />

        {/* Error Tooltip: Displayed below the drop zone on validation failure */}
        {error && (
          <div className="absolute -bottom-8 left-0 right-0 flex items-center justify-center gap-2 text-rose-500 text-xs transition-all">
            <AlertCircle className="w-3 h-3" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
