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
    const tempId = `temp-${Date.now()}`;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      
      // 1. Get pre-signed URL and unique key WITHOUT creating record yet
      const { data: uploadInfo } = await axios.get(`${API_URL}/videos/upload-url`, {
        params: {
          fileName: file.name,
          contentType: file.type
        },
        signal: controller.signal
      });

      const { uploadUrl, key } = uploadInfo;

      // 2. Optimistically add to the list as UPLOADING (using temporary ID)
      onVideoAdded({
        id: tempId,
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
          onProgress(tempId, percentCompleted);
        }
      });

      // 4. AFTER upload is 100%, create the record in DB
      const { data: recordData } = await axios.post(`${API_URL}/videos`, {
        title: file.name.split(".")[0],
        fileName: file.name,
        contentType: file.type,
        key: key
      }, { signal: controller.signal });

      const { videoId } = recordData;

      // 5. Signal server to start transcoding
      const { data: finalVideo } = await axios.post(`${API_URL}/videos/${videoId}/start`, {}, { signal: controller.signal });

      // 6. Success cleanup (replaces temp item with real video data)
      onComplete(tempId, {
        id: videoId,
        title: file.name.split(".")[0],
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        status: "QUEUED",
        createdAt: new Date().toISOString()
      });
      setIsUploading(false);
      
    } catch (err: unknown) {
      if (axios.isCancel(err)) {
        console.log("Upload aborted by user");
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
          "cursor-pointer"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="p-4 rounded-full bg-zinc-800 mb-2">
          <Upload className="w-6 h-6 text-zinc-500" />
        </div>
        
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-300">
            {dragActive ? "Drop to upload" : "Drag and drop video"}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            or click to browse
          </p>
        </div>
        
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleChange}
          accept="video/*"
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
