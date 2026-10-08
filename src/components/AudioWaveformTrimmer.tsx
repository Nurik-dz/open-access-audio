import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Scissors,
  Play,
  Pause,
  RotateCcw,
  Check,
  Volume2,
  Clock,
  Sparkles,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Sliders
} from 'lucide-react';

interface AudioWaveformTrimmerProps {
  audioUrl: string;
  onTrimApplied: (
    trimmedBlob: Blob,
    trimmedUrl: string,
    startTime: number,
    endTime: number,
    duration: number
  ) => void;
  onResetOriginal?: () => void;
  isOriginal?: boolean;
}

// Converts an AudioBuffer slice directly to a standard 16-bit PCM WAV Blob
export function audioBufferToWavBlob(
  buffer: AudioBuffer,
  startSec: number = 0,
  endSec?: number
): Blob {
  const sampleRate = buffer.sampleRate;
  const numChannels = Math.min(2, buffer.numberOfChannels);

  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(
    buffer.length,
    Math.floor((endSec ?? buffer.duration) * sampleRate)
  );
  const numSamples = Math.max(0, endSample - startSample);

  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);

  // data subchunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sIndex = startSample + i;
    for (let c = 0; c < numChannels; c++) {
      let sample = channels[c][sIndex] || 0;
      sample = Math.max(-1, Math.min(1, sample));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export const AudioWaveformTrimmer: React.FC<AudioWaveformTrimmerProps> = ({
  audioUrl,
  onTrimApplied,
  onResetOriginal,
  isOriginal = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [isLoadingBuffer, setIsLoadingBuffer] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Trimming selection bounds (in seconds)
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackPos, setPlaybackPos] = useState<number>(0);
  const [isLooping, setIsLooping] = useState<boolean>(false);

  // Audio Context & Source references for auditioning
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackStartAudioTimeRef = useRef<number>(0);
  const playbackStartOffsetRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  // Interaction dragging states
  const draggingRef = useRef<'start' | 'end' | 'range' | null>(null);
  const dragStartMouseXRef = useRef<number>(0);
  const dragInitialStartRef = useRef<number>(0);
  const dragInitialEndRef = useRef<number>(0);

  // 1. Decode Audio Buffer and calculate waveform peaks
  useEffect(() => {
    let isCancelled = false;
    setIsLoadingBuffer(true);
    setLoadError(null);

    const loadAudio = async () => {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        const decoded = await ctx.decodeAudioData(arrayBuffer);
        if (isCancelled) return;

        setAudioBuffer(decoded);
        const totalSec = decoded.duration;
        setDuration(totalSec);

        // Compute 280 normalized peak buckets for rich visual fidelity
        const rawData = decoded.getChannelData(0);
        const sampleCount = 280;
        const blockSize = Math.floor(rawData.length / sampleCount);
        const calculatedPeaks: number[] = [];

        for (let i = 0; i < sampleCount; i++) {
          const start = i * blockSize;
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[start + j] || 0);
          }
          const avg = sum / blockSize;
          calculatedPeaks.push(avg);
        }

        // Normalize peaks between 0.05 and 1.0
        const maxPeak = Math.max(...calculatedPeaks, 0.001);
        const normalized = calculatedPeaks.map((p) => Math.max(0.06, p / maxPeak));
        setPeaks(normalized);

        // Set default trim selection (e.g. initial full duration or up to 10s default)
        setTrimStart(0);
        setTrimEnd(totalSec);
        setPlaybackPos(0);
        setIsLoadingBuffer(false);
      } catch (err: any) {
        console.error('Audio decode error:', err);
        if (!isCancelled) {
          setLoadError(err.message || 'Failed to decode audio waveform.');
          setIsLoadingBuffer(false);
        }
      }
    };

    loadAudio();

    return () => {
      isCancelled = true;
      stopPlayback();
    };
  }, [audioUrl]);

  // 2. Playback Audio Buffer Segment
  const stopPlayback = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // Ignore if already stopped
      }
      sourceNodeRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const playTrimmedSegment = useCallback(
    (offsetSec?: number) => {
      if (!audioBuffer) return;

      stopPlayback();

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      let ctx = audioCtxRef.current;
      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioCtx();
        audioCtxRef.current = ctx;
      }
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const start = offsetSec !== undefined ? offsetSec : trimStart;
      const end = trimEnd > start ? trimEnd : duration;
      const playDuration = Math.max(0.1, end - start);

      source.start(0, start, playDuration);
      sourceNodeRef.current = source;
      playbackStartAudioTimeRef.current = ctx.currentTime;
      playbackStartOffsetRef.current = start;
      setIsPlaying(true);

      const updateProgress = () => {
        if (!ctx || !sourceNodeRef.current) return;
        const elapsed = ctx.currentTime - playbackStartAudioTimeRef.current;
        const currentPos = playbackStartOffsetRef.current + elapsed;

        if (currentPos >= end) {
          if (isLooping) {
            playTrimmedSegment(trimStart);
          } else {
            setPlaybackPos(trimStart);
            setIsPlaying(false);
            stopPlayback();
          }
          return;
        }

        setPlaybackPos(currentPos);
        animFrameRef.current = requestAnimationFrame(updateProgress);
      };

      animFrameRef.current = requestAnimationFrame(updateProgress);

      source.onended = () => {
        if (!isLooping && sourceNodeRef.current === source) {
          setIsPlaying(false);
          setPlaybackPos(trimStart);
        }
      };
    },
    [audioBuffer, trimStart, trimEnd, duration, isLooping, stopPlayback]
  );

  const togglePlay = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      playTrimmedSegment(trimStart);
    }
  };

  // 3. Canvas Rendering of Waveform, Selection, and Handles
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0 || duration === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#090B0E';
    ctx.fillRect(0, 0, width, height);

    // Draw Subtle Horizontal Center Guideline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Time calculations
    const startX = (trimStart / duration) * width;
    const endX = (trimEnd / duration) * width;

    // Draw Active Selection Background Highlight
    const selWidth = Math.max(0, endX - startX);
    const grad = ctx.createLinearGradient(startX, 0, endX, 0);
    grad.addColorStop(0, 'rgba(59, 130, 246, 0.15)');
    grad.addColorStop(0.5, 'rgba(14, 165, 233, 0.22)');
    grad.addColorStop(1, 'rgba(59, 130, 246, 0.15)');

    ctx.fillStyle = grad;
    ctx.fillRect(startX, 0, selWidth, height);

    // Draw Dimmed Muted Regions outside selection
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, startX, height);
    ctx.fillRect(endX, 0, width - endX, height);

    // Draw Waveform Bars
    const barCount = peaks.length;
    const barWidth = Math.max(1.5, (width / barCount) * 0.7);
    const gap = (width - barCount * barWidth) / (barCount - 1);

    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + gap);
      const peakVal = peaks[i];
      const barHeight = Math.max(3, peakVal * (height * 0.8));
      const y = (height - barHeight) / 2;

      // Determine if bar falls inside active trimmed range
      const barTime = (i / barCount) * duration;
      const isInside = barTime >= trimStart && barTime <= trimEnd;

      if (isInside) {
        // Electric Cyan-Blue active bar
        const barGrad = ctx.createLinearGradient(0, y, 0, y + barHeight);
        barGrad.addColorStop(0, '#60a5fa');
        barGrad.addColorStop(0.5, '#38bdf8');
        barGrad.addColorStop(1, '#2563eb');
        ctx.fillStyle = barGrad;
      } else {
        // Dimmed unselected bar
        ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
      }

      // Draw rounded bar
      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(x, y, barWidth, barHeight, 2)
        : ctx.rect(x, y, barWidth, barHeight);
      ctx.fill();
    }

    // Draw Selection Bounding Handles (Left & Right)
    // Left handle (Start)
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(startX - 1.5, 0, 3, height);

    // Left Handle Pill/Tab
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(startX - 10, 4, 10, 24, [4, 0, 0, 4])
      : ctx.rect(startX - 10, 4, 10, 24);
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Grip lines on left handle
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(startX - 7, 10, 1.5, 12);
    ctx.fillRect(startX - 4, 10, 1.5, 12);

    // Right handle (End)
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(endX - 1.5, 0, 3, height);

    // Right Handle Pill/Tab
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(endX, 4, 10, 24, [0, 4, 4, 0])
      : ctx.rect(endX, 4, 10, 24);
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Grip lines on right handle
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(endX + 3, 10, 1.5, 12);
    ctx.fillRect(endX + 6, 10, 1.5, 12);

    // Draw Moving Playhead Needle if playing or placed
    if (playbackPos >= 0 && playbackPos <= duration) {
      const playheadX = (playbackPos / duration) * width;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset

      // Playhead top cap
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(playheadX, 5, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [peaks, duration, trimStart, trimEnd, playbackPos]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Handle Canvas Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      renderCanvas();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [renderCanvas]);

  // 4. Mouse / Touch Dragging Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || duration === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const width = rect.width;

    const startX = (trimStart / duration) * width;
    const endX = (trimEnd / duration) * width;

    dragStartMouseXRef.current = mouseX;
    dragInitialStartRef.current = trimStart;
    dragInitialEndRef.current = trimEnd;

    // Detect click zone: near Start handle (within 14px), near End handle (within 14px), or inside Range
    if (Math.abs(mouseX - startX) <= 14 || (mouseX < startX && mouseX >= startX - 12)) {
      draggingRef.current = 'start';
    } else if (Math.abs(mouseX - endX) <= 14 || (mouseX > endX && mouseX <= endX + 12)) {
      draggingRef.current = 'end';
    } else if (mouseX > startX && mouseX < endX) {
      // If user holds shift or clicks directly inside, allow sliding the whole range
      draggingRef.current = 'range';
    } else {
      // Clicked outside selection: redefine trim range around click
      const clickTime = Math.max(0, Math.min(duration, (mouseX / width) * duration));
      if (clickTime < trimStart) {
        setTrimStart(clickTime);
        setPlaybackPos(clickTime);
      } else {
        setTrimEnd(clickTime);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !draggingRef.current || duration === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const width = rect.width;
    const currentTime = (mouseX / width) * duration;

    const minClipDuration = 0.5; // Minimum 0.5s clip

    if (draggingRef.current === 'start') {
      const newStart = Math.min(currentTime, trimEnd - minClipDuration);
      setTrimStart(Math.max(0, newStart));
      setPlaybackPos(Math.max(0, newStart));
    } else if (draggingRef.current === 'end') {
      const newEnd = Math.max(currentTime, trimStart + minClipDuration);
      setTrimEnd(Math.min(duration, newEnd));
    } else if (draggingRef.current === 'range') {
      const deltaX = mouseX - dragStartMouseXRef.current;
      const deltaTime = (deltaX / width) * duration;
      const rangeLen = dragInitialEndRef.current - dragInitialStartRef.current;

      let newStart = dragInitialStartRef.current + deltaTime;
      let newEnd = dragInitialEndRef.current + deltaTime;

      if (newStart < 0) {
        newStart = 0;
        newEnd = rangeLen;
      }
      if (newEnd > duration) {
        newEnd = duration;
        newStart = duration - rangeLen;
      }

      setTrimStart(newStart);
      setTrimEnd(newEnd);
      setPlaybackPos(newStart);
    }
  };

  const handleMouseUp = () => {
    draggingRef.current = null;
  };

  // 5. Quick Trim Presets
  const setQuickRange = (start: number, length: number) => {
    if (duration === 0) return;
    const clampedStart = Math.max(0, Math.min(duration - 0.5, start));
    const clampedEnd = Math.min(duration, clampedStart + length);
    setTrimStart(clampedStart);
    setTrimEnd(clampedEnd);
    setPlaybackPos(clampedStart);
    stopPlayback();
  };

  // 6. Apply Trim Action
  const handleApplyTrim = () => {
    if (!audioBuffer) return;
    stopPlayback();

    const trimmedBlob = audioBufferToWavBlob(audioBuffer, trimStart, trimEnd);
    const trimmedUrl = URL.createObjectURL(trimmedBlob);
    const clipDuration = trimEnd - trimStart;

    onTrimApplied(trimmedBlob, trimmedUrl, trimStart, trimEnd, clipDuration);
  };

  const selectedDuration = Math.max(0, trimEnd - trimStart);

  if (loadError) {
    return (
      <div className="p-4 bg-red-950/20 border border-red-500/30 rounded-xl text-xs text-red-300 font-mono flex items-center justify-between">
        <span>Waveform trimmer error: {loadError}</span>
        {onResetOriginal && (
          <button
            onClick={onResetOriginal}
            className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded text-[11px]"
          >
            Reset
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      id="audio-waveform-trimmer"
      className="bg-[#0C0E14] border border-white/[0.08] rounded-xl p-4 flex flex-col gap-3.5 shadow-lg relative overflow-hidden"
    >
      {/* Top Banner with Trim Times and Quick Helpers */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-white/[0.07]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white">
            <Scissors className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white flex items-center gap-1.5">
              <span>Waveform Audio Trimmer</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.08] text-neutral-300">
                Precision Crop
              </span>
            </div>
            <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
              Drag the boundary handles to select the cleanest vocal segment.
            </div>
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => setQuickRange(0, duration)}
            className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white rounded text-[10px] font-mono transition-colors border border-white/[0.06]"
          >
            Select All
          </button>
          {duration > 5 && (
            <button
              type="button"
              onClick={() => setQuickRange(0, 5)}
              className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white rounded text-[10px] font-mono transition-colors border border-white/[0.06]"
            >
              First 5s
            </button>
          )}
          {duration > 10 && (
            <button
              type="button"
              onClick={() => setQuickRange(0, 10)}
              className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white rounded text-[10px] font-mono transition-colors border border-white/[0.06]"
            >
              First 10s
            </button>
          )}
          {duration > 15 && (
            <button
              type="button"
              onClick={() => setQuickRange(Math.max(0, (duration - 10) / 2), 10)}
              className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white rounded text-[10px] font-mono transition-colors border border-white/[0.06]"
            >
              Mid 10s
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas Waveform Container */}
      <div
        ref={containerRef}
        className="relative w-full h-24 bg-[#07080B] rounded-lg border border-white/[0.08] overflow-hidden select-none cursor-ew-resize group"
      >
        {isLoadingBuffer ? (
          <div className="w-full h-full flex items-center justify-center gap-2 text-xs text-neutral-400 font-mono">
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Decoding acoustic audio waveform...</span>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="w-full h-full block"
          />
        )}

        {/* Drag Hint overlay */}
        {!isLoadingBuffer && (
          <div className="absolute bottom-1 right-2 text-[9px] font-mono text-neutral-500 pointer-events-none bg-black/60 px-1.5 py-0.5 rounded">
            Drag handles • Drag middle to slide
          </div>
        )}
      </div>

      {/* Timestamp Metrics and Audition/Crop Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        {/* Timestamp Readouts */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-neutral-300">
            <span className="text-neutral-500">Start:</span>
            <span className="text-white font-semibold">{formatTime(trimStart)}</span>
          </div>
          <span className="text-neutral-600">→</span>
          <div className="flex items-center gap-1.5 text-neutral-300">
            <span className="text-neutral-500">End:</span>
            <span className="text-white font-semibold">{formatTime(trimEnd)}</span>
          </div>
          <span className="text-neutral-600">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-500">Length:</span>
            <span className="text-neutral-200 font-semibold">{selectedDuration.toFixed(2)}s</span>
          </div>
        </div>

        {/* Playback & Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Play/Pause Audition */}
          <button
            type="button"
            onClick={togglePlay}
            disabled={isLoadingBuffer}
            className="px-3.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-white/[0.08]"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 text-white" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-white fill-white" />
                <span>Preview Range</span>
              </>
            )}
          </button>

          {/* Reset button if not original */}
          {onResetOriginal && !isOriginal && (
            <button
              type="button"
              onClick={() => {
                stopPlayback();
                onResetOriginal();
              }}
              className="px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-white/[0.06]"
            >
              <RotateCcw className="w-3 h-3 text-neutral-400" />
              <span>Reset Full</span>
            </button>
          )}

          {/* Apply Trim Button */}
          <button
            type="button"
            onClick={handleApplyTrim}
            disabled={isLoadingBuffer || selectedDuration <= 0.2}
            className="px-3.5 py-1.5 bg-white text-black hover:bg-neutral-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Apply Selected Clip</span>
          </button>
        </div>
      </div>
    </div>
  );
};
