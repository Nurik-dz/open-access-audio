import React, { useState } from 'react';
import {
  Sparkles,
  Volume2,
  Wand2,
  Sliders,
  KeyRound,
  Zap,
  CloudRain,
  Compass,
  Flame,
  Wind,
  Music,
  AlertCircle,
  X,
  CheckCircle2,
  Activity,
} from 'lucide-react';
import { HistoryItem } from '../types';
import { AudioPlayer } from './AudioPlayer';
import { FallbackNotice } from './FallbackNotice';

interface Props {
  onAddToHistory: (item: Omit<HistoryItem, 'id' | 'timestamp'>) => void;
}

const SFX_PRESETS = [
  {
    icon: Flame,
    label: 'Heavy Wooden Door Knock',
    mode: 'sfx',
    prompt: 'heavy wooden door knock echo reverb',
    duration: 4,
    guidance: 3.5,
    tag: 'Foley Action',
  },
  {
    icon: Zap,
    label: 'Laser Blaster Shot',
    mode: 'sfx',
    prompt: 'futuristic plasma laser beam shot cinematic pulse',
    duration: 3,
    guidance: 4.0,
    tag: 'Sci-Fi Action',
  },
  {
    icon: Music,
    label: 'Celestial Crystal Chime',
    mode: 'sfx',
    prompt: 'ethereal sparkling crystal wind chime harmonic resonance',
    duration: 5,
    guidance: 3.5,
    tag: 'Magic & FX',
  },
  {
    icon: CloudRain,
    label: 'Heavy Rain in Ancient Forest',
    mode: 'ambient',
    prompt: 'heavy rain pouring on lush forest leaves distant gentle thunder wind',
    duration: 10,
    guidance: 3.5,
    tag: 'Environment',
  },
  {
    icon: Wind,
    label: 'Deep Arctic Windstorm',
    mode: 'ambient',
    prompt: 'cold howling blizzard wind blowing across glacial mountains desolate',
    duration: 10,
    guidance: 3.5,
    tag: 'Atmosphere',
  },
  {
    icon: Compass,
    label: 'Submerged Ocean Trench',
    mode: 'ambient',
    prompt: 'deep underwater hydrothermal vent rumble low submarine hum sonar echo',
    duration: 10,
    guidance: 3.5,
    tag: 'Underwater',
  },
];

