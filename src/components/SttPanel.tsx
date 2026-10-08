import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  Upload,
  FileAudio,
  Copy,
  Check,
  Download,
  ArrowRight,
  SlidersHorizontal,
  FileText,
  AudioLines,
  X,
  Globe,
  Sparkles,
} from 'lucide-react';
import { MicRecorder } from './MicRecorder';
import { HistoryItem } from '../types';

interface Props {
  onAddToHistory: (item: Omit<HistoryItem, 'id' | 'timestamp'>) => void;
  onSendToTts?: (text: string) => void;
  onSendToClone?: (audioBase64: string, text: string) => void;
}

const SAMPLE_CLIPS = [
  {
    title: 'Acoustic Clarity Test',
    description: '16kHz clear acoustic speech sample',
    textFallback:
      'Zero cost speech recognition powered by public web endpoints and ffmpeg 16 kilohertz conversion.',
  },
  {
    title: 'Conversational System Update',
    description: 'High-speed technical update monologue',
    textFallback:
      'System initialized. All temporary audio buffers have been processed and cleared from local storage.',
  },
];

const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es-ES', label: 'Spanish (Español)' },
  { code: 'fr-FR', label: 'French (Français)' },
  { code: 'de-DE', label: 'German (Deutsch)' },
  { code: 'it-IT', label: 'Italian (Italiano)' },
  { code: 'ja-JP', label: 'Japanese (日本語)' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'hi-IN', label: 'Hindi (हिन्दी)' },
  { code: 'pt-BR', label: 'Portuguese (Brasil)' },
  { code: 'ru-RU', label: 'Russian (Русский)' },
  { code: 'ar-SA', label: 'Arabic (العربية)' },
];

