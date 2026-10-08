import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Film,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Download,
  Copy,
  Check,
  Sparkles,
  Sliders,
  Layers,
  AlertCircle,
  X,
  Key,
  Video as VideoIcon,
  Clock,
  Loader2,
  Cpu,
  Tv,
  Zap,
} from 'lucide-react';
import { HistoryItem } from '../types';
import { FallbackNotice } from './FallbackNotice';

interface Props {
  onAddToHistory: (item: Omit<HistoryItem, 'id' | 'timestamp'>) => void;
}

const PRESET_VIDEO_PROMPTS = [
  {
    title: 'Ocean Wave Dynamics',
    base: 'epiCRealism',
    motion: 'natural',
    prompt: 'Roaring ocean waves crashing violently against dark volcanic coastal cliffs, dynamic sea spray and foamy water splash simulation, golden hour sunlight, hyperrealistic 4k',
  },
  {
    title: 'Cyberpunk Rain Speed',
    base: 'epiCRealism',
    motion: 'pan-left',
    prompt: 'Sleek flying spinner car cruising down a rain-soaked neon cyberpunk Tokyo skyway, glowing neon reflections on wet metallic chassis, steam and misty rain particles, 24fps motion blur',
  },
  {
    title: 'Volcanic Magma Flow',
    base: 'epiCRealism',
    motion: 'zoom-in',
    prompt: 'Fiery volcanic crater erupting with glowing molten lava rivers and drifting incandescent ash embers, dense smoke billowing into dark night sky, intense dynamic fluid heat physics',
  },
  {
    title: 'Anime Cybernetic Walk',
    base: 'ToonYou',
    motion: 'zoom-in',
    prompt: 'Futuristic anime mech warrior walking forward through a glowing holographic portal, energy sparks radiating from power core, dynamic anime sakuga animation style, Makoto Shinkai lighting',
  },
  {
    title: 'Bioluminescent Abyss',
    base: 'epiCRealism',
    motion: 'tilt-up',
    prompt: 'Deep underwater hydrothermal vent surrounded by floating glowing bioluminescent jellyfish and ethereal shimmering plankton, deep sea organic fluid motion',
  },
];

const LOADING_PHASES = [
  'Allocating ZeroGPU Neural Diffusion Worker...',
  'Computing 3D temporal motion latents (AnimateDiff)...',
  'Synthesizing continuous physical fluid & subject dynamics...',
  'Enhancing frames with Lanczos HD upscaling & 24fps smoothing...',
  'Injecting synchronized atmospheric ambient audio & finalizing MP4...',
];

