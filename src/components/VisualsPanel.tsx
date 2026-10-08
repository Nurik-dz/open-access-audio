import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Image as ImageIcon,
  Sparkles,
  Download,
  Copy,
  Check,
  Maximize2,
  RefreshCw,
  Sliders,
  Layers,
  ArrowUpRight,
  AlertCircle,
  X,
  Eye,
} from 'lucide-react';
import { HistoryItem } from '../types';

interface Props {
  onAddToHistory: (item: Omit<HistoryItem, 'id' | 'timestamp'>) => void;
}

interface AspectRatioOption {
  id: string;
  label: string;
  sub: string;
  width: number;
  height: number;
}

const ASPECT_RATIOS: AspectRatioOption[] = [
  { id: '9:16', label: '9:16 Vertical', sub: '1080 × 1920', width: 1080, height: 1920 },
  { id: '1:1', label: '1:1 Square', sub: '1080 × 1080', width: 1080, height: 1080 },
  { id: '16:9', label: '16:9 Cinema', sub: '1920 × 1080', width: 1920, height: 1080 },
];

const PRESET_PROMPTS = [
  {
    title: 'Monolithic Concrete',
    prompt: 'Monumental brutalist concrete architecture rising from a dark misty reflective floor, stark geometric shadows, volumetric light beam, 8k cinematic masterpiece, ultra-minimalist',
  },
  {
    title: 'Deep Ocean Trench',
    prompt: 'Abyssal hydrothermal vent surrounded by bioluminescent flora and obsidian basalt rocks, deep oceanic particulate volumetric glow, cinematic National Geographic style',
  },
  {
    title: 'Minimalist Studio Geometry',
    prompt: 'Matte black and raw titanium geometric sculptures floating in a vast dark room, soft rim lighting, ultra sharp macro textures, industrial design photography',
  },
  {
    title: 'Cyberpunk Noir Alley',
    prompt: 'Wet neon-slick asphalt street in Tokyo at midnight, reflection of glowing cyan and amber Kanji signs, dense rainy mist, film grain, Hasselblad medium format portrait',
  },
  {
    title: 'Atmospheric Highlands',
    prompt: 'Vast volcanic Iceland mountain plateau under stormy twilight overcast sky, black sand dunes, winding glacial river stream, minimalist landscape fine art',
  },
];

