'use client';

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

const leadingZeroFormatter = new Intl.NumberFormat(undefined, {
  minimumIntegerDigits: 2,
});

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

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function VideoPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);

  // ... (keeping existing refs and state)
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTheater, setIsTheater] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState<'high' | 'low' | 'muted'>('high');
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isCaptions, setIsCaptions] = useState(false);

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [menuLevel, setMenuLevel] = useState<'main' | 'quality' | 'speed'>('main');
  const [hlsLevels, setHlsLevels] = useState<any[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [actualQuality, setActualQuality] = useState<number>(-1);
  const [previewPosition, setPreviewPosition] = useState(0);
  const [progressPosition, setProgressPosition] = useState(0);

  const wasPaused = useRef<boolean>(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<any>(null);

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

  useEffect(() => {
    fetchVideo();
    const interval = setInterval(() => {
      if (video?.status !== 'completed' && video?.status !== 'failed') {
        fetchVideo();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [params.id, video?.status]);

  useEffect(() => {
    if (video?.status === 'completed') initHls();
  }, [video?.id, video?.status]);

  const initHls = () => {
    if (!video || !videoRef.current || video.status !== 'completed' || !video.m3u8_url) return;

    if ((window as any).Hls && (window as any).Hls.isSupported()) {
      if (hlsRef.current) hlsRef.current.destroy();
      const hls = new (window as any).Hls();
      hlsRef.current = hls;

      hls.on((window as any).Hls.Events.MANIFEST_PARSED, () => {
        setHlsLevels(hls.levels);
      });

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
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = video.m3u8_url;
    }
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onLoadedData = () => setDuration(v.duration);
    const onTimeUpdate = () => {
      setCurrentTime(v.currentTime);
      setProgressPosition(v.duration > 0 ? v.currentTime / v.duration : 0);
    };
    const onVolumeChange = () => {
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

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement != null);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
  };

  const toggleTheaterMode = () => setIsTheater((prev) => !prev);

  const toggleFullScreenMode = () => {
    if (document.fullscreenElement == null) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
    }
  };

  const toggleCaptions = () => {
    if (!videoRef.current) return;
    const captionsTrack = videoRef.current.textTracks[0];
    if (captionsTrack) {
      const isHidden = captionsTrack.mode === 'hidden';
      captionsTrack.mode = isHidden ? 'showing' : 'hidden';
      setIsCaptions(isHidden);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const val = value[0];
    if (val === undefined) return;
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
  };

  const handleTimelineUpdate = (e: React.MouseEvent | MouseEvent) => {
    if (!timelineContainerRef.current || !videoRef.current) return;
    const rect = timelineContainerRef.current.getBoundingClientRect();
    const percent = Math.min(Math.max(0, e.clientX - rect.x), rect.width) / rect.width;
    setPreviewPosition(percent);
    if (isScrubbing) {
      e.preventDefault();
      setProgressPosition(percent);
    }
  };

  const toggleScrubbingInternal = (e: React.MouseEvent | MouseEvent, forceState?: boolean) => {
    if (!timelineContainerRef.current || !videoRef.current) return;
    const rect = timelineContainerRef.current.getBoundingClientRect();
    const percent = Math.min(Math.max(0, e.clientX - rect.x), rect.width) / rect.width;

    const newIsScrubbing = forceState !== undefined ? forceState : (e.buttons & 1) === 1;
    setIsScrubbing(newIsScrubbing);

    if (newIsScrubbing) {
      wasPaused.current = videoRef.current.paused;
      videoRef.current.pause();
    } else {
      videoRef.current.currentTime = percent * duration;
      if (!wasPaused.current) videoRef.current.play();
    }
    handleTimelineUpdate(e);
  };

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

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-start py-20 px-6">
        <div className="w-full max-w-[1000px] aspect-video rounded-3xl bg-zinc-900/50 animate-shimmer border border-white/5" />
      </div>
    );
  }

  // PROTECTION: If video is NOT completed, trigger Next.js notFound()
  if (video && video.status !== 'completed') {
    notFound();
  }

  if (!video) {
    notFound();
  }

  const containerClasses = cn(
    'video-container',
    !isPlaying && 'paused',
    isTheater && 'theater',
    isFullscreen && 'full-screen',
    isCaptions && 'captions',
    isScrubbing && 'scrubbing'
  );

  const previewImgNumber = Math.max(1, Math.floor((previewPosition * duration) / 10));
  const previewImgSrc = `${video.previews_url}${previewImgNumber}.jpg`;

  return (
    <div className="min-h-screen bg-zinc-950 font-sans flex flex-col items-center justify-start py-12 px-6 text-white overflow-x-hidden">
      <Script src="https://cdn.jsdelivr.net/npm/hls.js@latest" onLoad={initHls} />

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

      {/* PIXEL EXACT WRAPPER */}
      <div className={containerClasses} data-volume-level={volumeLevel} ref={containerRef}>
        <img className="thumbnail-img" src={video.thumbnail_url} alt="thumbnail" />

        <div className="video-controls-container">
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
              <img className="preview-img" src={previewImgSrc} alt="preview" />
              <div className="thumb-indicator"></div>
            </div>
          </div>
          <div className="controls">
            <button className="play-pause-btn" onClick={togglePlay}>
               {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
            </button>
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
            <div className="duration-container">
              <span className="current-time">{formatDuration(currentTime)}</span>
              <span className="mx-1 opacity-30">/</span>
              <span className="total-time">{formatDuration(duration)}</span>
            </div>
            
            <button 
              className={cn("captions-btn transition-colors -mr-4", isCaptions && "text-rose-500")} 
              onClick={toggleCaptions}
            >
              <Captions size={18} />
            </button>

            <div className="settings-wrapper">
              <Popover open={isSettingsOpen} onOpenChange={(open) => {
                setIsSettingsOpen(open);
                if (!open) setMenuLevel('main');
              }}>
                <PopoverTrigger asChild>
                  <button className={cn("settings-btn", isSettingsOpen && "active")}>
                    <Settings size={18} />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="end" className="w-56 p-2 bg-zinc-900/90 border-white/5 backdrop-blur-2xl">
                  {menuLevel === 'main' && (
                    <div className="flex flex-col gap-0.5">
                      <Item
                        className={cn(
                          "cursor-pointer transition-all border-none py-2",
                          "text-white/70 hover:text-white"
                        )}
                        onClick={() => setMenuLevel('quality')}
                      >
                        <ItemContent>
                          <ItemTitle className="text-xs">Quality</ItemTitle>
                        </ItemContent>
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
                        className={cn(
                          "cursor-pointer transition-all border-none py-2",
                          "text-white/70 hover:text-white"
                        )}
                        onClick={() => setMenuLevel('speed')}
                      >
                        <ItemContent>
                          <ItemTitle className="text-xs">Playback Speed</ItemTitle>
                        </ItemContent>
                        <ItemActions>
                          <span className="text-[10px] opacity-40 font-mono">{playbackRate === 1 ? 'Normal' : `${playbackRate}x`}</span>
                          <ChevronRight size={14} className="opacity-30 ml-1" />
                        </ItemActions>
                      </Item>
                    </div>
                  )}

                  {menuLevel === 'quality' && (
                    <div className="flex flex-col">
                      <div
                        className="flex items-center gap-2 px-2 py-2 mb-2 cursor-pointer transition-colors rounded-lg group"
                        onClick={() => setMenuLevel('main')}
                      >
                        <ChevronLeft size={14} className="text-zinc-500 group-hover:text-white" />
                        <span className="text-[10px] font-bold text-white/50 group-hover:text-white">Back</span>
                      </div>
                      <div className="flex flex-col gap-0.5 overflow-y-auto max-h-48">
                        <Item
                          className={cn(
                            "cursor-pointer transition-all border-none py-2",
                            currentQuality === -1 ? "bg-white/10 text-white" : "text-white/40 hover:text-white"
                          )}
                          onClick={() => {
                            if (hlsRef.current) {
                              hlsRef.current.nextLevel = -1;
                              setCurrentQuality(-1);
                              setIsSettingsOpen(false);
                              setMenuLevel('main');
                            }
                          }}
                        >
                          <ItemContent>
                            <ItemTitle className="text-xs">
                              {actualQuality !== -1 ? `Auto (${hlsLevels[actualQuality]?.height}p)` : 'Auto'}
                            </ItemTitle>
                          </ItemContent>
                          <ItemActions>
                            {currentQuality === -1 && <div className="active-dot" />}
                          </ItemActions>
                        </Item>
                        {hlsLevels.map((level, index) => (
                          <Item
                            key={index}
                            className={cn(
                              "cursor-pointer transition-all border-none py-2",
                              currentQuality === index ? "bg-white/10 text-white" : "text-white/40 hover:text-white"
                            )}
                            onClick={() => {
                              if (hlsRef.current) {
                                hlsRef.current.nextLevel = index;
                                setCurrentQuality(index);
                                setIsSettingsOpen(false);
                                setMenuLevel('main');
                              }
                            }}
                          >
                            <ItemContent>
                              <ItemTitle className="text-xs">{level.height}p</ItemTitle>
                            </ItemContent>
                            <ItemActions>
                              {currentQuality === index && <div className="active-dot" />}
                            </ItemActions>
                          </Item>
                        ))}
                      </div>
                    </div>
                  )}

                  {menuLevel === 'speed' && (
                    <div className="flex flex-col">
                      <div
                        className="flex items-center gap-2 px-2 py-2 mb-2 cursor-pointer transition-colors rounded-lg group"
                        onClick={() => setMenuLevel('main')}
                      >
                        <ChevronLeft size={14} className="text-zinc-500 group-hover:text-white" />
                        <span className="text-[10px] font-bold text-white/50 group-hover:text-white">Back</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                          <Item
                            key={rate}
                            className={cn(
                              "cursor-pointer transition-all border-none py-2",
                              playbackRate === rate ? "bg-white/10 text-white" : "text-white/40 hover:text-white"
                            )}
                            onClick={() => {
                              if (videoRef.current) {
                                videoRef.current.playbackRate = rate;
                                setPlaybackRate(rate);
                                setIsSettingsOpen(false);
                                setMenuLevel('main');
                              }
                            }}
                          >
                            <ItemContent>
                              <ItemTitle className="text-xs">{rate === 1 ? 'Normal' : `${rate}x`}</ItemTitle>
                            </ItemContent>
                            <ItemActions>
                              {playbackRate === rate && <div className="active-dot" />}
                            </ItemActions>
                          </Item>
                        ))}
                      </div>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            <button className="theater-btn" onClick={toggleTheaterMode}>
               <RectangleHorizontal size={20} className={cn("transition-colors", isTheater && "text-rose-500")} />
            </button>
            <button className="full-screen-btn" onClick={toggleFullScreenMode}>
               {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
        <video ref={videoRef} onClick={togglePlay} crossOrigin="anonymous" poster={video.thumbnail_url}>
          {video.subtitles_url && <track kind="captions" srcLang="en" src={video.subtitles_url} />}
        </video>
      </div>

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