export const VideoPanel: React.FC<Props> = ({ onAddToHistory }) => {
  const [prompt, setPrompt] = useState<string>(
    'Roaring ocean waves crashing violently against dark volcanic coastal cliffs, dynamic sea spray and foamy water splash simulation, golden hour sunlight, hyperrealistic 4k'
  );
  const [negativePrompt, setNegativePrompt] = useState<string>('low quality, blurry, distorted, jitter, artifacts, watermark');
  const [baseModel, setBaseModel] = useState<'epiCRealism' | 'ToonYou'>('epiCRealism');
  const [motionStyle, setMotionStyle] = useState<string>('natural');
  const [steps, setSteps] = useState<number>(4);
  const [durationSec, setDurationSec] = useState<number>(4.0);
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [hfToken, setHfToken] = useState<string>(() => localStorage.getItem('open_suite_hf_token') || '');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationTime, setGenerationTime] = useState<number>(0);
  const [activePhaseIndex, setActivePhaseIndex] = useState<number>(0);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState<{
    prompt: string;
    model: string;
    motion: string;
    sizeBytes: number;
    durationSec: number;
    fps: number;
    resolution: string;
    method?: string;
    remoteError?: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Custom Video Player State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  // Token persistence
  const handleTokenChange = (val: string) => {
    setHfToken(val);
    if (val.trim()) {
      localStorage.setItem('open_suite_hf_token', val.trim());
    } else {
      localStorage.removeItem('open_suite_hf_token');
    }
  };

  // Progress indicator timer
  useEffect(() => {
    let timer: any = null;
    if (isGenerating) {
      setGenerationTime(0);
      setActivePhaseIndex(0);
      timer = setInterval(() => {
        setGenerationTime((prev) => {
          const next = prev + 1;
          if (next % 4 === 0) {
            setActivePhaseIndex((p) => (p + 1) % LOADING_PHASES.length);
          }
          return next;
        });
      }, 1000);
    } else {
      setGenerationTime(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isGenerating]);

  // Video playback listeners
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedData = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.duration && !isNaN(vid.duration)) {
      setTotalDuration(vid.duration);
    }
    if (isPlaying) {
      vid.play().catch(() => {});
    }
  };

  const handleLoadedMetadata = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.duration && !isNaN(vid.duration)) {
      setTotalDuration(vid.duration);
    }
  };

  const handleCanPlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isPlaying && vid.paused) {
      vid.play().catch(() => {});
    }
  };

  const handleEnded = () => {
    if (!isLooping) {
      setIsPlaying(false);
    }
  };

  // Auto-play when new video loads
  useEffect(() => {
    if (videoUrl && videoRef.current) {
      const vid = videoRef.current;
      vid.load();
      vid.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        vid.muted = true;
        setIsMuted(true);
        vid.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          setIsPlaying(false);
        });
      });
    }
  }, [videoUrl]);

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isPlaying) {
      vid.pause();
      setIsPlaying(false);
    } else {
      vid.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleToggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const formatTimeStr = (sec: number) => {
    if (isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleGenerate = async (overridePrompt?: string) => {
    const textPrompt = (overridePrompt || prompt).trim();
    if (!textPrompt) {
      setErrorMsg('Please enter a video prompt description.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: textPrompt,
          hf_token: hfToken.trim() || undefined,
          negative_prompt: negativePrompt.trim(),
          seconds: durationSec,
          motion_style: motionStyle,
          base_model: baseModel,
          steps: steps,
          resolution: resolution,
        }),
      });

      if (!res.ok) {
        let errText = `Server responded with status ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson.error) errText = errJson.error;
        } catch {}
        throw new Error(errText);
      }

      const data = await res.json();
      if (!data.success || !data.videoUrl) {
        throw new Error(data.error || 'Failed to render video asset.');
      }

      setVideoUrl(data.videoUrl);
      setVideoMeta({
        prompt: textPrompt,
        model: data.model || (baseModel === 'ToonYou' ? 'AnimateDiff (ToonYou Anime)' : 'AnimateDiff-Lightning (Photorealistic)'),
        motion: motionStyle,
        sizeBytes: data.sizeBytes || 0,
        durationSec: data.durationSec || durationSec,
        fps: data.fps || 24,
        resolution: data.resolution || resolution,
        method: data.method,
        remoteError: data.remoteError,
      });
      setIsPlaying(true);

      // Add to history
      onAddToHistory({
        type: 'video',
        title: textPrompt.length > 45 ? `${textPrompt.substring(0, 45)}...` : textPrompt,
        text: textPrompt,
        videoUrl: data.videoUrl,
        durationSec: data.durationSec || durationSec,
        voiceOrModel: data.model || (baseModel === 'ToonYou' ? 'AnimateDiff (ToonYou Anime)' : 'AnimateDiff-Lightning (epiCRealism)'),
      });
    } catch (err: any) {
      console.error('[Video Gen Error]:', err);
      setErrorMsg(err.message || 'Video synthesis encountered an error. Please retry.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPrompt = () => {
    if (!prompt) return;
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleCopyUrl = () => {
    if (!videoUrl) return;
    navigator.clipboard.writeText(videoUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const selectPreset = (preset: typeof PRESET_VIDEO_PROMPTS[0]) => {
    setPrompt(preset.prompt);
    setBaseModel(preset.base as any);
    setMotionStyle(preset.motion);
  };

  return (
    <div id="video-studio-panel" className="w-full flex flex-col gap-6">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <span>Text-to-Video Neural Diffusion</span>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              ByteDance AnimateDiff-Lightning
            </span>
          </h1>
          <p className="text-xs text-neutral-400 mt-1 max-w-2xl leading-relaxed">
            Generate short clips with AnimateDiff-Lightning on free public Hugging Face Spaces: about 1.6 seconds of neural motion, looped and upscaled to your chosen length. If the free queue is unavailable, the app falls back to an image cross-dissolve and says so.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono text-neutral-300">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Neural Diffusion Engine</span>
          </div>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Prompt Input & Video Controls */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          <div className="bg-[#0D0F16] border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
            {/* Prompt Header */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-neutral-400" />
                <span>Video Prompt</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="text-[11px] text-neutral-400 hover:text-neutral-200 flex items-center gap-1 transition-colors"
                >
                  {copiedPrompt ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPrompt ? 'Copied' : 'Copy'}</span>
                </button>
                <span className="text-[11px] font-mono text-neutral-500">{prompt.length} chars</span>
              </div>
            </div>

            {/* Prompt Textarea */}
            <div className="relative">
              <textarea
                id="video-prompt-input"
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe dynamic physical movement (crashing waves, walking characters, soaring eagles, flying vehicles, fire plumes), lighting, and camera angle..."
                className="w-full bg-[#07080B] border border-white/[0.1] focus:border-white/30 rounded-xl p-3.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-sans leading-relaxed resize-y min-h-[110px]"
              />
            </div>

            {/* Curated Dynamic Motion Presets */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-medium text-neutral-400 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>Multi-Frame Motion Presets:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_VIDEO_PROMPTS.map((preset) => (
                  <button
                    key={preset.title}
                    type="button"
                    onClick={() => selectPreset(preset)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.15] text-neutral-300 hover:text-white transition-all text-left"
                  >
                    {preset.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Base Visual Style Model */}
            <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                  <Tv className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Base Diffusion Aesthetic</span>
                </label>
                <span className="text-[11px] text-cyan-400 font-mono">
                  {baseModel === 'epiCRealism' ? 'epiCRealism (Live-Action)' : 'ToonYou (Anime / CGI)'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBaseModel('epiCRealism')}
                  className={`py-2.5 px-3 rounded-xl border text-left flex flex-col gap-0.5 transition-all ${
                    baseModel === 'epiCRealism'
                      ? 'bg-white/10 border-white/30 text-white shadow-sm'
                      : 'bg-white/[0.02] border-white/[0.06] text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <span className="text-xs font-medium">epiCRealism (Photorealistic)</span>
                  <span className="text-[10px] text-neutral-500">Cinematic live-action realism, real lighting & physics</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBaseModel('ToonYou')}
                  className={`py-2.5 px-3 rounded-xl border text-left flex flex-col gap-0.5 transition-all ${
                    baseModel === 'ToonYou'
                      ? 'bg-white/10 border-white/30 text-white shadow-sm'
                      : 'bg-white/[0.02] border-white/[0.06] text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <span className="text-xs font-medium">ToonYou (Anime / 3D Stylized)</span>
                  <span className="text-[10px] text-neutral-500">Dynamic 2D anime sakuga and stylized 3D render</span>
                </button>
              </div>
            </div>

            {/* Motion LoRA Dynamics */}
            <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                  <Film className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Motion Dynamics & Camera LoRA</span>
                </label>
                <span className="text-[11px] text-neutral-400 font-mono capitalize">
                  {motionStyle}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { key: 'natural', label: 'Natural Flow', desc: 'Organic subject physics' },
                  { key: 'zoom-in', label: 'Dolly Zoom In', desc: 'Cinematic forward push' },
                  { key: 'zoom-out', label: 'Dolly Zoom Out', desc: 'Expansive reveal' },
                  { key: 'pan-left', label: 'Pan Left', desc: 'Horizontal slider left' },
                  { key: 'pan-right', label: 'Pan Right', desc: 'Horizontal slider right' },
                  { key: 'tilt-up', label: 'Tilt Up', desc: 'Vertical upward tilt' },
                  { key: 'tilt-down', label: 'Tilt Down', desc: 'Vertical downward tilt' },
                  { key: 'rolling-clockwise', label: 'Orbital Spin', desc: 'Rotational 3D drift' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setMotionStyle(item.key)}
                    className={`py-2 px-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-all ${
                      motionStyle === item.key
                        ? 'bg-white/10 border-white/30 text-white shadow-sm'
                        : 'bg-white/[0.02] border-white/[0.06] text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <span className="text-xs font-medium">{item.label}</span>
                    <span className="text-[10px] text-neutral-500 line-clamp-1">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quality Steps & Duration Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/[0.06]">
              {/* Diffusion Steps */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Inference Steps</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSteps(4)}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                      steps === 4
                        ? 'bg-white/10 border-white/30 text-white'
                        : 'bg-white/[0.02] border-white/[0.06] text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    4-Step Turbo (~12s)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSteps(8)}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                      steps === 8
                        ? 'bg-white/10 border-white/30 text-white'
                        : 'bg-white/[0.02] border-white/[0.06] text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    8-Step Precision (~18s)
                  </button>
                </div>
              </div>

              {/* Target Clip Duration */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Clip Duration</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { sec: 3.0, label: '3.0s' },
                    { sec: 4.0, label: '4.0s' },
                    { sec: 6.0, label: '6.0s' },
                  ].map((item) => (
                    <button
                      key={item.sec}
                      type="button"
                      onClick={() => setDurationSec(item.sec)}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-medium transition-all ${
                        durationSec === item.sec
                          ? 'bg-white/10 border-white/30 text-white'
                          : 'bg-white/[0.02] border-white/[0.06] text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <div className="pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-neutral-400 hover:text-neutral-200 flex items-center gap-1.5 transition-colors"
              >
                <Key className="w-3.5 h-3.5" />
                <span>{showAdvanced ? 'Hide Advanced Options' : 'Optional Hugging Face Token & Negative Prompt'}</span>
              </button>

              {showAdvanced && (
                <div className="mt-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-3 animate-in fade-in">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-mono text-neutral-300 flex items-center justify-between">
                      <span>HF Access Token (ZeroGPU Priority)</span>
                      <span className="text-[10px] text-neutral-500">Optional</span>
                    </label>
                    <input
                      type="password"
                      value={hfToken}
                      onChange={(e) => handleTokenChange(e.target.value)}
                      placeholder="hf_..."
                      className="bg-[#07080B] border border-white/10 rounded-lg p-2 text-xs font-mono text-neutral-200 placeholder-neutral-700 focus:outline-none focus:border-white/30"
                    />
                    <span className="text-[10px] text-neutral-500">
                      If provided, authenticates directly with Hugging Face ZeroGPU spaces to bypass anonymous queues.
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-mono text-neutral-300">Negative Prompt</label>
                    <input
                      type="text"
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      placeholder="low quality, blurry, distorted, jitter, artifacts"
                      className="bg-[#07080B] border border-white/10 rounded-lg p-2 text-xs font-mono text-neutral-200 placeholder-neutral-700 focus:outline-none focus:border-white/30"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start justify-between gap-3 animate-in fade-in">
                <div className="flex items-start gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div className="leading-relaxed break-words">{errorMsg}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  className="text-rose-400 hover:text-rose-200 flex-shrink-0 p-0.5 rounded hover:bg-rose-500/20"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Generate Action Button */}
            <motion.button
              id="generate-video-btn"
              type="button"
              disabled={isGenerating || !prompt.trim()}
              onClick={() => handleGenerate()}
              whileHover={{ scale: isGenerating ? 1 : 1.01 }}
              whileTap={{ scale: isGenerating ? 1 : 0.99 }}
              className={`w-full py-3.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2.5 transition-all shadow-lg ${
                isGenerating
                  ? 'bg-white/10 text-neutral-400 border border-white/10 cursor-not-allowed'
                  : 'bg-white text-black hover:bg-neutral-200 cursor-pointer'
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Generating Neural Video Diffusion ({generationTime}s)...</span>
                </>
              ) : (
                <>
                  <Film className="w-4 h-4 text-black" />
                  <span>Generate Neural Diffusion Video</span>
                </>
              )}
            </motion.button>
          </div>
        </div>

        {/* Right Column: Custom HTML5 Video Player Viewport */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-[#0D0F16] border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-xl min-h-[460px]">
            {/* Viewport Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <VideoIcon className="w-4 h-4 text-neutral-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                  Custom Video Viewport
                </span>
              </div>
              {videoUrl && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono">
                    <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${isPlaying ? 'animate-ping' : ''}`} />
                    <span>{isPlaying ? 'PLAYING • 24 FPS' : 'PAUSED'}</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.06] text-neutral-400 border border-white/[0.08]">
                    H.264 HD
                  </span>
                </div>
              )}
            </div>

            {/* Custom Video Viewport Container */}
            <div className="w-full flex-1 flex flex-col items-center justify-center bg-[#07080B] border border-white/[0.06] rounded-xl overflow-hidden relative min-h-[380px] group">
              {/* Indeterminate Progressive Loading State */}
              {isGenerating && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[#07080B]/95 backdrop-blur-md p-6 text-center">
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-2xl border border-cyan-500/20 animate-ping opacity-40" />
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/20 flex items-center justify-center shadow-inner">
                      <Film className="w-6 h-6 text-cyan-400 animate-pulse" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 max-w-xs">
                    <div className="text-sm font-semibold text-white">Synthesizing Neural Diffusion</div>
                    <div className="text-xs font-mono text-cyan-400 min-h-[32px] transition-all">
                      {LOADING_PHASES[activePhaseIndex]}
                    </div>
                  </div>

                  <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden relative">
                    <div className="absolute inset-y-0 bg-gradient-to-r from-cyan-400 to-white w-1/3 rounded-full animate-indeterminate" />
                  </div>

                  <div className="text-[11px] font-mono text-neutral-500">
                    Elapsed: {generationTime}s • AnimateDiff-Lightning
                  </div>
                </div>
              )}

              {videoUrl ? (
                <div className="w-full h-full flex flex-col items-center justify-center relative">
                  {/* HTML5 Video Element with default controls hidden */}
                  <video
                    ref={videoRef}
                    id="rendered-video-element"
                    src={videoUrl}
                    loop={isLooping}
                    muted={isMuted}
                    playsInline
                    preload="auto"
                    onLoadedData={handleLoadedData}
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onCanPlay={handleCanPlay}
                    onEnded={handleEnded}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onClick={togglePlay}
                    className="w-full h-auto max-h-[500px] object-contain rounded-lg cursor-pointer"
                  />

                  {/* Center Floating Play/Pause Action */}
                  <div
                    onClick={togglePlay}
                    className={`absolute inset-0 flex items-center justify-center cursor-pointer transition-opacity duration-200 ${
                      isPlaying
                        ? 'opacity-0 hover:opacity-100 bg-black/10'
                        : 'opacity-100 bg-black/25'
                    }`}
                  >
                    <motion.button
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      className="w-14 h-14 rounded-2xl bg-black/75 backdrop-blur-md border border-white/25 text-white flex items-center justify-center shadow-2xl"
                    >
                      {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                    </motion.button>
                  </div>

                  {/* Custom Modern Video Control Bar */}
                  <div className="w-full bg-[#0D0F16]/95 backdrop-blur-md p-3 border-t border-white/[0.08] flex flex-col gap-2 z-20">
                    {/* Scrub Timeline */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-neutral-400 w-9 text-left">
                        {formatTimeStr(currentTime)}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={totalDuration || durationSec}
                        step={0.05}
                        value={currentTime}
                        onChange={handleSeek}
                        className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                      />
                      <span className="text-[10px] font-mono text-neutral-500 w-9 text-right">
                        {formatTimeStr(totalDuration || durationSec)}
                      </span>
                    </div>

                    {/* Bottom Controls Row */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        {/* Play/Pause */}
                        <button
                          type="button"
                          onClick={togglePlay}
                          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                          title={isPlaying ? 'Pause' : 'Play'}
                        >
                          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>

                        {/* Mute Toggle */}
                        <button
                          type="button"
                          onClick={handleToggleMute}
                          className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-neutral-300 hover:text-white transition-colors"
                          title={isMuted ? 'Unmute' : 'Mute'}
                        >
                          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>

                        {/* Loop Toggle */}
                        <button
                          type="button"
                          onClick={() => setIsLooping(!isLooping)}
                          className={`p-1.5 rounded-lg text-xs font-mono flex items-center gap-1 transition-colors ${
                            isLooping
                              ? 'bg-white/15 text-white border border-white/20'
                              : 'bg-white/[0.04] text-neutral-500'
                          }`}
                          title="Toggle Loop"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="text-[10px]">Loop</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleFullscreen}
                          className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-neutral-300 hover:text-white transition-colors"
                          title="Fullscreen"
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>

                        <a
                          href={videoUrl}
                          download={`video_${Date.now()}.mp4`}
                          className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold flex items-center gap-1.5 hover:bg-neutral-200 transition-colors"
                          title="Download MP4"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download MP4</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 text-center p-8 text-neutral-500">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-neutral-600">
                    <Film className="w-6 h-6" />
                  </div>
                  <div className="text-xs font-medium text-neutral-400">No Video Rendered Yet</div>
                  <div className="text-[11px] text-neutral-600 max-w-xs leading-relaxed">
                    Enter a prompt to generate a short clip. If the free neural queue is busy, a simple image cross-dissolve is used instead and clearly labelled.
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Meta Bar */}
            {videoUrl && videoMeta && (
              <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-neutral-400 truncate max-w-[240px]">
                    {videoMeta.prompt}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="px-2.5 py-1 text-[11px] rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors"
                    >
                      {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedUrl ? 'Copied' : 'Copy Data'}</span>
                    </button>
                  </div>
                </div>

                {videoMeta.method === 'keyframe-morph' && (
                  <FallbackNotice title="Not AI-generated motion" detail={videoMeta.remoteError}>
                    The neural video queue was unavailable, so this clip is a cross-dissolve between two generated still
                    images with a faint background tone. Try again later, or add a Hugging Face token under Advanced to
                    skip the anonymous queue.
                  </FallbackNotice>
                )}

                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-neutral-400">
                  <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-cyan-300">
                    {videoMeta.model}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08]">
                    Motion: {videoMeta.motion}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08]">
                    {videoMeta.fps} FPS
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08]">
                    {(videoMeta.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
