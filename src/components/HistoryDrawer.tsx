import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clock,
  Trash2,
  Search,
  ArrowRight,
  Layers,
  FileText,
  AudioLines,
  Sparkles,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { AudioPlayer } from './AudioPlayer';
import { HistoryItem } from '../types';
import { PurgeModal } from './PurgeModal';
import { estimateStorageUsage, formatBytes } from '../utils/storage';

interface Props {
  history: HistoryItem[];
  onClearHistory: () => void;
  onDeleteItem: (id: string) => void;
  onPurgeHistory?: (remaining: HistoryItem[]) => void;
  onSelectForTts?: (text: string) => void;
}

export const HistoryDrawer: React.FC<Props> = ({
  history,
  onClearHistory,
  onDeleteItem,
  onPurgeHistory,
  onSelectForTts,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'tts' | 'stt' | 'clone' | 'sfx' | 'image' | 'video'>('all');
  const [isPurgeModalOpen, setIsPurgeModalOpen] = useState<boolean>(false);
  const [purgeToast, setPurgeToast] = useState<{ message: string; submessage?: string } | null>(null);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const ttsCount = history.filter((h) => h.type === 'tts').length;
  const sttCount = history.filter((h) => h.type === 'stt').length;
  const cloneCount = history.filter((h) => h.type === 'clone').length;
  const imageCount = history.filter((h) => h.type === 'image').length;
  const videoCount = history.filter((h) => h.type === 'video').length;
  const sfxCount = history.filter((h) => h.type === 'sfx' || h.type === 'ambient').length;

  const storageUsage = useMemo(() => estimateStorageUsage(history), [history]);

  // Quota benchmark (50 MB standard browser storage target)
  const quotaBenchmarkBytes = 50 * 1024 * 1024;
  const storagePercentage = Math.min(100, Math.round((storageUsage.totalBytes / quotaBenchmarkBytes) * 100));

  const filteredHistory = history.filter((item) => {
    const matchesType = typeFilter === 'all' || item.type === typeFilter || (typeFilter === 'sfx' && item.type === 'ambient');
    const matchesSearch =
      (item.title && item.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.text && item.text.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.voiceOrModel && item.voiceOrModel.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const handleConfirmPurge = (retained: HistoryItem[], purgedCount: number, freedBytes: number) => {
    if (onPurgeHistory) {
      onPurgeHistory(retained);
    }
    setPurgeToast({
      message: `Purged ${purgedCount} old item${purgedCount === 1 ? '' : 's'}`,
      submessage: `Successfully freed ${formatBytes(freedBytes)} of browser storage space.`,
    });
    setTimeout(() => {
      setPurgeToast(null);
    }, 4500);
  };

  const handleQuickPurgeOlder24h = () => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const toRetain = history.filter((item) => item.timestamp >= oneDayAgo);
    const toPurge = history.filter((item) => item.timestamp < oneDayAgo);
    if (toPurge.length === 0) {
      setPurgeToast({
        message: 'No items older than 24 hours',
        submessage: 'All current generation records were created within the last 24 hours.',
      });
      setTimeout(() => setPurgeToast(null), 3000);
      return;
    }
    const freed = estimateStorageUsage(toPurge).totalBytes;
    handleConfirmPurge(toRetain, toPurge.length, freed);
  };

  return (
    <div id="eleven-library-studio" className="w-full grid grid-cols-12 gap-5">
      {/* Audio Library Stream */}
      <div className="col-span-12 lg:col-span-8 flex flex-col gap-5">
        {/* Purge Toast Banner */}
        <AnimatePresence>
          {purgeToast && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between gap-3 text-emerald-300 shadow-xl backdrop-blur-md"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">{purgeToast.message}</div>
                  {purgeToast.submessage && (
                    <div className="text-[11px] text-emerald-400/90 mt-0.5">{purgeToast.submessage}</div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setPurgeToast(null)}
                className="text-[10px] font-mono px-2 py-1 rounded bg-white/[0.08] hover:bg-white/[0.12] text-white border border-white/[0.1] transition-colors"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          id="history-feed-card"
          className="relative bg-[#0C0E14] border border-white/[0.08] rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col gap-5 backdrop-blur-xl"
        >
          {/* Library Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.07]">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-tight">Audio Generation Library</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.08] text-neutral-300 border border-white/[0.1] font-medium">
                  {history.length} Saved Generations
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-medium">
                  {formatBytes(storageUsage.totalBytes)}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Review, playback, download, and manage storage for generated media assets and transcripts.
              </p>
            </div>

            {history.length > 0 && (
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  id="purge-history-btn"
                  type="button"
                  onClick={() => setIsPurgeModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 rounded-lg transition-all shadow-sm cursor-pointer"
                >
                  <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                  <span>Purge Old History</span>
                </button>

                <button
                  id="clear-all-history-btn"
                  type="button"
                  onClick={onClearHistory}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              </div>
            )}
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="flex-1 w-full flex items-center gap-2.5 bg-[#08090C] border border-white/[0.08] rounded-xl px-3.5 py-2">
              <Search className="w-4 h-4 text-neutral-500" />
              <input
                type="text"
                placeholder="Search history by text, voice, or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none text-xs text-white placeholder-neutral-500 focus:outline-none w-full font-sans"
              />
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] self-start sm:self-auto overflow-x-auto max-w-full">
              {[
                { id: 'all', label: 'All' },
                { id: 'tts', label: 'TTS' },
                { id: 'clone', label: 'Clones' },
                { id: 'sfx', label: 'SFX' },
                { id: 'video', label: 'Video' },
                { id: 'image', label: 'Visuals' },
                { id: 'stt', label: 'Transcripts' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setTypeFilter(f.id as any)}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors whitespace-nowrap ${
                    typeFilter === f.id
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Empty state */}
          {history.length === 0 && (
            <div className="py-16 flex flex-col items-center justify-center text-center gap-3 text-neutral-500">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-neutral-500">
                <Clock className="w-6 h-6 stroke-[1.5]" />
              </div>
              <div className="text-sm font-semibold text-white">No Library History Yet</div>
              <p className="text-xs text-neutral-500 max-w-sm">
                Generated audio synthesis, sound effects, voice clones, video renders, and visual assets will automatically appear here for playback and download.
              </p>
            </div>
          )}

          {/* Empty search results */}
          {history.length > 0 && filteredHistory.length === 0 && (
            <div className="py-12 text-center text-neutral-500 text-xs font-mono">
              No matching records found for "{searchQuery}".
            </div>
          )}

          {/* List of generation items */}
          <div className="flex flex-col gap-3.5">
            <AnimatePresence>
              {filteredHistory.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="p-4 bg-[#0E1015] border border-white/[0.07] hover:border-white/[0.16] rounded-2xl flex flex-col gap-3 transition-colors shadow-lg"
                >
                  {/* Item header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-md font-semibold tracking-wider ${
                          item.type === 'tts'
                            ? 'bg-white/10 text-neutral-200 border border-white/15'
                            : item.type === 'video'
                            ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25'
                            : item.type === 'image'
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                            : item.type === 'sfx' || item.type === 'ambient'
                            ? 'bg-purple-500/15 text-purple-300 border border-purple-500/25'
                            : item.type === 'stt'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                            : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25'
                        }`}
                      >
                        {item.type === 'ambient' ? 'AMBIENT' : item.type.toUpperCase()}
                      </span>
                      <span className="text-sm font-semibold text-white truncate">
                        {item.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono text-neutral-500">
                        {formatDate(item.timestamp)} • {formatTime(item.timestamp)}
                      </span>
                      <button
                        onClick={() => onDeleteItem(item.id)}
                        className="p-1.5 text-neutral-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                        title="Delete from history"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Text snippet */}
                  {item.text && item.type !== 'image' && item.type !== 'video' && (
                    <div className="text-xs text-neutral-200 bg-[#08090C] p-3.5 rounded-xl border border-white/[0.04] leading-relaxed font-sans select-text">
                      {item.text}
                    </div>
                  )}

                  {/* Video Render Card */}
                  {item.type === 'video' && item.videoUrl && (
                    <div className="flex flex-col sm:flex-row gap-3 bg-[#08090C] p-3 rounded-xl border border-white/[0.06] items-center sm:items-start">
                      <video
                        src={item.videoUrl}
                        controls
                        loop
                        playsInline
                        preload="auto"
                        className="w-48 max-h-56 object-contain rounded-lg border border-white/10 shrink-0 bg-black"
                      />
                      <div className="flex-1 flex flex-col justify-between self-stretch gap-2 py-1">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-neutral-300 font-sans leading-relaxed">
                            {item.text || item.title}
                          </span>
                          <span className="text-[10px] font-mono text-neutral-500">
                            {item.voiceOrModel || 'Open-Access LTX-Video'} • {item.durationSec ? `${item.durationSec}s` : '24fps MP4'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          <a
                            href={item.videoUrl}
                            download={`video_${item.id}.mp4`}
                            className="px-3 py-1 bg-white text-black text-xs font-semibold rounded-lg hover:bg-neutral-200 transition-colors inline-flex items-center gap-1.5"
                          >
                            <span>Download MP4</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Visual Image Render */}
                  {item.type === 'image' && item.imageUrl && (
                    <div className="flex flex-col sm:flex-row gap-3 bg-[#08090C] p-3 rounded-xl border border-white/[0.06] items-center sm:items-start">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-32 h-44 object-cover rounded-lg border border-white/10 shrink-0 shadow-md"
                      />
                      <div className="flex-1 flex flex-col justify-between self-stretch gap-2 py-1">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-neutral-300 font-sans leading-relaxed">
                            {item.text || item.title}
                          </span>
                          {item.dimensions && (
                            <span className="text-[10px] font-mono text-neutral-500">
                              Resolution: {item.dimensions}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          <a
                            href={item.imageUrl}
                            download={`visual_${item.id}.jpg`}
                            className="px-3 py-1 bg-white text-black text-xs font-semibold rounded-lg hover:bg-neutral-200 transition-colors inline-flex items-center gap-1.5"
                          >
                            <span>Download JPEG</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Embedded ElevenLabs Audio Player */}
                  {item.audioUrl && (
                    <div className="pt-1">
                      <AudioPlayer
                        src={item.audioUrl}
                        title={item.title}
                        subtitle={item.voiceOrModel || 'Generated Audio'}
                        onDownloadFilename={`${item.type}_${item.id}.wav`}
                      />
                    </div>
                  )}

                  {/* Quick Pipe action */}
                  {item.text && onSelectForTts && item.type !== 'tts' && item.type !== 'image' && item.type !== 'video' && (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => onSelectForTts(item.text)}
                        className="flex items-center gap-1 text-[11px] font-medium text-neutral-300 hover:text-white transition-colors"
                      >
                        <span>Open in Speech Synthesis</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Side Column: Storage Management & Session Metrics */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-5">
        {/* Storage Quota & Purge Card */}
        <div className="bg-[#0C0E14] border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-4 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-white flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5 text-amber-400" />
              <span>Storage Quota & Cleanup</span>
            </div>
            <span className="text-[10px] font-mono text-neutral-400">
              {formatBytes(storageUsage.totalBytes)} / ~50 MB
            </span>
          </div>

          {/* Storage Bar Indicator */}
          <div className="flex flex-col gap-1.5">
            <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden flex">
              <div
                style={{
                  width: `${Math.min(100, Math.max(storagePercentage, history.length > 0 ? 3 : 0))}%`,
                }}
                className={`h-full transition-all duration-300 rounded-full ${
                  storagePercentage > 80
                    ? 'bg-gradient-to-r from-amber-500 to-red-500'
                    : storagePercentage > 40
                    ? 'bg-gradient-to-r from-blue-500 to-amber-500'
                    : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                }`}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-neutral-500">
              <span>{storagePercentage}% of safe quota</span>
              <span>{history.length} items</span>
            </div>
          </div>

          {/* Media Breakdown */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2.5 bg-[#08090C] border border-white/[0.06] rounded-xl flex flex-col gap-0.5">
              <span className="text-[10px] text-purple-400 font-semibold">Video Renders</span>
              <span className="text-white font-bold">{formatBytes(storageUsage.videoBytes)}</span>
            </div>
            <div className="p-2.5 bg-[#08090C] border border-white/[0.06] rounded-xl flex flex-col gap-0.5">
              <span className="text-[10px] text-pink-400 font-semibold">Visual Images</span>
              <span className="text-white font-bold">{formatBytes(storageUsage.imageBytes)}</span>
            </div>
            <div className="p-2.5 bg-[#08090C] border border-white/[0.06] rounded-xl flex flex-col gap-0.5">
              <span className="text-[10px] text-blue-400 font-semibold">Audio Clips</span>
              <span className="text-white font-bold">{formatBytes(storageUsage.audioBytes)}</span>
            </div>
            <div className="p-2.5 bg-[#08090C] border border-white/[0.06] rounded-xl flex flex-col gap-0.5">
              <span className="text-[10px] text-emerald-400 font-semibold">Text & Meta</span>
              <span className="text-white font-bold">{formatBytes(storageUsage.metadataBytes)}</span>
            </div>
          </div>

          {/* Purge Actions */}
          <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.06]">
            <button
              onClick={() => setIsPurgeModalOpen(true)}
              disabled={history.length === 0}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <HardDrive className="w-3.5 h-3.5 text-amber-400" />
              <span>Configure Purge Rules</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleQuickPurgeOlder24h}
                disabled={history.length === 0}
                className="flex-1 py-1.5 px-2 text-[11px] font-mono rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.06] transition-colors cursor-pointer text-center disabled:opacity-50"
              >
                Purge &gt; 24h
              </button>
              <button
                onClick={() => {
                  const sorted = [...history].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                  const retained = sorted.slice(0, 10);
                  const purged = sorted.slice(10);
                  if (purged.length === 0) {
                    setPurgeToast({
                      message: 'History already under 10 items',
                      submessage: 'No items need to be purged.',
                    });
                    setTimeout(() => setPurgeToast(null), 3000);
                    return;
                  }
                  const freed = estimateStorageUsage(purged).totalBytes;
                  handleConfirmPurge(retained, purged.length, freed);
                }}
                disabled={history.length <= 10}
                className="flex-1 py-1.5 px-2 text-[11px] font-mono rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.06] transition-colors cursor-pointer text-center disabled:opacity-50"
              >
                Keep Latest 10
              </button>
            </div>
          </div>
        </div>

        {/* Analytics Breakdown */}
        <div className="bg-[#0C0E14] border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-4 shadow-xl backdrop-blur-xl">
          <div className="text-xs font-semibold text-white flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-neutral-400" />
            <span>Generation Analytics</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="p-3 bg-[#08090C] border border-white/[0.08] rounded-xl text-center">
              <div className="text-lg font-bold text-white font-mono">{ttsCount}</div>
              <div className="text-[10px] font-mono text-neutral-400 uppercase mt-0.5">Synthesis</div>
            </div>
            <div className="p-3 bg-[#08090C] border border-white/[0.08] rounded-xl text-center">
              <div className="text-lg font-bold text-white font-mono">{cloneCount}</div>
              <div className="text-[10px] font-mono text-neutral-400 uppercase mt-0.5">Clones</div>
            </div>
            <div className="p-3 bg-[#08090C] border border-white/[0.08] rounded-xl text-center">
              <div className="text-lg font-bold text-white font-mono">{sfxCount}</div>
              <div className="text-[10px] font-mono text-neutral-400 uppercase mt-0.5">SFX</div>
            </div>
            <div className="p-3 bg-[#08090C] border border-white/[0.08] rounded-xl text-center">
              <div className="text-lg font-bold text-white font-mono">{videoCount}</div>
              <div className="text-[10px] font-mono text-neutral-400 uppercase mt-0.5">Videos</div>
            </div>
            <div className="p-3 bg-[#08090C] border border-white/[0.08] rounded-xl text-center">
              <div className="text-lg font-bold text-white font-mono">{imageCount}</div>
              <div className="text-[10px] font-mono text-neutral-400 uppercase mt-0.5">Visuals</div>
            </div>
            <div className="p-3 bg-[#08090C] border border-white/[0.08] rounded-xl text-center">
              <div className="text-lg font-bold text-white font-mono">{sttCount}</div>
              <div className="text-[10px] font-mono text-neutral-400 uppercase mt-0.5">Transcripts</div>
            </div>
          </div>

          <div className="p-3.5 bg-black/40 border border-white/[0.06] rounded-xl text-xs font-mono space-y-2 text-neutral-400">
            <div className="flex justify-between">
              <span>Storage Policy:</span>
              <span className="text-emerald-400 font-semibold">IndexedDB & Client-Only</span>
            </div>
            <div className="flex justify-between">
              <span>Image Canvas:</span>
              <span className="text-neutral-200">1080×1920 (9:16)</span>
            </div>
            <div className="flex justify-between">
              <span>Audio Fidelity:</span>
              <span className="text-neutral-200">48kHz MP3 / 24kHz WAV</span>
            </div>
            <div className="flex justify-between">
              <span>API Consumption:</span>
              <span className="text-emerald-400 font-semibold">Zero Quota Cost</span>
            </div>
          </div>
        </div>
      </div>

      {/* Purge Rules Modal */}
      <PurgeModal
        isOpen={isPurgeModalOpen}
        onClose={() => setIsPurgeModalOpen(false)}
        history={history}
        onConfirmPurge={handleConfirmPurge}
      />
    </div>
  );
};
