import React from "react"
import { useRouter } from "next/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  FileVideo,
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

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
  id: string
  title: string
  size: string
  status: "UPLOADING" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED"
  progress?: number // Optional: Only present during the initial S3 'UPLOADING' stage.
  video_url?: string
  m3u8_url?: string
  subtitles_url?: string
  createdAt: string
}

interface VideoListProps {
  // Array of video records to display.
  videos: VideoItem[]
  // Initial loading flag to trigger skeleton animations.
  loading?: boolean
  // Function to handle permanent deletion from the backend/S3.
  onDelete: (id: string) => Promise<void>
  // Function to abort an active browser-to-S3 upload.
  onAbort?: (id: string) => void
}

export function VideoList({
  videos,
  loading,
  onDelete,
  onAbort,
}: VideoListProps) {
  // Hook used for navigating to the specific video player page.
  const router = useRouter()

  /**
   * Helper: Switches icons and colors based on the current transcoding pipeline status.
   */
  const renderStatusIcon = (status: VideoItem["status"]) => {
    switch (status) {
      case "QUEUED":
        return <Clock className="h-3.5 w-3.5 animate-pulse text-zinc-500" />
      case "PROCESSING":
        // Animated spinner to indicate active transcoding work in the cloud/container.
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
      case "COMPLETED":
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
      case "FAILED":
        return <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
      default:
        return <Clock className="h-3.5 w-3.5 text-zinc-500" />
    }
  }

  /**
   * UI Branch: Loading skeletons to prevent layout shift during data fetch.
   */
  if (loading) {
    return (
      <div className="flex w-full animate-in flex-col gap-2 duration-500 fade-in">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="animate-shimmer h-12 w-full rounded-lg bg-zinc-900/50"
          />
        ))}
      </div>
    )
  }

  // Hide the component entirely if there are no videos to display.
  if (videos.length === 0) return null

  return (
    <div className="flex w-full animate-in flex-col gap-2 duration-500 fade-in slide-in-from-top-4">
      {videos.map((video) => {
        // Local flags for conditional styling and interactions.
        const isUploading = video.status === "UPLOADING"
        const isCompleted = video.status === "COMPLETED"

        return (
          <div
            key={video.id}
            className={cn(
              "group relative flex items-center justify-between rounded-lg border border-transparent p-2.5 transition-all",
              isUploading
                ? "animate-shimmer border-zinc-800/50 bg-zinc-900/40" // Uploading shimmer effect
                : "cursor-pointer bg-zinc-900/20 hover:border-zinc-800/50 hover:bg-zinc-800/40", // Interactive library item
              !isUploading && !isCompleted && "opacity-80" // Dim items that are still 'Queued' or 'Processing'
            )}
            // Only allow navigation to the player if the video is fully 'Completed'.
            onClick={() => isCompleted && router.push(`/videos/${video.id}`)}
          >
            {/* --- LEFT SECTION: ICON & TITLE --- */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <FileVideo
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isUploading
                    ? "text-zinc-600"
                    : isCompleted
                      ? "text-emerald-500"
                      : "text-zinc-400"
                )}
              />
              <div className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    "truncate text-sm font-medium transition-colors",
                    isUploading
                      ? "text-zinc-500"
                      : "text-zinc-100 group-hover:text-white"
                  )}
                >
                  {video.title}
                </span>
                {/* Mobile-only size indicator */}
                <span className="font-mono text-[9px] text-zinc-500 sm:hidden">
                  {video.size}
                </span>
              </div>
            </div>

            {/* --- RIGHT SECTION: SIZE, STATUS, ACTIONS --- */}
            <div className="flex items-center gap-4">
              {/* Desktop-only size indicator */}
              <span className="hidden w-16 text-right font-mono text-[10px] text-zinc-500 sm:block">
                {video.size}
              </span>

              {/* Status Indicator: Displays percentage during upload, icons otherwise */}
              <div className="flex w-6 items-center justify-center">
                {isUploading ? (
                  <span className="text-[9px] font-bold text-emerald-500/80">
                    {video.progress || 0}%
                  </span>
                ) : (
                  renderStatusIcon(video.status)
                )}
              </div>

              {/* Action Buttons: Cancel Upload (X) or Delete Record (Trash) */}
              <div className="flex w-8 items-center justify-end">
                {isUploading ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-zinc-600 transition-all hover:text-rose-500"
                    onClick={(e) => {
                      e.stopPropagation() // Prevent navigation on click
                      onAbort?.(video.id)
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  // Permanent Deletion with Confirmation Dialog
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-zinc-600 opacity-0 transition-all group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-500"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-white">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-sm font-bold">
                          Are you absolutely sure?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-zinc-400">
                          This will permanently delete the video and all its
                          transcoded HLS segments from cloud storage. This
                          action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="h-8 border-zinc-800 bg-zinc-900 text-xs text-white hover:bg-zinc-800">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="h-8 border-none bg-rose-600 text-xs text-white hover:bg-rose-700"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(video.id)
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
        )
      })}
    </div>
  )
}
