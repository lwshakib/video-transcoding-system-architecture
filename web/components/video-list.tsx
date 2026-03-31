import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FileVideo, Clock, Loader2, CheckCircle2, AlertCircle, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VideoItem {
  id: string;
  title: string;
  size: string;
  status: "UPLOADING" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  progress?: number;
  createdAt: string;
}

interface VideoListProps {
  videos: VideoItem[];
  loading?: boolean;
  onDelete: (id: string) => Promise<void>;
  onAbort?: (id: string) => void;
}

const SkeletonRow = () => (
  <TableRow className="border-none">
    <TableCell className="py-3 px-2">
      <div className="flex items-center gap-3">
        <div className="w-4 h-4 rounded bg-zinc-800 animate-shimmer" />
        <div className="h-4 w-32 rounded bg-zinc-800 animate-shimmer" />
      </div>
    </TableCell>
    <TableCell className="py-3 px-2 hidden sm:table-cell">
      <div className="h-3 w-16 rounded bg-zinc-800 animate-shimmer" />
    </TableCell>
    <TableCell className="py-3 px-2 w-10">
      <div className="h-4 w-8 rounded bg-zinc-800 animate-shimmer mx-auto" />
    </TableCell>
    <TableCell className="py-3 px-2 w-10 text-right">
      <div className="h-8 w-8 rounded-lg bg-zinc-800 animate-shimmer ml-auto" />
    </TableCell>
  </TableRow>
);

export function VideoList({ videos, loading, onDelete, onAbort }: VideoListProps) {
  const router = useRouter();

  const renderStatusIcon = (status: VideoItem["status"]) => {
    switch (status) {
      case "QUEUED": 
        return <span title="Queued"><Clock className="w-4 h-4 text-zinc-500 animate-pulse" /></span>;
      case "PROCESSING": 
        return <span title="Processing"><Loader2 className="w-4 h-4 text-emerald-500 animate-spin" /></span>;
      case "COMPLETED": 
        return <span title="Completed"><CheckCircle2 className="w-4 h-4 text-emerald-500" /></span>;
      case "FAILED": 
        return <span title="Failed"><AlertCircle className="w-4 h-4 text-rose-500" /></span>;
      default: 
        return <Clock className="w-4 h-4 text-zinc-500" />;
    }
  };

  if (loading) {
    return (
      <div className="w-full animate-in fade-in duration-500">
        <Table>
          <TableBody>
            {[...Array(6)].map((_, i) => <SkeletonRow key={i} />)}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (videos.length === 0) return null;

  return (
    <div className="w-full animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="">
        <Table>
          <TableBody>
            {videos.map((video) => {
              const isUploading = video.status === "UPLOADING";
              
              return (
                <TableRow 
                  key={video.id} 
                  className={cn(
                    "border-none transition-colors group",
                    isUploading ? "bg-zinc-900/40 animate-shimmer border-zinc-800/50" : "hover:bg-zinc-800/30 cursor-pointer text-white/90"
                  )}
                  onClick={() => video.status === "COMPLETED" && router.push(`/videos/${video.id}`)}
                >
                  <TableCell className="py-3 px-2">
                    <div className="flex items-center gap-3">
                      <FileVideo className={cn(
                        "w-4 h-4 text-zinc-500",
                        !isUploading && "group-hover:text-emerald-500 transition-colors"
                      )} />
                      <span className={cn(
                        "font-medium",
                        isUploading ? "text-white/50" : "text-zinc-200 group-hover:text-white"
                      )}>
                        {video.title}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-500 py-3 font-mono text-[10px] hidden sm:table-cell">
                    {!isUploading ? video.size : <div className="h-2 w-12 rounded bg-white/5 animate-shimmer" />}
                  </TableCell>
                  <TableCell className="py-3 px-2 w-10">
                     <div className="flex items-center justify-center">
                        {isUploading ? (
                          <span className="text-[10px] font-bold text-white/60">{video.progress || 0}%</span>
                        ) : renderStatusIcon(video.status)}
                     </div>
                  </TableCell>
                  <TableCell className="py-3 px-2 w-10 text-right">
                    {isUploading ? (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-zinc-600 hover:text-rose-500 transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAbort?.(video.id);
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-zinc-600 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all"
                            onClick={(e) => e.stopPropagation()} // Prevent navigation on click
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-zinc-950 border-zinc-800 text-white">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription className="text-zinc-400">
                              This action cannot be undone. This will permanently delete the video file from S3 and remove the record from our database.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800">Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              className="bg-rose-600 hover:bg-rose-700 text-white border-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(video.id);
                              }}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