export const SfxPanel: React.FC<Props> = ({ onAddToHistory }) => {
  const [mode, setMode] = useState<'sfx' | 'ambient'>('sfx');
  const [prompt, setPrompt] = useState<string>(
    'heavy wooden door knock echoing in an old quiet hallway'
  );
  const [hfToken, setHfToken] = useState<string>('');
  const [showTokenInput, setShowTokenInput] = useState<boolean>(false);

  // SFX parameters
  const [duration, setDuration] = useState<number>(5.0);
  const [guidanceScale, setGuidanceScale] = useState<number>(3.5);

  // Ambient parameters
  const [secondsTotal, setSecondsTotal] = useState<number>(10.0);
  const [steps, setSteps] = useState<number>(100);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('Generating audio...');
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [genInfo, setGenInfo] = useState<{ method?: string; remoteError?: string } | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setErrorMsg('Please enter a sound description or prompt.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setGenInfo(null);
    const startTime = performance.now();

    const usingModel = hfToken.trim().length > 0;
    if (mode === 'sfx') {
      setLoadingStep(usingModel ? 'Generating sound effect with AudioLDM-2...' : 'Synthesizing sound effect...');
    } else {
      setLoadingStep(usingModel ? 'Generating soundscape with Stable Audio...' : 'Synthesizing soundscape...');
    }

    try {
      const endpoint = mode === 'sfx' ? '/api/sfx' : '/api/ambient';
      const payload =
        mode === 'sfx'
          ? {
              prompt: prompt.trim(),
              hf_token: hfToken.trim() || undefined,
              duration,
              guidance_scale: guidanceScale,
            }
          : {
              prompt: prompt.trim(),
              hf_token: hfToken.trim() || undefined,
              seconds_total: secondsTotal,
              steps,
            };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      const audioUrl = data.audioBase64 || data.audioUrl;

      if (!response.ok || !data.success || !audioUrl) {
        throw new Error(data.error || 'Sound synthesis failed.');
      }

      const elapsed = Math.round(performance.now() - startTime);
      setLatencyMs(elapsed);
      setGeneratedAudio(audioUrl);
      setGenInfo({ method: data.method, remoteError: data.remoteError });

      const modelLabel =
        data.method === 'procedural'
          ? 'Procedural synthesizer (offline)'
          : mode === 'sfx'
            ? 'AudioLDM2 (Foley SFX)'
            : 'Stable Audio Open (Ambient)';

      onAddToHistory({
        type: mode === 'sfx' ? 'sfx' : 'ambient',
        title: prompt.slice(0, 42) + (prompt.length > 42 ? '...' : ''),
        text: prompt.trim(),
        audioUrl: audioUrl,
        voiceOrModel: modelLabel,
        durationSec: Math.round(mode === 'sfx' ? duration : secondsTotal),
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to generate sound.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPreset = (preset: (typeof SFX_PRESETS)[0]) => {
    setMode(preset.mode as 'sfx' | 'ambient');
    setPrompt(preset.prompt);
    if (preset.mode === 'sfx') {
      setDuration(preset.duration);
      setGuidanceScale(preset.guidance);
    } else {
      setSecondsTotal(preset.duration);
    }
    setErrorMsg(null);
  };

  return (
    <div id="sfx-panel-root" className="w-full space-y-6">
      {/* Mode Selector & Quick Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 backdrop-blur-sm">
        <div className="flex items-center gap-2 p-1 bg-neutral-950 rounded-lg border border-neutral-800">
          <button
            id="sfx-mode-tab-sfx"
            type="button"
            onClick={() => {
              setMode('sfx');
              setErrorMsg(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              mode === 'sfx'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Foley & Sound Effects</span>
          </button>
          <button
            id="sfx-mode-tab-ambient"
            type="button"
            onClick={() => {
              setMode('ambient');
              setErrorMsg(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              mode === 'ambient'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <CloudRain className="w-4 h-4 text-cyan-400" />
            <span>Ambient Environments</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="sfx-token-toggle"
            type="button"
            onClick={() => setShowTokenInput(!showTokenInput)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
              hfToken
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-neutral-300'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{hfToken ? 'HF Token Active' : 'HF Token (Optional)'}</span>
          </button>
        </div>
      </div>

      {/* Hugging Face Token Input Drawer */}
      {showTokenInput && (
        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-medium text-neutral-300">Hugging Face Access Token</span>
            <span>Allows unlimited quota on remote GPU spaces</span>
          </div>
          <input
            id="sfx-hf-token-input"
            type="password"
            placeholder="hf_..."
            value={hfToken}
            onChange={(e) => setHfToken(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
          />
        </div>
      )}

      {/* Main Sound Synthesis Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Prompt & Presets */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative rounded-2xl bg-neutral-900/90 border border-neutral-800/80 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Sound Description & Acoustic Prompt</span>
              </label>
              <span className="text-xs text-neutral-500">
                {prompt.length} characters
              </span>
            </div>

            <textarea
              id="sfx-prompt-textarea"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                mode === 'sfx'
                  ? 'e.g. heavy wooden door slam with low rumble reverb...'
                  : 'e.g. calming forest rainfall with gentle wind and distant thunder...'
              }
              className="w-full p-3.5 rounded-xl bg-neutral-950/80 border border-neutral-800 text-neutral-100 placeholder-neutral-600 text-sm leading-relaxed focus:outline-none focus:border-neutral-700 resize-none transition-all"
            />

            {/* Curated Presets Bar */}
            <div className="space-y-2 pt-2 border-t border-neutral-800/60">
              <div className="text-xs font-medium text-neutral-400">
                Acoustic Foley & Environmental Presets
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SFX_PRESETS.map((preset, idx) => {
                  const Icon = preset.icon;
                  const isCurrent = prompt === preset.prompt;
                  return (
                    <button
                      key={idx}
                      id={`sfx-preset-${idx}`}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className={`flex items-center gap-3 p-2.5 rounded-xl text-left border transition-all ${
                        isCurrent
                          ? 'border-neutral-600 bg-neutral-800/90 text-white'
                          : 'border-neutral-800/80 bg-neutral-950/60 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900/60'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center flex-shrink-0 text-neutral-300">
                        <Icon className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate text-neutral-200">
                          {preset.label}
                        </div>
                        <div className="text-[10px] text-neutral-500 truncate">
                          {preset.tag} • {preset.duration}s
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Parameters & Controls */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-neutral-900/90 border border-neutral-800/80 p-5 shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
                <Sliders className="w-4 h-4 text-neutral-400" />
                <span>Synthesis Controls</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                {hfToken.trim() ? (mode === 'sfx' ? 'AudioLDM-2' : 'Stable Audio') : 'Built-in synth'}
              </span>
            </div>

            {mode === 'sfx' ? (
              <>
                {/* Duration Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-300">Burst Duration</span>
                    <span className="font-mono text-neutral-400">{duration}s</span>
                  </div>
                  <input
                    id="sfx-duration-slider"
                    type="range"
                    min={1}
                    max={10}
                    step={0.5}
                    value={duration}
                    onChange={(e) => setDuration(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-600">
                    <span>1s (Transient)</span>
                    <span>10s (Extended)</span>
                  </div>
                </div>

                {/* Guidance Scale */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-300">Prompt Guidance Scale</span>
                    <span className="font-mono text-neutral-400">{guidanceScale.toFixed(1)}</span>
                  </div>
                  <input
                    id="sfx-guidance-slider"
                    type="range"
                    min={1.0}
                    max={7.0}
                    step={0.5}
                    value={guidanceScale}
                    onChange={(e) => setGuidanceScale(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-600">
                    <span>1.0 (Creative)</span>
                    <span>7.0 (Strict)</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Ambient Duration Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-300">Soundscape Duration</span>
                    <span className="font-mono text-neutral-400">{secondsTotal}s</span>
                  </div>
                  <input
                    id="ambient-seconds-slider"
                    type="range"
                    min={5}
                    max={20}
                    step={1}
                    value={secondsTotal}
                    onChange={(e) => setSecondsTotal(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-600">
                    <span>5s</span>
                    <span>20s</span>
                  </div>
                </div>

                {/* Diffusion Steps */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-300">Diffusion Fidelity Steps</span>
                    <span className="font-mono text-neutral-400">{steps} steps</span>
                  </div>
                  <input
                    id="ambient-steps-slider"
                    type="range"
                    min={25}
                    max={150}
                    step={25}
                    value={steps}
                    onChange={(e) => setSteps(parseInt(e.target.value, 10))}
                    className="w-full accent-cyan-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-600">
                    <span>25 (Fast)</span>
                    <span>150 (High Detail)</span>
                  </div>
                </div>
              </>
            )}

            {/* Error Display */}
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
            <button
              id="sfx-generate-button"
              type="button"
              disabled={isLoading || !prompt.trim()}
              onClick={handleGenerate}
              className={`w-full py-3.5 px-4 rounded-xl font-medium text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg ${
                isLoading
                  ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed'
                  : 'bg-white text-neutral-950 hover:bg-neutral-200 active:scale-[0.99]'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                  <span className="truncate">{loadingStep}</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  <span>Synthesize Sound</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Generated Result Player */}
      {generatedAudio && (
        <div id="sfx-result-container" className="space-y-3">
          <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-neutral-200 font-medium">Generated Sound Output</span>
            </div>
            {latencyMs && (
              <span className="text-neutral-500">Rendered in {latencyMs}ms</span>
            )}
          </div>
          <AudioPlayer
            src={generatedAudio}
            audioUrl={generatedAudio}
            title={prompt}
            subtitle={mode === 'sfx' ? 'Foley & Sound Effects' : 'Ambient Soundscape'}
            formatBadge={mode === 'sfx' ? '24kHz WAV • Foley' : '24kHz WAV • Ambient'}
            onDownloadFilename={`${mode === 'sfx' ? 'sfx' : 'ambient'}_${Date.now()}.wav`}
            autoPlay={true}
          />
          {genInfo?.method === 'procedural' && (
            <FallbackNotice title="Built-in procedural synthesizer" detail={genInfo.remoteError}>
              This sound came from the offline keyword-driven synthesizer, not a neural model, so only a few prompt
              keywords (knock, punch, footsteps, laser, rain, ...) change the result. Add a Hugging Face token to use{' '}
              {mode === 'sfx' ? 'AudioLDM2' : 'Stable Audio Open'}.
            </FallbackNotice>
          )}
        </div>
      )}
    </div>
  );
};
