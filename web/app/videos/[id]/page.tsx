'use client';

/**
 * Advanced Video Player Page.
 * This component implements a professional-grade HLS (HTTP Live Streaming) player
 * with localized controls, quality switching, and real-time status fetching.
 * It uses hls.js for cross-browser adaptive bitrate streaming.
 */

import React, { useEffect, useRef, useState, use } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { 
  ArrowLeft, 
  Loader2, 
  Settings, 
  ChevronRight, 
  ChevronLeft, 
  Check,
  Maximize,
  Minimize,
  Volume2,
  Volume1,
  VolumeX,
  Play,
  Pause,
  Captions,
  RectangleHorizontal
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Item, ItemContent, ItemMedia, ItemTitle, ItemActions } from '@/components/ui/item';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import axios from 'axios';
import './player.css';

import { notFound } from 'next/navigation';

// Interface defining the shape of a Video object from the backend.
interface Video {
  id: string;
  title: string;
  status: 'uploading' | 'queued' | 'processing' | 'completed' | 'failed';
  video_url: string;
  m3u8_url: string;
  thumbnail_url?: string;
  subtitles_url?: string;
  previews_url?: string;
}

// Global formatter for video time (ensures 00:05 instead of 0:5).
const leadingZeroFormatter = new Intl.NumberFormat(undefined, {
  minimumIntegerDigits: 2,
});

/**
 * Utility: Converts seconds into a human-readable HH:MM:SS format.
 */
function formatDuration(time: number) {
  if (isNaN(time)) return '0:00';
  const seconds = Math.floor(time % 60);
  const minutes = Math.floor(time / 60) % 60;
  const hours = Math.floor(time / 3600);
  if (hours === 0) {
    return `${minutes}:${leadingZeroFormatter.format(seconds)}`;
  } else {
    return `${hours}:${leadingZeroFormatter.format(minutes)}:${leadingZeroFormatter.format(seconds)}`;
  }
}

