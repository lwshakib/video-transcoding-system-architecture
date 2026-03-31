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

/**
 * Video Library List Component.
 * This component renders a sleek, interactive list of videos.
 * It handles multiple visual states:
 * 1. Loading Skeletons: Displayed while initial data is being fetched.
 * 2. Uploading State: Shows real-time percentage progress and allows cancellation.
 * 3. Processing States: Queued, Processing, Completed, or Failed with unique high-fidelity icons.
 * 4. Permanent Deletion: Integrated 'Confirmation Dialog' to prevent accidental data loss.
 */

export interface VideoItem {
  id: string;
  title: string;
  size: string;
  status: "UPLOADING" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  progress?: number; // Optional: Only present during the initial S3 'UPLOADING' stage.
  video_url?: string;
  m3u8_url?: string;
  subtitles_url?: string;
  createdAt: string;
}

interface VideoListProps {
  // Array of video records to display.
  videos: VideoItem[];
  // Initial loading flag to trigger skeleton animations.
  loading?: boolean;
  // Function to handle permanent deletion from the backend/S3.
  onDelete: (id: string) => Promise<void>;
  // Function to abort an active browser-to-S3 upload.
  onAbort?: (id: string) => void;
}

export function VideoList({ videos, loading, onDelete, onAbort }: VideoListProps) {
  // Hook used for navigating to the specific video player page.
  const router = useRouter();

  /**
   * Helper: Switches icons and colors based on the current transcoding pipeline status.
   */
  const renderStatusIcon = (status: VideoItem["status"]) => {
    switch (status) {
      case "QUEUED": 
        return <Clock className="w-3.5 h-3.5 text-zinc-500 animate-pulse" />;
      case "PROCESSING": 
        // Animated spinner to indicate active transcoding work in the cloud/container.
        return <Loader2 className="w-3.5 h-3.5 text-emerald-500 animate-spin" />;
      case "COMPLETED": 
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      case "FAILED": 
        return <AlertCircle className="w-3.5 h-3.5 text-rose-500" />;
      default: 
        return <Clock className="w-3.5 h-3.5 text-zinc-500" />;
    }
  };

  /**
   * UI Branch: Loading skeletons to prevent layout shift during data fetch.
   */
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

  // Hide the component entirely if there are no videos to display.
  if (videos.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-2 animate-in fade-in slide-in-from-top-4 duration-500">
      {videos.map((video) => {
        // Local flags for conditional styling and interactions.
        const isUploading = video.status === "UPLOADING";
        const isCompleted = video.status === "COMPLETED";
        
        return (
          <div 
            key={video.id} 
            className={cn(
              "relative flex items-center justify-between p-2.5 rounded-lg border border-transparent transition-all group",
              isUploading 
                ? "bg-zinc-900/40 animate-shimmer border-zinc-800/50" // Uploading shimmer effect
                : "bg-zinc-900/20 hover:bg-zinc-800/40 hover:border-zinc-800/50 cursor-pointer", // Interactive library item
              !isUploading && !isCompleted && "opacity-80" // Dim items that are still 'Queued' or 'Processing'
            )}
            // Only allow navigation to the player if the video is fully 'Completed'.
            onClick={() => isCompleted && router.push(`/videos/${video.id}`)}
          >
            {/* --- LEFT SECTION: ICON & TITLE --- */}
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
                {/* Mobile-only size indicator */}
                <span className="text-[9px] text-zinc-500 font-mono sm:hidden">
                   {video.size}
                </span>
              </div>
            </div>

            {/* --- RIGHT SECTION: SIZE, STATUS, ACTIONS --- */}
            <div className="flex items-center gap-4">
              {/* Desktop-only size indicator */}
              <span className="hidden sm:block text-[10px] text-zinc-500 font-mono w-16 text-right">
                {video.size}
              </span>
              
              {/* Status Indicator: Displays percentage during upload, icons otherwise */}
              <div className="flex items-center justify-center w-6">
                {isUploading ? (
                  <span className="text-[9px] font-bold text-emerald-500/80">{video.progress || 0}%</span>
                ) : renderStatusIcon(video.status)}
              </div>

              {/* Action Buttons: Cancel Upload (X) or Delete Record (Trash) */}
              <div className="flex items-center w-8 justify-end">
                {isUploading ? (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-zinc-600 hover:text-rose-500 transition-all"
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent navigation on click
                      onAbort?.(video.id);
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                ) : (
                  // Permanent Deletion with Confirmation Dialog
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
                          This will permanently delete the video and all its transcoded HLS segments from cloud storage. This action cannot be undone.
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
                          Delete Permanently
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
