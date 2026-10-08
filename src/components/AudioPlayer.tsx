import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Download, Check, Copy, AudioLines, Music } from 'lucide-react';

interface Props {
  src?: string;
  audioUrl?: string;
  title?: string;
  subtitle?: string;
  formatBadge?: string;
  onDownloadFilename?: string;
  autoPlay?: boolean;
}

export const AudioPlayer: React.FC<Props> = ({
  src,
  audioUrl,
  title,
  subtitle,
  formatBadge,
  onDownloadFilename = 'synthesized_audio.wav',
  autoPlay = false,
}) => {
  const effectiveSrc = src || audioUrl || '';
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [copied, setCopied] = useState<boolean>(false);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);

  // Derive format badge if not provided
  const derivedBadge =
    formatBadge ||
    (effectiveSrc.includes('data:audio/wav') || onDownloadFilename.endsWith('.wav')
      ? '24kHz WAV'
      : '48kHz MP3');

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !effectiveSrc) return;

    setCurrentTime(0);
    setIsPlaying(false);
    
    // Explicitly load new audio source
    try {
      audio.load();
    } catch {
      // Ignored if browser optimizes load
    }

    const updateDuration = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      updateDuration();
      if (autoPlay) {
        audio.play().catch((e) => {
          if (e.name !== 'AbortError' && !e.message?.includes('interrupted')) {
            console.warn('Auto-play paused pending user gesture:', e);
          }
        });
      }
    };
    const handleCanPlay = () => updateDuration();
    const handleDurationChange = () => updateDuration();
    const handleEnded = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('loadeddata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('loadeddata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [effectiveSrc, autoPlay]);

  const togglePlay = () => {
    if (!audioRef.current || !effectiveSrc) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((e) => {
        if (e.name !== 'AbortError' && !e.message?.includes('interrupted')) {
          console.warn('Audio playback notice:', e);
        }
      });
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || !audioRef.current || !duration) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const newPercentage = clickX / rect.width;
    const newTime = newPercentage * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const hoverX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setHoverProgress((hoverX / rect.width) * 100);
  };

  const handleMouseLeave = () => {
    setHoverProgress(null);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.muted = false;
      setIsMuted(false);
    } else {
      audioRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      if (val === 0) {
        setIsMuted(true);
      } else if (isMuted) {
        audioRef.current.muted = false;
        setIsMuted(false);
      }
    }
  };

  const handleRateChange = () => {
    const rates = [0.8, 1.0, 1.25, 1.5, 2.0];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleRestart = () => {
    if (!audioRef.current || !effectiveSrc) return;
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
    audioRef.current.play().catch(() => {});
  };

  const handleCopyBase64 = () => {
    if (!effectiveSrc) return;
    navigator.clipboard.writeText(effectiveSrc);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const numBars = 54;

  return (
    <div
      id="custom-audio-player"
      className="w-full bg-[#0D0F16] border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-xl backdrop-blur-xl"
    >
      <audio ref={audioRef} src={effectiveSrc} preload="metadata" />

      {/* Track info header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.1] flex items-center justify-center shrink-0">
            <AudioLines className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">
              {title || 'Synthesized Audio Output'}
            </div>
            <div className="text-[11px] text-neutral-400 truncate flex items-center gap-1.5 mt-0.5">
              <span>{subtitle || 'ElevenOpen Acoustic Engine'}</span>
              <span>•</span>
              <span className="font-mono text-neutral-500">{derivedBadge}</span>
            </div>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <motion.button
            id="audio-copy-btn"
            type="button"
            onClick={handleCopyBase64}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Copy Audio Data URI"
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors flex items-center gap-1 text-xs"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </motion.button>
          <motion.a
            id="audio-download-btn"
            href={effectiveSrc}
            download={onDownloadFilename}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Download Audio File"
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors flex items-center gap-1 text-xs"
          >
            <Download className="w-4 h-4" />
          </motion.a>
        </div>
      </div>

      {/* Interactive Waveform Scrub Area */}
      <div className="flex flex-col gap-1.5">
        <div
          ref={waveformRef}
          onClick={handleSeek}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="relative h-13 w-full bg-black/40 border border-white/[0.05] rounded-xl px-3 py-2 flex items-center justify-between gap-[2px] cursor-pointer group select-none overflow-hidden"
        >
          {/* Hover highlight line */}
          {hoverProgress !== null && (
            <div
              className="absolute top-0 bottom-0 w-[1px] bg-white/40 pointer-events-none z-20"
              style={{ left: `${hoverProgress}%` }}
            />
          )}

          {/* Waveform visualizer bars */}
          {Array.from({ length: numBars }).map((_, i) => {
            const barProgress = (i / numBars) * 100;
            const isPassed = barProgress <= progressPercent;
            const isHovered = hoverProgress !== null && barProgress <= hoverProgress;

            const pattern = Math.sin(i * 0.35) * 0.35 + Math.cos(i * 0.75) * 0.25 + 0.4;
            const baseHeight = Math.max(18, Math.min(92, pattern * 100));

            return (
              <motion.div
                key={i}
                className={`w-[2.5px] rounded-full transition-colors duration-75 ${
                  isPassed
                    ? 'bg-white'
                    : isHovered
                    ? 'bg-neutral-500'
                    : 'bg-neutral-800'
                }`}
                animate={{
                  height: isPlaying
                    ? `${Math.max(20, Math.min(100, baseHeight + Math.sin(Date.now() / 120 + i * 0.5) * 20))}%`
                    : `${baseHeight}%`,
                }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
              />
            );
          })}
        </div>

        {/* Timestamps */}
        <div className="flex justify-between items-center text-[11px] font-mono text-neutral-400 px-1">
          <span className="text-white font-medium">{formatTime(currentTime)}</span>
          <span className="text-neutral-500">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2.5">
          {/* Main Play/Pause Button */}
          <motion.button
            id="audio-play-pause-btn"
            type="button"
            onClick={togglePlay}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-10 h-10 flex items-center justify-center bg-white text-black font-semibold rounded-full shadow-md shadow-white/10 hover:bg-neutral-200 transition-colors"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-black" />
            ) : (
              <Play className="w-4 h-4 fill-black ml-0.5" />
            )}
          </motion.button>

          {/* Restart */}
          <button
            id="audio-restart-btn"
            type="button"
            onClick={handleRestart}
            title="Restart playback"
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Speed Toggle Pill */}
          <button
            id="audio-speed-btn"
            type="button"
            onClick={handleRateChange}
            className="px-2.5 py-1 text-xs font-mono font-medium rounded-lg border border-white/[0.08] text-neutral-300 hover:text-white hover:border-white/[0.2] bg-white/[0.04] transition-colors"
            title="Adjust playback speed"
          >
            {playbackRate}x
          </button>
        </div>

        {/* Volume controls */}
        <div className="flex items-center gap-2">
          <button
            id="audio-mute-btn"
            type="button"
            onClick={toggleMute}
            className="text-neutral-400 hover:text-white transition-colors p-1"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            id="audio-volume-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 sm:w-24 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
