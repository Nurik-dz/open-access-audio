import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Upload,
  FileAudio,
  Check,
  SlidersHorizontal,
  Sliders,
  Radio,
  RotateCcw,
  Layers,
  Info,
  Activity,
  AudioLines,
  Volume2,
  Key,
  CheckCircle2,
  Scissors,
  X,
  Mic,
  Play,
  ArrowRight,
} from 'lucide-react';
import { AudioPlayer } from './AudioPlayer';
import { MicRecorder } from './MicRecorder';
import { AudioWaveformTrimmer } from './AudioWaveformTrimmer';
import { HistoryItem } from '../types';

interface Props {
  onAddToHistory: (item: Omit<HistoryItem, 'id' | 'timestamp'>) => void;
  initialRefAudio?: string;
  initialText?: string;
}

interface AcousticProfile {
  pitch_hz: number;
  pitch_label: string;
  centroid_hz: number;
  timbre: string;
  donor_voice: string;
  donor_label: string;
  pitch_offset: string;
  rate_offset: string;
  eq_gain_db: number;
  gender: string;
  similarity_score: number;
  detected_text?: string;
  method?: string;
}

const PRESET_REFERENCE_VOICES = [
  {
    name: 'Narrator Male (US)',
    desc: 'Deep warm acoustic timbre with narrative gravitas',
    text: 'Audio reference clip for acoustic synthesis test.',
    voice: 'en-US-AndrewMultilingualNeural',
    tag: 'Deep • Male',
  },
  {
    name: 'Host Female (UK)',
    desc: 'Crisp British broadcast accent with articulate cadence',
    text: 'Welcome to this voice cloning audio demonstration.',
    voice: 'en-GB-SoniaNeural',
    tag: 'Crisp • Female',
  },
  {
    name: 'Presenter Female (US)',
    desc: 'Dynamic pacing, energetic and natural tone',
    text: 'Zero cost open access voice cloning pipeline is active.',
    voice: 'en-US-AvaMultilingualNeural',
    tag: 'Upbeat • Female',
  },
];

