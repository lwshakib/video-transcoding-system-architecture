"use client";

import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileVideo, Clock } from "lucide-react";

export interface VideoItem {
  id: string;
  title: string;
  size: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  createdAt: string;
}

interface VideoListProps {
  videos: VideoItem[];
}

export function VideoList({ videos }: VideoListProps) {
  if (videos.length === 0) return null;

  const getStatusVariant = (status: VideoItem["status"]) => {
    switch (status) {
      case "QUEUED": return "secondary";
      case "PROCESSING": return "default";
      case "COMPLETED": return "outline";
      case "FAILED": return "destructive";
      default: return "default";
    }
  };

  return (
    <div className="w-full max-w-2xl mt-12 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex items-center gap-2 mb-4 px-2">
        <Clock className="w-4 h-4 text-zinc-500" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Transcoding Tasks
        </h2>
      </div>
      
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
        <Table>
          <TableHeader className="bg-zinc-900/50">
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400 h-10">Video Name</TableHead>
              <TableHead className="text-zinc-400 h-10">Size</TableHead>
              <TableHead className="text-zinc-400 h-10 text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {videos.map((video) => (
              <TableRow key={video.id} className="border-zinc-800 hover:bg-zinc-800/30 transition-colors">
                <TableCell className="py-3">
                  <div className="flex items-center gap-3">
                    <FileVideo className="w-4 h-4 text-zinc-500" />
                    <span className="font-medium text-zinc-200">{video.title}</span>
                  </div>
                </TableCell>
                <TableCell className="text-zinc-500 py-3">{video.size}</TableCell>
                <TableCell className="text-right py-3">
                  <Badge variant={getStatusVariant(video.status)} className="font-semibold text-[10px] px-2 py-0">
                    {video.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
