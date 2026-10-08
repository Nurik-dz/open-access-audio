import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Square, RotateCcw, Check, AlertCircle, RefreshCw, Volume2, ShieldAlert } from 'lucide-react';

interface Props {
  onRecordingComplete: (blob: Blob, base64: string) => void;
  onCancel?: () => void;
  onSwitchToUpload?: () => void;
  maxSeconds?: number;
}

export const MicRecorder: React.FC<Props> = ({
  onRecordingComplete,
  onCancel,
  onSwitchToUpload,
  maxSeconds = 60,
}) => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [elapsed, setElapsed] = useState<number>(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [permError, setPermError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      stopRecordingCleanup();
    };
  }, []);

  const stopRecordingCleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
  };

  const startRecording = async () => {
    setPermError(null);

    if (!navigator?.mediaDevices?.getUserMedia) {
      setPermError(
        'Audio recording is not supported in this browser or frame environment. Please use file upload instead.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioChunksRef.current = [];
      setAudioUrl(null);
      setRecordedBlob(null);
      setElapsed(0);

      // Setup Web Audio API for level visualization
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
          animationFrameRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      } catch (err) {
        console.warn('Audio analyzer error:', err);
      }

      // Check supported MIME types
      let options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus' };
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/webm' };
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options = { mimeType: 'audio/mp4' };
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // Convert blob to base64
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          onRecordingComplete(blob, base64data);
        };

        // Stop media tracks
        stream.getTracks().forEach((track) => track.stop());
        stopRecordingCleanup();
        setIsRecording(false);
      };

      recorder.start(100);
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev + 1 >= maxSeconds) {
            stopRecording();
            return maxSeconds;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.warn('Microphone access notice:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('Permission denied')) {
        setPermError(
          'Microphone permission was blocked or dismissed. Please allow microphone access in your browser site permissions, or upload an audio file.'
        );
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setPermError('No microphone audio input device was found on your system.');
      } else {
        setPermError(err.message || 'Unable to access microphone.');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopRecordingCleanup();
  };

  const resetRecording = () => {
    setAudioUrl(null);
    setRecordedBlob(null);
    setElapsed(0);
    setPermError(null);
    if (onCancel) onCancel();
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      id="eleven-mic-recorder"
      className="bg-[#0C0E14] border border-white/[0.08] rounded-xl p-6 flex flex-col items-center justify-center gap-5 shadow-lg relative overflow-hidden text-center"
    >
      {/* Permission error state */}
      {permError && (
        <div className="w-full bg-red-950/40 border border-red-500/30 rounded-xl p-4 text-left flex flex-col gap-2.5 text-xs">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Microphone Access Blocked</span>
              <p className="text-red-300/90 mt-0.5 leading-relaxed">{permError}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-red-500/20 text-[11px]">
            <button
              id="mic-retry-btn"
              type="button"
              onClick={startRecording}
              className="flex items-center gap-1 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-white font-medium rounded-lg border border-red-500/40 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry Permission</span>
            </button>

            {onSwitchToUpload && (
              <button
                type="button"
                onClick={onSwitchToUpload}
                className="px-3 py-1 bg-white/[0.08] hover:bg-white/[0.15] text-white font-medium rounded-lg border border-white/[0.1] transition-colors"
              >
                Switch to File Upload
              </button>
            )}
          </div>
        </div>
      )}

      {/* Recording Orb Centerpiece */}
      <div className="flex flex-col items-center gap-3 py-2">
        {!isRecording && !audioUrl && (
          <motion.button
            id="mic-start-record-btn"
            type="button"
            onClick={startRecording}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-lg shadow-white/10 hover:bg-neutral-200 transition-all cursor-pointer"
          >
            <Mic className="w-6 h-6" />
          </motion.button>
        )}

        {isRecording && (
          <motion.button
            id="mic-stop-record-btn"
            type="button"
            onClick={stopRecording}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-500/30 transition-all cursor-pointer animate-pulse"
          >
            <Square className="w-6 h-6 fill-white" />
          </motion.button>
        )}

        {audioUrl && !isRecording && (
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm">
            <Check className="w-7 h-7 stroke-[2.5]" />
          </div>
        )}

        {/* Status text & timer */}
        <div className="text-center">
          {isRecording ? (
            <div>
              <div className="flex items-center justify-center gap-2 text-red-400 font-mono text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span>RECORDING</span>
              </div>
              <div className="text-2xl font-mono font-bold text-white mt-1">
                {formatTimer(elapsed)} <span className="text-neutral-500 text-sm">/ {formatTimer(maxSeconds)}</span>
              </div>
            </div>
          ) : audioUrl ? (
            <div>
              <div className="text-sm font-semibold text-emerald-400">Audio Captured</div>
              <div className="text-xs font-mono text-neutral-400 mt-0.5">{formatTimer(elapsed)} duration</div>
            </div>
          ) : (
            <div>
              <div className="text-sm font-semibold text-white">Click Microphone to Record</div>
              <div className="text-xs text-neutral-500 mt-0.5">High-fidelity 16kHz audio capture (max {maxSeconds}s)</div>
            </div>
          )}
        </div>
      </div>

      {/* Live Audio Amplitude Meter */}
      {isRecording && (
        <div className="w-full max-w-md flex flex-col gap-1 px-4">
          <div className="flex justify-between text-[10px] font-mono text-neutral-500">
            <span>MIC LEVEL</span>
            <span className="text-neutral-300">{audioLevel}%</span>
          </div>
          <div className="w-full h-1.5 bg-black/60 rounded-full border border-white/[0.08] overflow-hidden">
            <motion.div
              className="h-full bg-white rounded-full"
              style={{ width: `${Math.max(5, audioLevel)}%` }}
              transition={{ duration: 0.05 }}
            />
          </div>
        </div>
      )}

      {/* Playback preview for captured audio */}
      {audioUrl && !isRecording && (
        <div className="w-full max-w-md flex flex-col gap-3">
          <div className="p-2 bg-black/40 border border-white/[0.08] rounded-xl flex items-center">
            <audio src={audioUrl} controls className="w-full h-8" />
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              id="mic-re-record-btn"
              type="button"
              onClick={startRecording}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-medium rounded-lg transition-colors border border-white/[0.08]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Record Again</span>
            </button>

            <button
              id="mic-reset-btn"
              type="button"
              onClick={resetRecording}
              className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Clear Audio
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
