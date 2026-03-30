"use client";

import React, { useState } from "react";
import { VideoUpload } from "@/components/video-upload";
import { VideoList, VideoItem } from "@/components/video-list";

export default function Home() {
  const [videos, setVideos] = useState<VideoItem[]>([]);

  const handleUploadSuccess = (videoId: string, title: string, size: string) => {
    const newVideo: VideoItem = {
      id: videoId,
      title: title,
      size: size,
      status: "QUEUED",
      createdAt: new Date().toISOString(),
    };

    setVideos((prev) => [newVideo, ...prev]);
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 font-sans selection:bg-emerald-500/30">
      <main className="relative z-10 flex flex-col flex-1 items-center justify-center p-6 sm:p-12">
        <div className="w-full flex flex-col items-center max-w-4xl">
          <VideoUpload onUploadSuccess={handleUploadSuccess} />
          <VideoList videos={videos} />
        </div>
      </main>
    </div>
  );
}