// API endpoint derived from environment variables.
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function VideoPage(props: { params: Promise<{ id: string }> }) {
  // Unwrap the dynamic ID from the Next.js route parameters.
  const params = use(props.params);
  
  // State: Core video data and primary loading indicator.
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);

  // UI State: Player playback and view modes.
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTheater, setIsTheater] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Volume State: Managing visual icons and numeric levels (0-1).
  const [volumeLevel, setVolumeLevel] = useState<'high' | 'low' | 'muted'>('high');
  const [volume, setVolume] = useState(1);
  
  // Playback Features: Speed, timing, and captions.
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isCaptions, setIsCaptions] = useState(false);

  // Interaction State: Scrubbing (dragging the timeline) and settings menu navigation.
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [menuLevel, setMenuLevel] = useState<'main' | 'quality' | 'speed'>('main');
  
  // HLS/Bitrate State: Available resolutions and currently active quality level.
  const [hlsLevels, setHlsLevels] = useState<any[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1); // -1 signifies 'Auto'.
  const [actualQuality, setActualQuality] = useState<number>(-1); // The real level chosen by hls.js auto-bitrate.
  
  // Visual Feedback: Hover positions for timeline previews.
  const [previewPosition, setPreviewPosition] = useState(0);
  const [progressPosition, setProgressPosition] = useState(0);

  // Component Refs: Direct DOM access for video element and its containers.
  const wasPaused = useRef<boolean>(true); // Tracks state before a scrub starts.
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<any>(null); // Persistence ref for the Hls.js instance.

  /**
   * Data Fetcher: Retrieves video metadata from the server.
   */
  const fetchVideo = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/videos/${params.id}`);
      setVideo(data);
    } catch (err) {
      console.error("Failed to fetch video:", err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Status Polling: Keeps the UI updated if the video is still processing in the backend.
   */
  useEffect(() => {
    fetchVideo();
    const interval = setInterval(() => {
      // Only poll if the video isn't terminal (completed or failed).
      if (video?.status !== 'completed' && video?.status !== 'failed') {
        fetchVideo();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [params.id, video?.status]);

  /**
   * HLS Initializer: Triggers the setup of hls.js when the video becomes 'completed'.
   */
  useEffect(() => {
    if (video?.status === 'completed') initHls();
  }, [video?.id, video?.status]);

  /**
   * Core Player Setup: Configures hls.js for adaptive streaming.
   */
  const initHls = () => {
    if (!video || !videoRef.current || video.status !== 'completed' || !video.m3u8_url) return;

    // Check if the browser supports Media Source Extensions (MSE) via hls.js.
    if ((window as any).Hls && (window as any).Hls.isSupported()) {
      if (hlsRef.current) hlsRef.current.destroy(); // Cleanup previous instances.
      
      const hls = new (window as any).Hls();
      hlsRef.current = hls;

      // Event: Manifest parsed -> Quality levels are now known.
      hls.on((window as any).Hls.Events.MANIFEST_PARSED, () => {
        setHlsLevels(hls.levels);
      });

      // Event: Level switched -> hls.js changed resolution (either auto or manual).
      hls.on((window as any).Hls.Events.LEVEL_SWITCHED, (_: any, data: any) => {
        setActualQuality(data.level);
        if (hls.autoLevelEnabled) {
          setCurrentQuality(-1);
        } else {
          setCurrentQuality(data.level);
        }
      });

      hls.loadSource(video.m3u8_url);
      hls.attachMedia(videoRef.current);
    } 
    // Fallback: Native HLS support (Safari/iOS).
    else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = video.m3u8_url;
    }
  };

  /**
   * Video Event Listeners: Sync HTML5 <video> state with React state.
   */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onLoadedData = () => setDuration(v.duration);
    const onTimeUpdate = () => {
      // Sync the global clock and the progress bar position.
      setCurrentTime(v.currentTime);
      setProgressPosition(v.duration > 0 ? v.currentTime / v.duration : 0);
    };
    const onVolumeChange = () => {
      // Update volume state and determine which icon to show (low, high, muted).
      setVolume(v.volume);
      if (v.muted || v.volume === 0) {
        setVolumeLevel('muted');
      } else if (v.volume >= 0.5) {
        setVolumeLevel('high');
      } else {
        setVolumeLevel('low');
      }
    };

    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('loadeddata', onLoadedData);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('volumechange', onVolumeChange);

    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('loadeddata', onLoadedData);
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('volumechange', onVolumeChange);
    };
  }, [video?.status]);

  /**
   * Monitor Fullscreen State: Detects if the browser has entered or exited fullscreen mode.
   */
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement != null);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // UI Helper: Toggle Play/Pause state.
  const togglePlay = () => {
    if (!videoRef.current) return;
    videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
  };

  // UI Helper: Switch between normal and wide theater view.
  const toggleTheaterMode = () => setIsTheater((prev) => !prev);

  // UI Helper: Request/Exit native browser Fullscreen mode.
  const toggleFullScreenMode = () => {
    if (document.fullscreenElement == null) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  // UI Helper: Handle manual Mute toggle.
  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
    }
  };

  // UI Helper: Toggle visibility of WebVTT captions/subtitles.
  const toggleCaptions = () => {
    if (!videoRef.current) return;
    const captionsTrack = videoRef.current.textTracks[0];
    if (captionsTrack) {
      const isHidden = captionsTrack.mode === 'hidden';
      // 'showing' enables the built-in browser renderer for VTT files.
      captionsTrack.mode = isHidden ? 'showing' : 'hidden';
      setIsCaptions(isHidden);
    }
  };

  /**
   * Handler: Updates volume based on slider interaction.
   */
  const handleVolumeChange = (value: number[]) => {
    const val = value[0];
    if (val === undefined) return;
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
  };

  /**
   * Handler: Updates the hover preview position on the timeline.
   */
  const handleTimelineUpdate = (e: React.MouseEvent | MouseEvent) => {
    if (!timelineContainerRef.current || !videoRef.current) return;
    const rect = timelineContainerRef.current.getBoundingClientRect();
    // Calculate the percentage of the click/hover relative to the timeline width.
    const percent = Math.min(Math.max(0, e.clientX - rect.x), rect.width) / rect.width;
    setPreviewPosition(percent);
    // If the user is actively dragging (scrubbing), sync the progress bar too.
    if (isScrubbing) {
      e.preventDefault();
      setProgressPosition(percent);
    }
  };

  /**
   * Core Handler: Manages the 'Scrubbing' logic (seeking through the video).
   */
  const toggleScrubbingInternal = (e: React.MouseEvent | MouseEvent, forceState?: boolean) => {
    if (!timelineContainerRef.current || !videoRef.current) return;
    const rect = timelineContainerRef.current.getBoundingClientRect();
    const percent = Math.min(Math.max(0, e.clientX - rect.x), rect.width) / rect.width;

    // Determine if we should be scrubbing based on the mouse button state.
    const newIsScrubbing = forceState !== undefined ? forceState : (e.buttons & 1) === 1;
    setIsScrubbing(newIsScrubbing);

    if (newIsScrubbing) {
      // Pre-scrub: Pause the video and remember the previous state.
      wasPaused.current = videoRef.current.paused;
      videoRef.current.pause();
    } else {
      // Post-scrub: Seek to the new time and resume playback if it was playing before.
      videoRef.current.currentTime = percent * duration;
      if (!wasPaused.current) videoRef.current.play();
    }
    handleTimelineUpdate(e);
  };

  /**
   * Global Scrubbing Listener: Handles mouse release/movement outside the container.
   */
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (isScrubbing) toggleScrubbingInternal(e, false);
    };
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isScrubbing) handleTimelineUpdate(e);
    };
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleGlobalMouseMove);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isScrubbing, duration]);

  // UI Branch: Show skeleton while metadata is loading.
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-start py-20 px-6">
        <div className="w-full max-w-[1000px] aspect-video rounded-3xl bg-zinc-900/50 animate-shimmer border border-white/5" />
      </div>
    );
  }

  // Security: Trigger 404 if the video is not fully processed yet.
  if (video && video.status !== 'completed') {
    notFound();
  }

  // Fallback: Trigger 404 for missing IDs.
  if (!video) {
    notFound();
  }

  // Utility: Compute dynamic Tailwind-compatible classes based on player state.
  const containerClasses = cn(
    'video-container',
    !isPlaying && 'paused',
    isTheater && 'theater',
    isFullscreen && 'full-screen',
    isCaptions && 'captions',
    isScrubbing && 'scrubbing'
  );

  /**
   * Preview Generator: Calculates the segment index for the hover thumbnail.
   * Based on 10-second segment snapshots.
   */
  const previewImgNumber = Math.max(1, Math.floor((previewPosition * duration) / 10));
  const previewImgSrc = `${video.previews_url}${previewImgNumber}.jpg`;

  return (
    <div className="min-h-screen bg-zinc-950 font-sans flex flex-col items-center justify-start py-12 px-6 text-white overflow-x-hidden">
      {/* Dynamic Hls.js script injection for performance */}
      <Script src="https://cdn.jsdelivr.net/npm/hls.js@latest" onLoad={initHls} />

      {/* Navigation Header: Hidden in large-scale viewing modes */}
      {!isTheater && !isFullscreen && (
        <header className="w-full max-w-[1000px] mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors group px-2"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-xs font-bold uppercase tracking-widest">Back to Library</span>
          </Link>
        </header>
      )}

      {/* CUSTOM PLAYER CONTAINER */}
      <div className={containerClasses} data-volume-level={volumeLevel} ref={containerRef}>
        {/* Placeholder image while video source initializes */}
        <img className="thumbnail-img" src={video.thumbnail_url} alt="thumbnail" />

        <div className="video-controls-container">
          {/* TIMELINE: Interactive progress and preview bar */}
          <div
            className="timeline-container"
            ref={timelineContainerRef}
            onMouseMove={handleTimelineUpdate}
            onMouseDown={(e) => toggleScrubbingInternal(e)}
            style={
              {
                '--progress-position': progressPosition,
                '--preview-position': previewPosition,
              } as React.CSSProperties
            }
          >
            <div className="timeline">
              {/* Floating hover thumbnail */}
              <img className="preview-img" src={previewImgSrc} alt="preview" />
              <div className="thumb-indicator"></div>
            </div>
          </div>
          
          <div className="controls">
            {/* Play/Pause Control */}
            <button className="play-pause-btn" onClick={togglePlay}>
               {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
            </button>
            
            {/* VOLUME: Slider with dynamic icons */}
            <div className="volume-container">
              <button className="mute-btn" onClick={toggleMute}>
                {volumeLevel === 'muted' ? <VolumeX size={20} /> : volumeLevel === 'high' ? <Volume2 size={20} /> : <Volume1 size={20} />}
              </button>
              <Slider
                className="volume-slider"
                min={0}
                max={1}
                step={0.01}
                value={[volume]}
                onValueChange={handleVolumeChange}
              />
            </div>

            {/* CLOCK: Current / Total playback time */}
            <div className="duration-container">
              <span className="current-time">{formatDuration(currentTime)}</span>
              <span className="mx-1 opacity-30">/</span>
              <span className="total-time">{formatDuration(duration)}</span>
            </div>
            
            {/* CAPTIONS: Toggle button for VTT overlay */}
            <button 
              className={cn("captions-btn transition-colors -mr-4", isCaptions && "text-rose-500")} 
              onClick={toggleCaptions}
            >
              <Captions size={18} />
            </button>

            {/* SETTINGS: Multi-level popover for Quality and Speed */}
            <div className="settings-wrapper">
              <Popover open={isSettingsOpen} onOpenChange={(open) => {
                setIsSettingsOpen(open);
                if (!open) setMenuLevel('main'); // Reset navigation on close.
              }}>
                <PopoverTrigger asChild>
                  <button className={cn("settings-btn", isSettingsOpen && "active")}>
                    <Settings size={18} />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="end" className="w-56 p-2 bg-zinc-900/90 border-white/5 backdrop-blur-2xl">
                  {/* MAIN MENU: Select category */}
                  {menuLevel === 'main' && (
                    <div className="flex flex-col gap-0.5">
                      <Item
                        className="cursor-pointer transition-all border-none py-2 text-white/70 hover:text-white"
                        onClick={() => setMenuLevel('quality')}
                      >
                        <ItemContent><ItemTitle className="text-xs">Quality</ItemTitle></ItemContent>
                        <ItemActions>
                          <span className="text-[10px] opacity-40 font-mono">
                            {currentQuality === -1
                              ? (actualQuality !== -1 ? `Auto (${hlsLevels[actualQuality]?.height}p)` : 'Auto')
                              : `${hlsLevels[currentQuality]?.height}p`}
                          </span>
                          <ChevronRight size={14} className="opacity-30 ml-1" />
                        </ItemActions>
                      </Item>
                      <Item
                        className="cursor-pointer transition-all border-none py-2 text-white/70 hover:text-white"
                        onClick={() => setMenuLevel('speed')}
                      >
                        <ItemContent><ItemTitle className="text-xs">Playback Speed</ItemTitle></ItemContent>
                        <ItemActions>
                          <span className="text-[10px] opacity-40 font-mono">{playbackRate === 1 ? 'Normal' : `${playbackRate}x`}</span>
                          <ChevronRight size={14} className="opacity-30 ml-1" />
                        </ItemActions>
                      </Item>
                    </div>
                  )}

                  {/* QUALITY SUBMENU: Change resolution manually or switch to Auto */}
                  {menuLevel === 'quality' && (
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 px-2 py-2 mb-2 cursor-pointer rounded-lg group" onClick={() => setMenuLevel('main')}>
                        <ChevronLeft size={14} className="text-zinc-500 group-hover:text-white" />
                        <span className="text-[10px] font-bold text-white/50 group-hover:text-white">Back</span>
                      </div>
                      <div className="flex flex-col gap-0.5 overflow-y-auto max-h-48">
                        {/* Option: AUTO Bitrate Selection */}
                        <Item
                          className={cn("cursor-pointer py-2", currentQuality === -1 ? "bg-white/10 text-white" : "text-white/40 hover:text-white")}
                          onClick={() => {
                            if (hlsRef.current) {
                              hlsRef.current.nextLevel = -1; // -1 triggers hls.js auto-switching.
                              setCurrentQuality(-1);
                              setIsSettingsOpen(false);
                            }
                          }}
                        >
                          <ItemContent>
                            <ItemTitle className="text-xs">
                              {actualQuality !== -1 ? `Auto (${hlsLevels[actualQuality]?.height}p)` : 'Auto'}
                            </ItemTitle>
                          </ItemContent>
                          <ItemActions>{currentQuality === -1 && <div className="active-dot" />}</ItemActions>
                        </Item>
                        {/* Map through available HLS streams (e.g. 1080p, 720p, 480p) */}
                        {hlsLevels.map((level, index) => (
                          <Item
                            key={index}
                            className={cn("cursor-pointer py-2", currentQuality === index ? "bg-white/10 text-white" : "text-white/40 hover:text-white")}
                            onClick={() => {
                              if (hlsRef.current) {
                                hlsRef.current.nextLevel = index; // Force a specific level.
                                setCurrentQuality(index);
                                setIsSettingsOpen(false);
                              }
                            }}
                          >
                            <ItemContent><ItemTitle className="text-xs">{level.height}p</ItemTitle></ItemContent>
                            <ItemActions>{currentQuality === index && <div className="active-dot" />}</ItemActions>
                          </Item>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SPEED SUBMENU: Change playback rate (0.5x to 2x) */}
                  {menuLevel === 'speed' && (
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 px-2 py-2 mb-2 cursor-pointer rounded-lg group" onClick={() => setMenuLevel('main')}>
                        <ChevronLeft size={14} className="text-zinc-500 group-hover:text-white" />
                        <span className="text-[10px] font-bold text-white/50 group-hover:text-white">Back</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                          <Item
                            key={rate}
                            className={cn("cursor-pointer py-2", playbackRate === rate ? "bg-white/10 text-white" : "text-white/40 hover:text-white")}
                            onClick={() => {
                              if (videoRef.current) {
                                videoRef.current.playbackRate = rate;
                                setPlaybackRate(rate);
                                setIsSettingsOpen(false);
                              }
                            }}
                          >
                            <ItemContent><ItemTitle className="text-xs">{rate === 1 ? 'Normal' : `${rate}x`}</ItemTitle></ItemContent>
                            <ItemActions>{playbackRate === rate && <div className="active-dot" />}</ItemActions>
                          </Item>
                        ))}
                      </div>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* THEATER MODE: Expands the player width */}
            <button className="theater-btn" onClick={toggleTheaterMode}>
               <RectangleHorizontal size={20} className={cn("transition-colors", isTheater && "text-rose-500")} />
            </button>
            {/* FULLSCREEN: Native browser expansion */}
            <button className="full-screen-btn" onClick={toggleFullScreenMode}>
               {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
        {/* NATIVE VIDEO ELEMENT: Acts as the HLS target for Media Source Extensions */}
        <video ref={videoRef} onClick={togglePlay} crossOrigin="anonymous" poster={video.thumbnail_url}>
          {video.subtitles_url && <track kind="captions" srcLang="en" src={video.subtitles_url} default />}
        </video>
      </div>

      {/* METADATA: Title and status badges displayed below the player */}
      {!isTheater && !isFullscreen && (
        <div className="w-full max-w-[1000px] mt-8 flex flex-col items-start px-2">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">{video.title}</h1>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 border-white/10 bg-white/5">
              {video.status}
            </Badge>
            <span className="text-[10px] text-zinc-600 font-mono italic">
              ID: {video.id}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
