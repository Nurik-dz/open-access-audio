import React from 'react';
import { motion } from 'motion/react';
import { X, Check, Server, Terminal, Shield, Cpu, Zap, Radio } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      id="arch-modal-overlay"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        id="arch-modal-card"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[#0E1015] border border-white/[0.12] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#11141B]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Open-Access Pipeline Architecture
              </h3>
              <p className="text-[11px] text-neutral-400">Zero proprietary API fees • 100% Open Neural Processing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto flex flex-col gap-4 text-xs text-neutral-300 font-sans leading-relaxed">
          {/* Overview Guarantee */}
          <div className="p-4 bg-gradient-to-r from-emerald-950/40 to-cyan-950/30 border border-emerald-500/30 rounded-xl flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white">Zero API Cost Architecture</div>
              <p className="text-neutral-300 mt-0.5 leading-relaxed">
                This studio operates entirely through public open-access endpoints and cloud compute spaces.
                No paid subscription keys (ElevenLabs, OpenAI, or paid Google Cloud) are required.
              </p>
            </div>
          </div>

          {/* Core Endpoints Breakdown */}
          <div className="flex flex-col gap-3">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider font-mono">
              Engine Specifications
            </div>

            {/* TTS Module */}
            <div className="p-4 bg-[#08090C] border border-white/[0.08] rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  1. Text-to-Speech (/api/tts)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 font-medium">
                  Microsoft Edge Read Aloud
                </span>
              </div>
              <p className="text-neutral-400">
                Executed via high-speed <code className="text-neutral-200">edge-tts</code> with real-time rate, pitch, and gain modulation. Delivers high-definition 48kHz neural audio with sub-second response times.
              </p>
              <div className="p-2.5 bg-black/60 rounded-lg font-mono text-[11px] text-neutral-400 border border-white/[0.04] overflow-x-auto">
                edge-tts --voice [voice] --rate=[rate] --pitch=[pitch] --text [text] --write-media [output]
              </div>
            </div>

            {/* STT Module */}
            <div className="p-4 bg-[#08090C] border border-white/[0.08] rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  2. Speech-to-Text (/api/stt)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-medium">
                  FFmpeg + Web Speech
                </span>
              </div>
              <p className="text-neutral-400">
                Audio is converted on the fly to 16kHz Mono WAV format for guaranteed compatibility with the public speech recognition pipeline.
              </p>
              <div className="p-2.5 bg-black/60 rounded-lg font-mono text-[11px] text-neutral-400 border border-white/[0.04] overflow-x-auto">
                ffmpeg -y -v error -i [input] -ar 16000 -ac 1 [output_16k.wav]
              </div>
            </div>

            {/* Voice Cloning Module */}
            <div className="p-4 bg-[#08090C] border border-white/[0.08] rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  3. Voice Cloning (/api/clone)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 font-medium">
                  Hugging Face F5-TTS
                </span>
              </div>
              <p className="text-neutral-400">
                Dispatches zero-shot acoustic synthesis requests to open public GPU spaces running the F5-TTS diffusion architecture.
              </p>
            </div>
          </div>

          {/* Host Storage Policy */}
          <div className="p-3.5 bg-black/40 border border-white/[0.06] rounded-xl flex items-center justify-between text-xs text-neutral-400">
            <span>Storage & Privacy Policy:</span>
            <span className="text-neutral-200 font-mono">Auto-purged on response completion</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-[#11141B] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white text-black font-semibold text-xs rounded-xl hover:bg-neutral-200 transition-colors"
          >
            Got It
          </button>
        </div>
      </motion.div>
    </div>
  );
};