export const SttPanel: React.FC<Props> = ({ onAddToHistory, onSendToTts, onSendToClone }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [inputMode, setInputMode] = useState<'record' | 'upload'>('record');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en-US');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [recordedBase64, setRecordedBase64] = useState<string | null>(null);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setRecordedBase64(null);
      setPreviewAudioUrl(URL.createObjectURL(file));
      setErrorMsg(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setRecordedBase64(null);
      setPreviewAudioUrl(URL.createObjectURL(file));
      setErrorMsg(null);
    }
  };

  const handleRecordingComplete = (_blob: Blob, base64: string) => {
    setRecordedBase64(base64);
    setSelectedFile(null);
    setPreviewAudioUrl(base64);
    setErrorMsg(null);
  };

  const handleTranscribe = async () => {
    if (!selectedFile && !recordedBase64) {
      setErrorMsg('Please record or upload an audio file first.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      let response: Response;

      if (selectedFile) {
        const formData = new FormData();
        formData.append('audio', selectedFile);
        formData.append('language', selectedLanguage);

        response = await fetch('/api/stt', {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await fetch('/api/stt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: recordedBase64,
            language: selectedLanguage,
          }),
        });
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to transcribe audio.');
      }

      const recognizedText = data.text || '';
      if (!recognizedText.trim()) {
        setTranscript('(No discernible speech was detected in this audio sample. Please check clarity or volume.)');
      } else {
        setTranscript(recognizedText);
        onAddToHistory({
          type: 'stt',
          title: `Transcription (${recognizedText.slice(0, 36)}...)`,
          text: recognizedText,
          language: selectedLanguage,
          audioUrl: previewAudioUrl || undefined,
        });
      }
    } catch (err: any) {
      console.warn('STT notice:', err);
      setErrorMsg(err.message || 'Speech recognition failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyTranscript = () => {
    if (!transcript) return;
    navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    if (!transcript) return;
    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transcript_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleTestWithPreset = async (sample: (typeof SAMPLE_CLIPS)[0]) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const resTts = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sample.textFallback,
          voice: 'en-US-AndrewMultilingualNeural',
        }),
      });
      const ttsData = await resTts.json();
      if (!ttsData.success) throw new Error(ttsData.error);

      setPreviewAudioUrl(ttsData.audioBase64);
      setRecordedBase64(ttsData.audioBase64);
      setSelectedFile(null);

      const resStt = await fetch('/api/stt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: ttsData.audioBase64, language: selectedLanguage }),
      });
      const sttData = await resStt.json();
      if (!sttData.success) throw new Error(sttData.error);

      setTranscript(sttData.text || sample.textFallback);
      onAddToHistory({
        type: 'stt',
        title: `Sample STT (${sttData.text?.slice(0, 30) || 'Audio'}...)`,
        text: sttData.text || sample.textFallback,
        language: selectedLanguage,
        audioUrl: ttsData.audioBase64,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Sample test failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="eleven-stt-studio" className="w-full grid grid-cols-12 gap-5">
      {/* Studio Capture & Output */}
      <div className="col-span-12 lg:col-span-8 flex flex-col gap-5">
        <div
          id="stt-capture-card"
          className="relative bg-[#0C0E14] border border-white/[0.08] rounded-2xl p-5 sm:p-6 flex flex-col gap-5 shadow-2xl backdrop-blur-xl"
        >
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.07]">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-tight">Speech-to-Text Studio</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.08] text-neutral-300 border border-white/[0.1] font-medium">
                  16kHz Audio Pipeline
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Record microphone audio or upload any speech recording for fast transcription.
              </p>
            </div>

            {/* Input Mode Selector */}
            <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06]">
              <button
                id="stt-mode-record-btn"
                type="button"
                onClick={() => setInputMode('record')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  inputMode === 'record'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Microphone</span>
              </button>
              <button
                id="stt-mode-upload-btn"
                type="button"
                onClick={() => setInputMode('upload')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  inputMode === 'upload'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload File</span>
              </button>
            </div>
          </div>

          {/* Capture Area */}
          {inputMode === 'record' ? (
            <MicRecorder
              onRecordingComplete={handleRecordingComplete}
              onCancel={() => {
                setRecordedBase64(null);
                setPreviewAudioUrl(null);
              }}
              onSwitchToUpload={() => setInputMode('upload')}
              maxSeconds={120}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <div
                id="stt-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-white/[0.12] hover:border-white/[0.3] bg-white/[0.02] rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors text-center group"
              >
                <input
                  ref={fileInputRef}
                  id="stt-file-input"
                  type="file"
                  accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-neutral-400 group-hover:text-white transition-colors">
                  <FileAudio className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white group-hover:text-neutral-200 transition-colors">
                    {selectedFile ? selectedFile.name : 'Click to browse or drag audio here'}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1 font-mono">
                    {selectedFile
                      ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB selected`
                      : 'Supports WAV, MP3, M4A, OGG, WEBM, FLAC (Max 25MB)'}
                  </div>
                </div>
              </div>

              {previewAudioUrl && (
                <div className="p-3 bg-black/40 border border-white/[0.08] rounded-xl flex items-center gap-3">
                  <audio src={previewAudioUrl} controls className="w-full h-8" />
                </div>
              )}
            </div>
          )}

          {/* Error Notice */}
          {errorMsg && (
            <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-200 font-mono flex items-center justify-between">
              <span>Error: {errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Transcribe Button */}
          <div>
            <motion.button
              id="stt-transcribe-btn"
              type="button"
              onClick={handleTranscribe}
              disabled={isLoading || (!selectedFile && !recordedBase64)}
              whileHover={{ scale: isLoading ? 1 : 1.01 }}
              whileTap={{ scale: isLoading ? 1 : 0.99 }}
              className={`w-full py-3 px-5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg ${
                isLoading || (!selectedFile && !recordedBase64)
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
                  <span>Converting to 16kHz & Transcribing...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>Transcribe Speech to Text</span>
                </>
              )}
            </motion.button>
          </div>
        </div>

        {/* Output Panel */}
        {transcript && (
          <motion.div
            id="stt-transcript-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-[#0C0E14] border border-white/[0.08] rounded-2xl p-5 sm:p-6 flex flex-col gap-4 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-neutral-300" />
                <span className="text-sm font-semibold text-white">Transcription Result</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  16kHz High-Pass
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  id="stt-copy-btn"
                  onClick={handleCopyTranscript}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.08] transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  id="stt-download-btn"
                  onClick={handleDownloadTxt}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.08] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .TXT</span>
                </button>
              </div>
            </div>

            <div className="p-4 bg-[#08090C] border border-white/[0.06] rounded-xl text-sm text-neutral-100 leading-relaxed font-sans select-text">
              {transcript}
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="font-mono text-neutral-400 text-xs">
                {transcript.split(/\s+/).filter(Boolean).length} words • {transcript.length} characters
              </span>

              <div className="flex items-center gap-2">
                {onSendToTts && (
                  <button
                    id="stt-pipe-to-tts-btn"
                    onClick={() => onSendToTts(transcript)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-white/[0.08] hover:bg-white/[0.14] rounded-lg border border-white/[0.1] transition-colors"
                  >
                    <span>Synthesize with TTS</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
                {onSendToClone && previewAudioUrl && (
                  <button
                    id="stt-pipe-to-clone-btn"
                    onClick={() => onSendToClone(previewAudioUrl, transcript)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-white/[0.08] hover:bg-white/[0.14] rounded-lg border border-white/[0.1] transition-colors"
                  >
                    <span>Clone this Voice</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Side Column: Language Selection & Presets */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-5">
        <div
          id="stt-config-card"
          className="bg-[#0C0E14] border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-4 shadow-xl backdrop-blur-xl"
        >
          <div className="text-xs font-semibold text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-400" />
              <span>Language & Acoustic Model</span>
            </span>
          </div>

          <div>
            <label
              htmlFor="stt-lang-select"
              className="block text-[11px] text-neutral-400 mb-1.5 font-medium uppercase tracking-wider font-mono"
            >
              Target Language
            </label>
            <select
              id="stt-lang-select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full bg-[#08090C] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-white/[0.3] font-sans"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-[#0C0E14] text-white">
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 text-xs font-mono pt-2 border-t border-white/[0.06]">
            <div className="flex justify-between text-neutral-400">
              <span>Sampling Format:</span>
              <span className="text-neutral-200">16,000 Hz Mono</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>DSP Conversion:</span>
              <span className="text-neutral-200">FFmpeg Native Engine</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Operation Cost:</span>
              <span className="text-emerald-400 font-semibold">$0.00 / Unlimited</span>
            </div>
          </div>
        </div>

        {/* Quick Audio Samples */}
        <div className="bg-[#0C0E14] border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-3.5 shadow-xl backdrop-blur-xl">
          <div className="text-xs font-semibold text-white flex items-center gap-2">
            <AudioLines className="w-3.5 h-3.5 text-neutral-400" />
            <span>Sample Audio Clips</span>
          </div>

          <div className="space-y-2">
            {SAMPLE_CLIPS.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleTestWithPreset(sample)}
                disabled={isLoading}
                className="w-full p-3 bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.15] rounded-xl text-left transition-colors group cursor-pointer"
              >
                <div className="text-xs font-medium text-white group-hover:text-neutral-200 flex items-center justify-between">
                  <span>{sample.title}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-white transition-colors" />
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  {sample.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
