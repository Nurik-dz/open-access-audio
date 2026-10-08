import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  HardDrive,
  Trash2,
  X,
  Clock,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  Video,
  Image as ImageIcon,
  Mic,
  AudioLines,
  AlertCircle,
} from 'lucide-react';
import { HistoryItem } from '../types';
import { estimateStorageUsage, formatBytes } from '../utils/storage';

export type PurgeStrategy =
  | 'older_24h'
  | 'older_3d'
  | 'older_7d'
  | 'keep_latest_5'
  | 'keep_latest_10'
  | 'keep_latest_20'
  | 'heavy_media'
  | 'videos_only'
  | 'visuals_only';

interface PurgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onConfirmPurge: (retained: HistoryItem[], purgedCount: number, freedBytes: number) => void;
}

export const PurgeModal: React.FC<PurgeModalProps> = ({
  isOpen,
  onClose,
  history,
  onConfirmPurge,
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState<PurgeStrategy>('older_24h');

  // Overall current storage footprint
  const currentUsage = useMemo(() => estimateStorageUsage(history), [history]);

  // Compute items to purge and items to retain based on selected strategy
  const { itemsToPurge, itemsToRetain, freedBytes } = useMemo(() => {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    let toPurge: HistoryItem[] = [];
    let toRetain: HistoryItem[] = [];

    // Clone and sort descending by timestamp (newest first)
    const sorted = [...history].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    switch (selectedStrategy) {
      case 'older_24h': {
        const cutoff = now - oneDayMs;
        toPurge = sorted.filter((item) => item.timestamp < cutoff);
        toRetain = sorted.filter((item) => item.timestamp >= cutoff);
        break;
      }
      case 'older_3d': {
        const cutoff = now - 3 * oneDayMs;
        toPurge = sorted.filter((item) => item.timestamp < cutoff);
        toRetain = sorted.filter((item) => item.timestamp >= cutoff);
        break;
      }
      case 'older_7d': {
        const cutoff = now - 7 * oneDayMs;
        toPurge = sorted.filter((item) => item.timestamp < cutoff);
        toRetain = sorted.filter((item) => item.timestamp >= cutoff);
        break;
      }
      case 'keep_latest_5': {
        toRetain = sorted.slice(0, 5);
        toPurge = sorted.slice(5);
        break;
      }
      case 'keep_latest_10': {
        toRetain = sorted.slice(0, 10);
        toPurge = sorted.slice(10);
        break;
      }
      case 'keep_latest_20': {
        toRetain = sorted.slice(0, 20);
        toPurge = sorted.slice(20);
        break;
      }
      case 'heavy_media': {
        // Purge items that contain large video or image base64 data payloads
        toPurge = sorted.filter((item) => item.type === 'video' || item.type === 'image');
        toRetain = sorted.filter((item) => item.type !== 'video' && item.type !== 'image');
        break;
      }
      case 'videos_only': {
        toPurge = sorted.filter((item) => item.type === 'video');
        toRetain = sorted.filter((item) => item.type !== 'video');
        break;
      }
      case 'visuals_only': {
        toPurge = sorted.filter((item) => item.type === 'image');
        toRetain = sorted.filter((item) => item.type !== 'image');
        break;
      }
      default:
        toRetain = sorted;
        toPurge = [];
    }

    const purgeUsage = estimateStorageUsage(toPurge);

    return {
      itemsToPurge: toPurge,
      itemsToRetain: toRetain,
      freedBytes: purgeUsage.totalBytes,
    };
  }, [history, selectedStrategy]);

  if (!isOpen) return null;

  const handleExecute = () => {
    onConfirmPurge(itemsToRetain, itemsToPurge.length, freedBytes);
    onClose();
  };

  const strategies: {
    id: PurgeStrategy;
    title: string;
    description: string;
    tag: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'older_24h',
      title: 'Older than 24 Hours',
      description: 'Remove all generations created more than 1 day ago.',
      tag: 'Recommended',
      icon: Clock,
    },
    {
      id: 'older_3d',
      title: 'Older than 3 Days',
      description: 'Retain recent multi-day workspace sessions and remove older assets.',
      tag: 'Safe',
      icon: Calendar,
    },
    {
      id: 'older_7d',
      title: 'Older than 7 Days',
      description: 'Purge stale archive history older than one week.',
      tag: 'Archival',
      icon: Calendar,
    },
    {
      id: 'keep_latest_10',
      title: 'Keep Latest 10 Generations',
      description: 'Retain only the 10 most recent creations and purge older ones.',
      tag: 'Quick Balance',
      icon: Layers,
    },
    {
      id: 'keep_latest_5',
      title: 'Keep Latest 5 Generations',
      description: 'Aggressively slim down storage to the top 5 most recent creations.',
      tag: 'Max Space',
      icon: HardDrive,
    },
    {
      id: 'heavy_media',
      title: 'Purge Heavy Media (Video & Images)',
      description: 'Purge video and image assets while preserving audio and transcripts.',
      tag: 'Media Cleanup',
      icon: Video,
    },
    {
      id: 'videos_only',
      title: 'Purge Video Renders Only',
      description: 'Remove all generated MP4 video renders to free maximum quota.',
      tag: 'Video Cleanup',
      icon: Video,
    },
    {
      id: 'visuals_only',
      title: 'Purge Visual Imagery Only',
      description: 'Remove all 9:16 portrait visual image generations.',
      tag: 'Visual Cleanup',
      icon: ImageIcon,
    },
  ];

  const percentReclaimed = currentUsage.totalBytes > 0
    ? Math.min(100, Math.round((freedBytes / currentUsage.totalBytes) * 100))
    : 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-[#0C0E14] border border-white/[0.12] rounded-2xl shadow-2xl p-5 sm:p-6 flex flex-col gap-5 text-neutral-200 my-8"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <span>Purge Old History & Free Storage</span>
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Select a purge rule to selectively clean up older generation records and free browser storage.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Storage Impact Summary Bar */}
          <div className="p-4 bg-[#08090C] border border-white/[0.08] rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Current Usage</div>
                <div className="text-sm font-semibold text-white font-mono mt-0.5">
                  {formatBytes(currentUsage.totalBytes)} <span className="text-neutral-500 font-normal">({history.length} items)</span>
                </div>
              </div>
              <div className="h-7 w-[1px] bg-white/[0.1]" />
              <div>
                <div className="text-[10px] font-mono text-amber-400/90 uppercase tracking-wider">Space to Free</div>
                <div className="text-sm font-semibold text-emerald-400 font-mono mt-0.5 flex items-center gap-1.5">
                  <span>-{formatBytes(freedBytes)}</span>
                  {percentReclaimed > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                      {percentReclaimed}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-xs font-mono text-neutral-400 sm:text-right">
              <div>
                <span className="text-white font-semibold">{itemsToPurge.length}</span> items will be deleted
              </div>
              <div className="text-[11px] text-neutral-500">
                <span className="text-neutral-300">{itemsToRetain.length}</span> items will be preserved
              </div>
            </div>
          </div>

          {/* Strategy Selection Grid */}
          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
            <div className="text-xs font-semibold text-neutral-300 uppercase tracking-wider font-mono mb-1">
              Select Cleanup Rule
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {strategies.map((strat) => {
                const isSelected = selectedStrategy === strat.id;
                const IconComponent = strat.icon;

                return (
                  <div
                    key={strat.id}
                    onClick={() => setSelectedStrategy(strat.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                      isSelected
                        ? 'bg-blue-600/15 border-blue-500/50 shadow-md shadow-blue-500/5'
                        : 'bg-[#08090C] border-white/[0.06] hover:border-white/[0.15] hover:bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <IconComponent
                          className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-neutral-400'}`}
                        />
                        <div className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-neutral-200'}`}>
                          {strat.title}
                        </div>
                      </div>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                          isSelected
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                            : 'bg-white/[0.04] text-neutral-400 border-white/[0.06]'
                        }`}
                      >
                        {strat.tag}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 leading-tight">
                      {strat.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preview Warning / Notice */}
          {itemsToPurge.length === 0 ? (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center gap-2.5 text-xs text-blue-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                No items match this criteria. All {history.length} items will be kept in storage.
              </span>
            </div>
          ) : (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2.5 text-xs text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                This will permanently delete <strong className="text-amber-200">{itemsToPurge.length}</strong> items and reclaim <strong className="text-amber-200">{formatBytes(freedBytes)}</strong> of browser space.
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={itemsToPurge.length === 0}
              onClick={handleExecute}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl shadow-lg transition-all cursor-pointer ${
                itemsToPurge.length === 0
                  ? 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed opacity-50'
                  : 'bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-white shadow-amber-500/20'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Purge {itemsToPurge.length} Items (Free {formatBytes(freedBytes)})</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