export const VisualsPanel: React.FC<Props> = ({ onAddToHistory }) => {
  const [prompt, setPrompt] = useState<string>(
    'Brutalist monolithic concrete tower with dramatic slit lighting, sharp geometric edges, dark atmospheric mist, 8k resolution, minimalist architectural photography'
  );
  const [selectedRatio, setSelectedRatio] = useState<AspectRatioOption>(ASPECT_RATIOS[0]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{
    width: number;
    height: number;
    sizeBytes: number;
    prompt: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [isFullscreenModalOpen, setIsFullscreenModalOpen] = useState<boolean>(false);

  const handleGenerate = async (overridePrompt?: string) => {
    const textPrompt = (overridePrompt || prompt).trim();
    if (!textPrompt) {
      setErrorMsg('Please provide a prompt to generate visual assets.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: textPrompt,
          width: selectedRatio.width,
          height: selectedRatio.height,
        }),
      });

      if (!res.ok) {
        let errText = `Server responded with status ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson.error) errText = errJson.error;
        } catch {
          // Keep default status message
        }
        throw new Error(errText);
      }

      const data = await res.json();
      if (!data.success || !data.imageUrl) {
        throw new Error(data.error || 'Failed to synthesize visual asset.');
      }

      setGeneratedImage(data.imageUrl);
      setImageMeta({
        width: data.width || selectedRatio.width,
        height: data.height || selectedRatio.height,
        sizeBytes: data.sizeBytes || 0,
        prompt: textPrompt,
      });

      // Record in session history
      onAddToHistory({
        type: 'image',
        title: textPrompt.length > 50 ? `${textPrompt.substring(0, 50)}...` : textPrompt,
        text: textPrompt,
        imageUrl: data.imageUrl,
        dimensions: `${data.width || selectedRatio.width} × ${data.height || selectedRatio.height}`,
        voiceOrModel: 'Pollinations Direct Pipeline',
      });
    } catch (err: any) {
      console.error('[Image Synthesis Error]:', err);
      setErrorMsg(err.message || 'Image generation failed. Please check network connection and retry.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyUrl = () => {
    if (!generatedImage) return;
    navigator.clipboard.writeText(generatedImage);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyPrompt = () => {
    if (!prompt) return;
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <div id="visuals-studio-panel" className="w-full flex flex-col gap-6">
      {/* Studio Header / Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <span>Visual Asset Generator</span>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/[0.08] text-neutral-300 border border-white/[0.1]">
              Open-Access
            </span>
          </h1>
          <p className="text-xs text-neutral-400 mt-1 max-w-2xl leading-relaxed">
            Keyless, high-throughput text-to-image pipeline powered by open model inference. Optimized for vertical 1080×1920 assets without watermarks.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono text-neutral-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Zero API Key Required</span>
          </div>
        </div>
      </div>

      {/* Main Studio Grid: Input Column & Output Preview Column */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Prompt & Format Configuration */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* Prompt Input Container */}
          <div className="bg-[#0D0F16] border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-neutral-400" />
                <span>Text Prompt</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="text-[11px] text-neutral-400 hover:text-neutral-200 flex items-center gap-1 transition-colors"
                  title="Copy Prompt"
                >
                  {copiedPrompt ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPrompt ? 'Copied' : 'Copy'}</span>
                </button>
                <span className="text-[11px] font-mono text-neutral-500">
                  {prompt.length} chars
                </span>
              </div>
            </div>

            <div className="relative">
              <textarea
                id="visual-prompt-input"
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your visual concept in detail (lighting, materials, camera perspective, atmosphere)..."
                className="w-full bg-[#07080B] border border-white/[0.1] focus:border-white/30 rounded-xl p-3.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-sans leading-relaxed resize-y min-h-[110px]"
              />
            </div>

            {/* Curated Prompt Inspiration Presets */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-medium text-neutral-400 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-neutral-500" />
                <span>Curated Brutalist & Cinematic Presets:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_PROMPTS.map((preset) => (
                  <button
                    key={preset.title}
                    type="button"
                    onClick={() => {
                      setPrompt(preset.prompt);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.15] text-neutral-300 hover:text-white transition-all text-left"
                  >
                    {preset.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Canvas Aspect Ratio Selector */}
            <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-neutral-400" />
                <span>Aspect Ratio & Resolution</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {ASPECT_RATIOS.map((ratio) => {
                  const isSelected = selectedRatio.id === ratio.id;
                  return (
                    <button
                      key={ratio.id}
                      type="button"
                      onClick={() => setSelectedRatio(ratio)}
                      className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-0.5 ${
                        isSelected
                          ? 'bg-white/[0.1] border-white/30 text-white shadow-sm'
                          : 'bg-white/[0.02] border-white/[0.06] text-neutral-400 hover:text-neutral-200 hover:border-white/[0.12]'
                      }`}
                    >
                      <span className="text-xs font-semibold">{ratio.label}</span>
                      <span className="text-[10px] font-mono text-neutral-500">{ratio.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error Notification */}
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
              id="generate-visual-btn"
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
                  <RefreshCw className="w-4 h-4 animate-spin text-neutral-400" />
                  <span>Synthesizing Visual Asset...</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4 text-black" />
                  <span>Generate Visual Asset</span>
                </>
              )}
            </motion.button>
          </div>
        </div>

        {/* Right Column: Visual Canvas Display Container */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-[#0D0F16] border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-xl min-h-[460px]">
            {/* Viewport Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-neutral-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                  Render Canvas
                </span>
              </div>
              {generatedImage && imageMeta && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.06] text-neutral-400 border border-white/[0.08]">
                    {imageMeta.width} × {imageMeta.height}
                  </span>
                </div>
              )}
            </div>

            {/* Display Viewport */}
            <div className="w-full flex-1 flex items-center justify-center bg-[#07080B] border border-white/[0.06] rounded-xl overflow-hidden relative min-h-[360px] group">
              {isGenerating && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#07080B]/90 backdrop-blur-sm p-6 text-center">
                  <div className="relative w-12 h-12 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-xl border border-white/20 animate-ping opacity-30" />
                    <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/20 flex items-center justify-center">
                      <RefreshCw className="w-5 h-5 text-white animate-spin" />
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-white">Rendering Visuals</div>
                  <div className="text-xs text-neutral-400 max-w-xs leading-relaxed">
                    Querying open model cluster • Fetching raw 1080×1920 frame...
                  </div>
                </div>
              )}

              {generatedImage ? (
                <div className="w-full h-full flex flex-col items-center justify-center relative">
                  <img
                    id="generated-visual-image"
                    src={generatedImage}
                    alt={imageMeta?.prompt || 'Generated Visual Asset'}
                    className="w-full h-auto max-h-[520px] object-contain rounded-lg transition-transform duration-300 group-hover:scale-[1.01]"
                  />

                  {/* Hover Overlay Action Bar */}
                  <div className="absolute bottom-3 right-3 flex items-center gap-2 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity bg-[#0D0F16]/90 backdrop-blur-md p-1.5 rounded-xl border border-white/15 shadow-xl">
                    <button
                      type="button"
                      onClick={() => setIsFullscreenModalOpen(true)}
                      className="p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.15] text-white transition-colors"
                      title="View Fullscreen"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                    <a
                      href={generatedImage}
                      download={`visual_${Date.now()}.jpg`}
                      className="p-2 rounded-lg bg-white text-black hover:bg-neutral-200 transition-colors"
                      title="Download High-Res JPEG"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 text-center p-8 text-neutral-500">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-neutral-600">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <div className="text-xs font-medium text-neutral-400">No Image Rendered Yet</div>
                  <div className="text-[11px] text-neutral-600 max-w-xs leading-relaxed">
                    Select an aspect ratio, enter a descriptive prompt, and hit Generate to synthesize assets.
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions and Metadata */}
            {generatedImage && imageMeta && (
              <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-neutral-400 truncate max-w-[200px]">
                    {imageMeta.prompt}
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
                    <a
                      href={generatedImage}
                      download={`visual_${Date.now()}.jpg`}
                      className="px-2.5 py-1 text-[11px] rounded-lg bg-white text-black hover:bg-neutral-200 flex items-center gap-1.5 font-medium transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Modal View */}
      <AnimatePresence>
        {isFullscreenModalOpen && generatedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col p-4 sm:p-6"
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white truncate max-w-md">
                  {imageMeta?.prompt || 'Render Preview'}
                </span>
                {imageMeta && (
                  <span className="text-xs font-mono text-neutral-400">
                    ({imageMeta.width} × {imageMeta.height})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={generatedImage}
                  download={`visual_${Date.now()}.jpg`}
                  className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold flex items-center gap-1.5 hover:bg-neutral-200 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download JPEG</span>
                </a>
                <button
                  type="button"
                  onClick={() => setIsFullscreenModalOpen(false)}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
              <img
                src={generatedImage}
                alt="Fullscreen Visual"
                className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl border border-white/10"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
