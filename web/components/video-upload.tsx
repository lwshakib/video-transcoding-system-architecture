"use client";

import React, { useState, useCallback } from "react";
import { Upload, FileVideo, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import axios, { isAxiosError } from "axios";

import { VideoItem } from "./video-list";

interface VideoUploadProps {
  onVideoAdded: (video: VideoItem, controller: AbortController) => void;
  onProgress: (videoId: string, progress: number) => void;
  onComplete: (videoId: string, updatedVideo: VideoItem) => void;
}

export function VideoUpload({ onVideoAdded, onProgress, onComplete }: VideoUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const validateFile = (file: File) => {
    if (!file.type.startsWith("video/")) {
      setError("Please upload a valid video file (MP4, MKV, etc.)");
      return false;
    }
    setError(null);
    return true;
  };

  const startUpload = async (file: File) => {
    setIsUploading(true);
    setError(null);
    const controller = new AbortController();

    let currentVideoId = "";

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      // 1. Create record in DB immediately
      const { data: uploadData } = await axios.post(`${API_URL}/videos`, {
        title: file.name.split(".")[0],
        fileName: file.name,
        contentType: file.type
      }, { signal: controller.signal });

      const { videoId, uploadUrl } = uploadData;
      currentVideoId = videoId;

      // 2. Optimistically add to the list as UPLOADING
      onVideoAdded({
        id: videoId,
        title: file.name.split(".")[0],
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        status: "UPLOADING",
        progress: 0,
        createdAt: new Date().toISOString()
      }, controller);

      // 3. Upload directly to S3
      await axios.put(uploadUrl, file, {
        headers: { "Content-Type": file.type },
        signal: controller.signal,
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || file.size));
          onProgress(videoId, percentCompleted);
        }
      });

      // 4. Signal server to start transcoding
      const { data: finalVideo } = await axios.post(`${API_URL}/videos/${videoId}/start`, {}, { signal: controller.signal });

      // 5. Success cleanup
      onComplete(videoId, finalVideo);
      setIsUploading(false);
      
    } catch (err: unknown) {
      if (axios.isCancel(err)) {
        console.log("Upload aborted by user");
        // Update parent to remove the item or mark as failed
        return;
      }
      
      console.error("Upload failed:", err);
      setError("Upload failed. Please try again.");
      setIsUploading(false);
    }
  };

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
      <div
        className={cn(
          "relative group rounded-xl border border-dashed transition-all duration-200 py-16 flex flex-col items-center justify-center gap-4",
          dragActive
            ? "border-primary bg-primary/5"
            : "border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/50",
          isUploading ? "cursor-not-allowed opacity-80" : "cursor-pointer"
        )}
        onDragEnter={!isUploading ? handleDrag : undefined}
        onDragLeave={!isUploading ? handleDrag : undefined}
        onDragOver={!isUploading ? handleDrag : undefined}
        onDrop={!isUploading ? handleDrop : undefined}
      >
        <div className="p-4 rounded-full bg-zinc-800 mb-2">
          {isUploading ? (
             <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
          ) : (
            <Upload className="w-6 h-6 text-zinc-500" />
          )}
        </div>
        
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-300">
            {isUploading ? "Uploading in background..." : dragActive ? "Drop to upload" : "Drag and drop video"}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {isUploading ? "You can upload more or manage the list below." : "or click to browse"}
          </p>
        </div>
        
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleChange}
          accept="video/*"
          disabled={isUploading}
        />

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
