import React from "react";
import { useRouter } from "next/navigation";
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
  video_url: string;
  m3u8_url: string;
  subtitles_url?: string;
  createdAt: string;
}

interface VideoListProps {
  videos: VideoItem[];
  loading?: boolean;
  onDelete: (id: string) => Promise<void>;
  onAbort?: (id: string) => void;
}

export function VideoList({ videos, loading, onDelete, onAbort }: VideoListProps) {
  const router = useRouter();

  const renderStatusIcon = (status: VideoItem["status"]) => {
    switch (status) {
      case "QUEUED": 
        return <Clock className="w-3.5 h-3.5 text-zinc-500 animate-pulse" />;
      case "PROCESSING": 
        return <Loader2 className="w-3.5 h-3.5 text-emerald-500 animate-spin" />;
      case "COMPLETED": 
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      case "FAILED": 
        return <AlertCircle className="w-3.5 h-3.5 text-rose-500" />;
      default: 
        return <Clock className="w-3.5 h-3.5 text-zinc-500" />;
    }
  };

  if (loading) {
    return (
      <div className="w-full flex flex-col gap-2 animate-in fade-in duration-500">
        {[...Array(5)].map((_, i) => (
          <div 
            key={i} 
            className="h-12 w-full rounded-lg bg-zinc-900/50 animate-shimmer" 
          />
        ))}
      </div>
    );
  }

  if (videos.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-2 animate-in fade-in slide-in-from-top-4 duration-500">
      {videos.map((video) => {
        const isUploading = video.status === "UPLOADING";
        const isCompleted = video.status === "COMPLETED";
        
        return (
          <div 
            key={video.id} 
            className={cn(
              "relative flex items-center justify-between p-2.5 rounded-lg border border-transparent transition-all group",
              isUploading 
                ? "bg-zinc-900/40 animate-shimmer border-zinc-800/50" 
                : "bg-zinc-900/20 hover:bg-zinc-800/40 hover:border-zinc-800/50 cursor-pointer",
              !isUploading && !isCompleted && "opacity-80"
            )}
            onClick={() => isCompleted && router.push(`/videos/${video.id}`)}
          >
            {/* Left Section: Icon & Title */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
               <FileVideo className={cn(
                  "w-4 h-4 transition-colors shrink-0",
                  isUploading ? "text-zinc-600" : isCompleted ? "text-emerald-500" : "text-zinc-400"
               )} />
               <div className="flex flex-col min-w-0">
                <span className={cn(
                   "text-sm font-medium truncate transition-colors",
                   isUploading ? "text-zinc-500" : "text-zinc-100 group-hover:text-white"
                )}>
                  {video.title}
                </span>
                <span className="text-[9px] text-zinc-500 font-mono sm:hidden">
                   {video.size}
                </span>
              </div>
            </div>

            {/* Right Section: Size, Status, Actions */}
            <div className="flex items-center gap-4">
              <span className="hidden sm:block text-[10px] text-zinc-500 font-mono w-16 text-right">
                {video.size}
              </span>
              
              <div className="flex items-center justify-center w-6">
                {isUploading ? (
                  <span className="text-[9px] font-bold text-emerald-500/80">{video.progress || 0}%</span>
                ) : renderStatusIcon(video.status)}
              </div>

              <div className="flex items-center w-8 justify-end">
                {isUploading ? (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-zinc-600 hover:text-rose-500 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAbort?.(video.id);
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-zinc-600 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-zinc-950 border-zinc-800 text-white">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-sm font-bold">Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-zinc-400">
                          This will permanently delete the video and its transcoded segments from S3.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="h-8 text-xs bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white border-none"
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
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

