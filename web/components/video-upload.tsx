"use client";

import React, { useState, useCallback } from "react";
import { Upload, FileVideo, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import axios, { isAxiosError } from "axios";

interface VideoUploadProps {
  onUploadSuccess?: (videoId: string, title: string, size: string) => void;
}

export function VideoUpload({ onUploadSuccess }: VideoUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFile(droppedFile)) {
        setFile(droppedFile);
      }
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        setFile(selectedFile);
      }
    }
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    setUploadProgress(0);
    setIsUploading(false);
  };

  const startUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      // 1. Get Pre-signed URL from server
      const { data: uploadData } = await axios.post("http://localhost:8000/videos", {
        title: file.name.split(".")[0],
        fileName: file.name,
        contentType: file.type
      });

      const { videoId, uploadUrl } = uploadData;

      // 2. Upload directly to S3
      await axios.put(uploadUrl, file, {
        headers: { "Content-Type": file.type },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || file.size));
          setUploadProgress(percentCompleted);
        }
      });

      // 3. Signal server to start transcoding
      await axios.post(`http://localhost:8000/videos/${videoId}/start`);

      if (onUploadSuccess) {
        onUploadSuccess(videoId, file.name, `${(file.size / (1024 * 1024)).toFixed(2)} MB`);
      }

      // 4. Success cleanup
      removeFile();
      
    } catch (err: unknown) {
      console.error("Upload failed:", err);
      if (isAxiosError(err)) {
        setError(err.response?.data?.error || "Failed to upload video. Please try again.");
      } else {
        setError("An unexpected error occurred.");
      }
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full max-w-xl px-4">
      <div
        className={cn(
          "relative group rounded-xl border border-dashed transition-all duration-200 py-16 flex flex-col items-center justify-center gap-4",
          dragActive
            ? "border-primary bg-primary/5"
            : "border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/50",
          file ? "border-zinc-700 bg-zinc-900/80" : "",
          isUploading ? "cursor-not-allowed opacity-80" : "cursor-pointer"
        )}
        onDragEnter={!isUploading ? handleDrag : undefined}
        onDragLeave={!isUploading ? handleDrag : undefined}
        onDragOver={!isUploading ? handleDrag : undefined}
        onDrop={!isUploading ? handleDrop : undefined}
      >
        {file ? (
          <div className="flex flex-col items-center w-full px-12">
            <div className="p-3 rounded-lg bg-zinc-800 mb-4">
              {isUploading ? (
                <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
              ) : (
                <FileVideo className="w-8 h-8 text-zinc-400" />
              )}
            </div>
            
            <p className="text-sm font-medium text-zinc-200 mb-1 truncate max-w-xs">{file.name}</p>
            <p className="text-xs text-zinc-500 mb-6">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            
            {isUploading && (
              <div className="w-full mb-8">
                <div className="flex justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2">
                  <span>Uploading to Cloud</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-300" 
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {!isUploading && (
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={removeFile}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  Cancel
                </Button>
                <Button 
                  size="sm" 
                  onClick={startUpload}
                  className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                >
                  Start Transcoding
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
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
              disabled={isUploading}
            />
          </>
        )}

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