export const ClonePanel: React.FC<Props> = ({ onAddToHistory, initialRefAudio, initialText }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [refMode, setRefMode] = useState<'preset' | 'record' | 'upload'>('preset');
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refBase64, setRefBase64] = useState<string | null>(initialRefAudio || null);
  const [refAudioUrl, setRefAudioUrl] = useState<string | null>(initialRefAudio || null);

  // Original uncropped audio backup
  const [rawSourceAudioUrl, setRawSourceAudioUrl] = useState<string | null>(initialRefAudio || null);
  const [rawSourceFile, setRawSourceFile] = useState<File | null>(null);
  const [rawSourceBase64, setRawSourceBase64] = useState<string | null>(initialRefAudio || null);
  const [isTrimmed, setIsTrimmed] = useState<boolean>(false);
  const [trimMeta, setTrimMeta] = useState<{ start: number; end: number; duration: number } | null>(null);
  const [showTrimmer, setShowTrimmer] = useState<boolean>(false);

  const [refText, setRefText] = useState<string>('');
  const [targetText, setTargetText] = useState<string>(
    initialText ||
      'This sentence is being spoken with the acoustic profile and vocal timbre cloned from the reference sample.'
  );

  // Acoustic profile states
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [acousticProfile, setAcousticProfile] = useState<AcousticProfile | null>(null);

  // Fine-tuning parameters
  const [pitchAdjustment, setPitchAdjustment] = useState<number>(0);
  const [timbreAdjustment, setTimbreAdjustment] = useState<number>(0);
  const [hfToken, setHfToken] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('Initializing...');
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  const [lastResultProfile, setLastResultProfile] = useState<AcousticProfile | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const analyzeAudio = async (file: File | null, base64: string | null) => {
    if (!file && !base64) return;
    setIsAnalyzing(true);
    setErrorMsg(null);

    try {
      let res: Response;
      if (file) {
        const formData = new FormData();
        formData.append('audio', file);
        res = await fetch('/api/analyze', {
          method: 'POST',
          body: formData,
        });
      } else {
        res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioBase64: base64 }),
        });
      }

      const data = await res.json();
      if (data.success && data.profile) {
        setAcousticProfile(data.profile);
        if (data.profile.detected_text && !refText.trim()) {
          setRefText(data.profile.detected_text);
        }
      }
    } catch (err: any) {
      console.warn('Audio acoustic analysis warning:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (initialRefAudio) {
      setRefBase64(initialRefAudio);
      setRefAudioUrl(initialRefAudio);
      setRawSourceAudioUrl(initialRefAudio);
      setRawSourceBase64(initialRefAudio);
      setRefMode('upload');
      analyzeAudio(null, initialRefAudio);
    }
  }, [initialRefAudio]);

  const handleRefFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setRefFile(file);
      setRawSourceFile(file);
      setRefBase64(null);
      setRawSourceBase64(null);
      const url = URL.createObjectURL(file);
      setRefAudioUrl(url);
      setRawSourceAudioUrl(url);
      setIsTrimmed(false);
      setTrimMeta(null);
      setShowTrimmer(true);
      setErrorMsg(null);
      analyzeAudio(file, null);
    }
  };

  const handleRecordingComplete = (_blob: Blob, base64: string) => {
    setRefBase64(base64);
    setRawSourceBase64(base64);
    setRefFile(null);
    setRawSourceFile(null);
    setRefAudioUrl(base64);
    setRawSourceAudioUrl(base64);
    setIsTrimmed(false);
    setTrimMeta(null);
    setErrorMsg(null);
    analyzeAudio(null, base64);
  };

  const handleSelectPresetVoice = async (preset: (typeof PRESET_REFERENCE_VOICES)[0]) => {
    setIsLoading(true);
    setLoadingStep('Loading preset acoustic model...');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: preset.text, voice: preset.voice }),
      });
      const data = await res.json();
      const audio = data.audioBase64 || data.audioUrl;
      if (!data.success || !audio) throw new Error(data.error || 'Failed to generate preset audio');

      setRefAudioUrl(audio);
      setRawSourceAudioUrl(audio);
      setRefBase64(audio);
      setRawSourceBase64(audio);
      setRefFile(null);
      setRawSourceFile(null);
      setIsTrimmed(false);
      setTrimMeta(null);
      setRefText(preset.text);
      setRefMode('preset');
      analyzeAudio(null, audio);
    } catch (err: any) {
      setErrorMsg('Failed to generate preset reference: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTrimApplied = (
    trimmedBlob: Blob,
    trimmedUrl: string,
    startTime: number,
    endTime: number,
    clipDuration: number
  ) => {
    const trimmedFile = new File([trimmedBlob], 'trimmed_voice_sample.wav', {
      type: 'audio/wav',
    });
    setRefFile(trimmedFile);
    setRefAudioUrl(trimmedUrl);
    setRefBase64(null);
    setIsTrimmed(true);
    setTrimMeta({ start: startTime, end: endTime, duration: clipDuration });
    analyzeAudio(trimmedFile, null);
  };

  const handleResetOriginal = () => {
    if (!rawSourceAudioUrl) return;
    setRefAudioUrl(rawSourceAudioUrl);
    setRefFile(rawSourceFile);
    setRefBase64(rawSourceBase64);
    setIsTrimmed(false);
    setTrimMeta(null);
    analyzeAudio(rawSourceFile, rawSourceBase64);
  };

  const handleCloneVoice = async () => {
    if (!refFile && !refBase64) {
      setErrorMsg('Please provide a reference audio clip (record, upload, or choose a preset).');
      return;
    }
    if (!targetText.trim()) {
      setErrorMsg('Please enter the target text to speak in the cloned voice.');
      return;
    }

    setIsLoading(true);
    setLoadingStep('Extracting vocal pitch (F0) & acoustic formants...');
    setErrorMsg(null);

    const stepTimer1 = setTimeout(() => {
      setLoadingStep('Synthesizing speech matching speaker timbre...');
    }, 900);

    const stepTimer2 = setTimeout(() => {
      setLoadingStep('Applying acoustic resonance & harmonic filters...');
    }, 1800);

    try {
      let response: Response;

      if (refFile) {
        const formData = new FormData();
        formData.append('ref_audio', refFile);
        formData.append('text', targetText.trim());
        formData.append('ref_text', refText.trim());
        formData.append('pitch_adj', pitchAdjustment.toString());
        formData.append('timbre_adj', timbreAdjustment.toString());
        if (hfToken.trim()) formData.append('hf_token', hfToken.trim());

        response = await fetch('/api/clone', {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await fetch('/api/clone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refAudioBase64: refBase64,
            text: targetText.trim(),
            ref_text: refText.trim(),
            pitch_adj: pitchAdjustment,
            timbre_adj: timbreAdjustment,
            hf_token: hfToken.trim(),
          }),
        });
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Voice cloning failed.');
      }

      setGeneratedAudio(data.audioUrl);
      if (data.profile) {
        setLastResultProfile(data.profile);
        setAcousticProfile(data.profile);
      }

      onAddToHistory({
        type: 'clone',
        title: `Cloned Voice (${data.profile?.pitch_label || 'Acoustic Model'}): ${targetText.slice(0, 36)}...`,
        text: targetText.trim(),
        audioUrl: data.audioUrl,
        voiceOrModel: data.profile?.method || 'Voice Lab Acoustic Model',
      });
    } catch (err: any) {
      console.error('Voice clone error:', err);
      setErrorMsg(err.message || 'Voice cloning encountered an error. Please try again.');
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setIsLoading(false);
    }
  };

  return (
    <div id="eleven-clone-studio" className="w-full grid grid-cols-12 gap-5">
      {/* Main Clone Setup Area */}
      <div className="col-span-12 lg:col-span-8 flex flex-col gap-5">
        <div
          id="clone-main-card"
          className="relative bg-[#0C0E14] border border-white/[0.08] rounded-2xl p-5 sm:p-6 flex flex-col gap-5 shadow-2xl backdrop-blur-xl"
        >
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.07]">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-tight">Voice Lab & Cloning</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.08] text-neutral-300 border border-white/[0.1] font-medium">
                  Instant F0 Acoustic Match
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Clone vocal pitch, resonance, and timbre from any speech sample or mic recording.
              </p>
            </div>

            {/* Source Switcher */}
            <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06]">
              <button
                type="button"
                onClick={() => setRefMode('preset')}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  refMode === 'preset'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Presets
              </button>
              <button
                type="button"
                onClick={() => setRefMode('record')}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  refMode === 'record'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Record
              </button>
              <button
                type="button"
                onClick={() => setRefMode('upload')}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  refMode === 'upload'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Upload
              </button>
            </div>
          </div>

          {/* Reference Audio Source */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-semibold text-white">
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white font-mono">
                  1
                </span>
                <span>Reference Voice Sample</span>
              </span>
              {refAudioUrl && (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
                  <Check className="w-3 h-3" /> Voice Loaded
                </span>
              )}
            </div>

            {refMode === 'upload' && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-white/[0.12] hover:border-white/[0.3] bg-white/[0.02] rounded-xl p-5 flex items-center justify-between cursor-pointer transition-colors group"
              >
                <input
                  ref={fileInputRef}
                  id="clone-file-input"
                  type="file"
                  accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac"
                  onChange={handleRefFileChange}
                  className="hidden"
                />
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-neutral-400 group-hover:text-white">
                    <FileAudio className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white group-hover:text-neutral-200">
                      {refFile ? refFile.name : 'Upload reference audio'}
                    </div>
                    <div className="text-[11px] text-neutral-500 font-mono mt-0.5">
                      {refFile ? `${(refFile.size / 1024).toFixed(1)} KB` : 'WAV, MP3, M4A, OGG or FLAC'}
                    </div>
                  </div>
                </div>
                <span className="text-xs font-medium text-neutral-300 bg-white/[0.06] hover:bg-white/[0.12] px-3 py-1.5 rounded-lg border border-white/[0.08]">
                  Browse File
                </span>
              </div>
            )}

            {refMode === 'record' && (
              <MicRecorder
                onRecordingComplete={handleRecordingComplete}
                onCancel={() => {
                  setRefBase64(null);
                  setRefAudioUrl(null);
                  setAcousticProfile(null);
                }}
                onSwitchToUpload={() => setRefMode('upload')}
                maxSeconds={30}
              />
            )}

            {refMode === 'preset' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {PRESET_REFERENCE_VOICES.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectPresetVoice(p)}
                    className={`p-3 rounded-xl text-left transition-colors border flex flex-col gap-1.5 ${
                      refText === p.text && refAudioUrl
                        ? 'bg-white/[0.08] border-white/[0.3] text-white shadow-sm'
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.15] text-neutral-300'
                    }`}
                  >
                    <div className="text-xs font-semibold text-white flex items-center justify-between">
                      <span>{p.name}</span>
                      {refText === p.text && refAudioUrl && (
                        <Check className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-400 line-clamp-2 leading-relaxed">
                      {p.desc}
                    </div>
                    <div className="text-[10px] font-mono text-neutral-500 pt-1 border-t border-white/[0.04]">
                      {p.tag}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Audio Preview & Trimmer */}
            {refAudioUrl && (
              <div className="flex flex-col gap-2.5">
                <div className="p-3 bg-black/40 border border-white/[0.07] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-[10px] font-mono text-neutral-500 uppercase shrink-0">Source Clip:</span>
                    <audio src={refAudioUrl} controls className="w-full max-w-md h-7" />
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {isTrimmed && trimMeta && (
                      <span className="text-[10px] font-mono px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Trimmed ({trimMeta.duration.toFixed(1)}s)</span>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowTrimmer(!showTrimmer)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors border ${
                        showTrimmer
                          ? 'bg-white text-black font-semibold border-white'
                          : 'bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 border-white/[0.08]'
                      }`}
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      <span>{showTrimmer ? 'Close Trimmer' : 'Waveform Trimmer'}</span>
                    </button>
                  </div>
                </div>

                {showTrimmer && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    <AudioWaveformTrimmer
                      audioUrl={rawSourceAudioUrl || refAudioUrl}
                      onTrimApplied={handleTrimApplied}
                      onResetOriginal={handleResetOriginal}
                      isOriginal={!isTrimmed}
                    />
                  </motion.div>
                )}

                {/* Acoustic Profile Metrics */}
                <div className="p-3.5 bg-white/[0.03] border border-white/[0.08] rounded-xl flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-neutral-300" />
                      <span className="text-xs font-semibold text-white">Detected Voice Acoustics</span>
                    </div>
                    {isAnalyzing ? (
                      <span className="text-[10px] font-mono text-neutral-400 animate-pulse">Analyzing F0 & Formants...</span>
                    ) : acousticProfile ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {acousticProfile.similarity_score}% Acoustic Match
                      </span>
                    ) : null}
                  </div>

                  {acousticProfile && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <div className="bg-black/40 border border-white/[0.04] p-2 rounded-lg">
                        <div className="text-[10px] text-neutral-500 font-mono">Fundamental Pitch (F0)</div>
                        <div className="text-xs font-semibold text-neutral-200 mt-0.5">{acousticProfile.pitch_label}</div>
                      </div>
                      <div className="bg-black/40 border border-white/[0.04] p-2 rounded-lg">
                        <div className="text-[10px] text-neutral-500 font-mono">Vocal Timbre</div>
                        <div className="text-xs font-semibold text-neutral-200 mt-0.5">{acousticProfile.timbre}</div>
                      </div>
                      <div className="bg-black/40 border border-white/[0.04] p-2 rounded-lg">
                        <div className="text-[10px] text-neutral-500 font-mono">Harmonic Resonance</div>
                        <div className="text-xs font-semibold text-neutral-200 mt-0.5">{Math.round(acousticProfile.centroid_hz)} Hz centroid</div>
                      </div>
                      <div className="bg-black/40 border border-white/[0.04] p-2 rounded-lg">
                        <div className="text-[10px] text-neutral-500 font-mono">Base Neural Donor</div>
                        <div className="text-xs font-semibold text-neutral-200 mt-0.5">{acousticProfile.donor_label}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Reference Audio Transcript */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider flex items-center justify-between">
              <span>Reference Transcript (Optional)</span>
              <span className="text-[10px] text-neutral-500 lowercase">improves phoneme alignment</span>
            </label>
            <input
              id="clone-ref-text"
              type="text"
              value={refText}
              onChange={(e) => setRefText(e.target.value)}
              placeholder="Spoken words in the reference audio sample..."
              className="w-full bg-[#08090C] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-white/[0.25] font-sans"
            />
          </div>

          {/* Target Script to Speak */}
          <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-3">
            <div className="flex justify-between items-center text-xs font-semibold text-white">
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white font-mono">
                  2
                </span>
                <span>Target Script to Speak in Cloned Voice</span>
              </span>
              <span className="text-neutral-500 font-normal font-mono text-[11px]">{targetText.length} chars</span>
            </div>
            <textarea
              id="clone-target-text"
              rows={4}
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              placeholder="Enter what you want the cloned voice to articulate..."
              className="w-full bg-[#08090C] border border-white/[0.08] focus:border-white/[0.25] rounded-xl p-4 text-sm text-neutral-100 placeholder-neutral-600 leading-relaxed resize-none focus:outline-none transition-all font-sans"
            />
          </div>

          {/* Fine Tuning Drawer Toggle */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs font-mono text-neutral-400 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{showAdvanced ? 'Hide Fine-Tuning Controls' : 'Show Vocal Fine-Tuning (Pitch & Timbre Controls)'}</span>
            </button>

            {showAdvanced && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 p-4 bg-black/40 border border-white/[0.06] rounded-xl flex flex-col gap-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Pitch Shift Slider */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-300 font-medium">Pitch Offset Adjustment</span>
                      <span className="font-mono text-neutral-300">
                        {pitchAdjustment > 0 ? `+${pitchAdjustment} Hz` : `${pitchAdjustment} Hz`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-30}
                      max={30}
                      step={2}
                      value={pitchAdjustment}
                      onChange={(e) => setPitchAdjustment(parseInt(e.target.value, 10))}
                      className="w-full h-1 bg-white/[0.1] rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
                      <span>Deeper (-30Hz)</span>
                      <span>Auto Match (0Hz)</span>
                      <span>Higher (+30Hz)</span>
                    </div>
                  </div>

                  {/* Timbre Warmth */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-300 font-medium">Timbre Warmth / Clarity</span>
                      <span className="font-mono text-neutral-300">
                        {timbreAdjustment > 0 ? `+${timbreAdjustment.toFixed(1)} dB` : `${timbreAdjustment.toFixed(1)} dB`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-3.0}
                      max={3.0}
                      step={0.5}
                      value={timbreAdjustment}
                      onChange={(e) => setTimbreAdjustment(parseFloat(e.target.value))}
                      className="w-full h-1 bg-white/[0.1] rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
                      <span>Warm / Resonant</span>
                      <span>Natural</span>
                      <span>Crisp / Bright</span>
                    </div>
                  </div>
                </div>

                {/* Optional Token */}
                <div className="flex flex-col gap-1.5 pt-2 border-t border-white/[0.04]">
                  <label className="text-[11px] font-mono text-neutral-400 flex items-center gap-1.5">
                    <Key className="w-3 h-3 text-neutral-400" />
                    <span>Optional Hugging Face Token (for private zero-shot GPU spaces)</span>
                  </label>
                  <input
                    type="password"
                    value={hfToken}
                    onChange={(e) => setHfToken(e.target.value)}
                    placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxx (Optional)"
                    className="w-full bg-[#08090C] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none font-mono"
                  />
                </div>
              </motion.div>
            )}
          </div>

          {/* Error Notice */}
          {errorMsg && (
            <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-200 font-mono flex items-center justify-between gap-2">
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Clone Action Button */}
          <div>
            <motion.button
              id="clone-synthesize-btn"
              type="button"
              onClick={handleCloneVoice}
              disabled={isLoading || (!refFile && !refBase64) || !targetText.trim()}
              whileHover={{ scale: isLoading ? 1 : 1.01 }}
              whileTap={{ scale: isLoading ? 1 : 0.99 }}
              className={`w-full py-3 px-5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg ${
                isLoading || (!refFile && !refBase64) || !targetText.trim()
                  ? 'bg-white/10 text-neutral-500 cursor-not-allowed border border-white/[0.05]'
                  : 'bg-white text-black hover:bg-neutral-200 active:bg-neutral-300 shadow-white/10'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="flex items-center gap-1 h-3.5">
                    <span className="w-1 h-3 bg-black rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1 h-3 bg-black rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1 h-3 bg-black rounded-full animate-bounce" />
                  </div>
                  <span>{loadingStep}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Cloned Speech</span>
                </>
              )}
            </motion.button>
          </div>
        </div>

        {/* Cloned Audio Player Output */}
        {generatedAudio && (
          <motion.div
            id="clone-output-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-2"
          >
            <AudioPlayer
              src={generatedAudio}
              title={targetText.slice(0, 50) + (targetText.length > 50 ? '...' : '')}
              subtitle={`Cloned Profile: ${lastResultProfile?.pitch_label || 'Acoustic Model'} (${lastResultProfile?.similarity_score || 95}% Match)`}
              onDownloadFilename="cloned_voice_output.mp3"
              autoPlay={true}
            />
          </motion.div>
        )}
      </div>

      {/* Side Column: Voice Lab Architecture & Guide */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-5">
        <div
          id="clone-config-card"
          className="bg-[#0C0E14] border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-4 shadow-xl backdrop-blur-xl"
        >
          <div className="text-xs font-semibold text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-400" />
              <span>Voice Lab Architecture</span>
            </span>
          </div>

          <div className="space-y-2.5">
            <div className="p-3 bg-white/[0.03] border border-white/[0.07] rounded-xl flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Instant F0 Acoustic Matcher</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-medium">
                  Zero Latency
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed mt-0.5">
                Extracts fundamental frequency (F0), formant energy, and spectral centroid to map the donor voice to the speaker's vocal acoustics.
              </p>
            </div>

            <div className="p-3 bg-white/[0.03] border border-white/[0.07] rounded-xl flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Neural Diffusion Spaces</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-neutral-400">
                  GPU Acceleration
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed mt-0.5">
                Supports F5-TTS zero-shot remote diffusion spaces with optional token authentication.
              </p>
            </div>
          </div>
        </div>

        {/* Cloning Guide */}
        <div className="bg-[#0C0E14] border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-3 shadow-xl backdrop-blur-xl">
          <div className="text-xs font-semibold text-white flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-neutral-400" />
            <span>Optimal Voice Sample Guidelines</span>
          </div>

          <ul className="space-y-2 text-xs text-neutral-400 list-disc list-inside leading-relaxed">
            <li>Provide 3 to 15 seconds of clean speaking audio without loud music.</li>
            <li>Supported formats include WAV, MP3, M4A, OGG, WebM, and FLAC.</li>
            <li>Use the integrated Waveform Trimmer to cut out pauses or background noise.</li>
            <li>Adjust Timbre Warmth or Pitch Shift sliders for subtle vocal refinement.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
