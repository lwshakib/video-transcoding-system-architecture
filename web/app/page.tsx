"use client";

import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { VideoUpload } from "@/components/video-upload";
import { VideoList, VideoItem } from "@/components/video-list";

export default function Home() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [abortControllers, setAbortControllers] = useState<Record<string, AbortController>>({});

  const fetchVideos = useCallback(async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const { data } = await axios.get(`${API_URL}/videos`);
      
      // Merge with existing uploading videos to keep progress
      setVideos((prev) => {
        const uploadingItems = prev.filter(v => v.status === "UPLOADING");
        const serverItems = data.filter((v: VideoItem) => !uploadingItems.find(u => u.id === v.id));
        return [...uploadingItems, ...serverItems];
      });
    } catch (err) {
      console.error("Failed to fetch videos:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const handleVideoAdded = (newVideo: VideoItem, controller: AbortController) => {
    setVideos((prev) => [newVideo, ...prev]);
    setAbortControllers((prev) => ({ ...prev, [newVideo.id]: controller }));
  };

  const handleProgress = (videoId: string, progress: number) => {
    setVideos((prev) => 
      prev.map((v) => (v.id === videoId ? { ...v, progress } : v))
    );
  };

  const handleComplete = (oldId: string, updatedVideo: VideoItem) => {
    setVideos((prev) => 
      prev.map((v) => (v.id === oldId ? updatedVideo : v))
    );
    setAbortControllers((prev) => {
      const next = { ...prev };
      delete next[oldId];
      return next;
    });
  };

  const handleAbort = (videoId: string) => {
    const controller = abortControllers[videoId];
    if (controller) {
      controller.abort();
    }
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
    setAbortControllers((prev) => {
      const next = { ...prev };
      delete next[videoId];
      return next;
    });
  };

  const handleDeleteVideo = async (id: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      await axios.delete(`${API_URL}/videos/${id}`);
      fetchVideos();
    } catch (err) {
      console.error("Failed to delete video:", err);
      alert("Failed to delete video. Please try again.");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 font-sans selection:bg-emerald-500/30">
      <main className="relative z-10 flex flex-col flex-1 items-center p-6 sm:p-12 mt-10">
        <div className="w-full flex flex-col items-center max-w-2xl gap-16">
          <VideoUpload 
            onVideoAdded={handleVideoAdded} 
            onProgress={handleProgress}
            onComplete={handleComplete}
          />
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
