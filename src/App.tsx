import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { TtsPanel } from './components/TtsPanel';
import { SttPanel } from './components/SttPanel';
import { ClonePanel } from './components/ClonePanel';
import { SfxPanel } from './components/SfxPanel';
import { VisualsPanel } from './components/VisualsPanel';
import { VideoPanel } from './components/VideoPanel';
import { HistoryDrawer } from './components/HistoryDrawer';
import { ArchModal } from './components/ArchModal';
import { SuiteTab, HistoryItem } from './types';
import { ShieldCheck, Cpu, Volume2, Mic, Sparkles, Radio } from 'lucide-react';

import {
  loadHistoryFromStorage,
  addHistoryItemToStorage,
  deleteHistoryItemFromStorage,
  clearAllHistoryFromStorage,
  purgeHistoryToStorage,
} from './utils/storage';

export default function App() {
  const [activeTab, setActiveTab] = useState<SuiteTab>('tts');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isArchModalOpen, setIsArchModalOpen] = useState<boolean>(false);

  // Pipe states between tabs
  const [ttsInitialText, setTtsInitialText] = useState<string>('');
  const [cloneInitialRefAudio, setCloneInitialRefAudio] = useState<string>('');
  const [cloneInitialText, setCloneInitialText] = useState<string>('');

  // Load history from IndexedDB on mount
  useEffect(() => {
    let isMounted = true;
    loadHistoryFromStorage().then((items) => {
      if (isMounted && items) {
        setHistory(items);
      }
    }).catch((err) => {
      console.warn('Could not load history from IndexedDB storage:', err);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleAddToHistory = (item: Omit<HistoryItem, 'id' | 'timestamp'>) => {
    const newItem: HistoryItem = {
      ...item,
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
    };
    const updated = [newItem, ...history.slice(0, 74)]; // Support up to 75 rich media items
    setHistory(updated);
    addHistoryItemToStorage(newItem, updated);
  };

  const handleClearHistory = () => {
    setHistory([]);
    clearAllHistoryFromStorage();
  };

  const handleDeleteHistoryItem = (id: string) => {
    const remaining = history.filter((item) => item.id !== id);
    setHistory(remaining);
    deleteHistoryItemFromStorage(id, remaining);
  };

  const handlePurgeHistory = (remaining: HistoryItem[]) => {
    setHistory(remaining);
    purgeHistoryToStorage(remaining);
  };

  const handlePipeSttToTts = (text: string) => {
    setTtsInitialText(text);
    setActiveTab('tts');
  };

  const handlePipeSttToClone = (audioBase64: string, text: string) => {
    setCloneInitialRefAudio(audioBase64);
    setCloneInitialText(text || 'Audio synthesized in the acoustic profile of this speech sample.');
    setActiveTab('clone');
  };

  return (
    <div className="min-h-screen bg-[#08090C] text-[#F3F4F6] flex flex-col font-sans selection:bg-blue-500 selection:text-white relative overflow-x-hidden">
      {/* ElevenLabs Ambient Backdrop Radial Lighting */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[350px] bg-gradient-to-b from-blue-600/10 via-indigo-600/5 to-transparent blur-3xl pointer-events-none z-0" />
      <div className="fixed top-1/4 right-[-200px] w-[500px] h-[500px] bg-cyan-600/5 blur-3xl pointer-events-none z-0" />

      {/* Top Header Navigation */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        historyCount={history.length}
        onOpenArchInfo={() => setIsArchModalOpen(true)}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6 relative z-10">
        <AnimatePresence mode="wait">
          {activeTab === 'tts' && (
            <motion.div
              key="tts-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <TtsPanel
                onAddToHistory={handleAddToHistory}
                initialText={ttsInitialText}
              />
            </motion.div>
          )}

          {activeTab === 'stt' && (
            <motion.div
              key="stt-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <SttPanel
                onAddToHistory={handleAddToHistory}
                onSendToTts={handlePipeSttToTts}
                onSendToClone={handlePipeSttToClone}
              />
            </motion.div>
          )}

          {activeTab === 'clone' && (
            <motion.div
              key="clone-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <ClonePanel
                onAddToHistory={handleAddToHistory}
                initialRefAudio={cloneInitialRefAudio}
                initialText={cloneInitialText}
              />
            </motion.div>
          )}

          {activeTab === 'sfx' && (
            <motion.div
              key="sfx-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <SfxPanel onAddToHistory={handleAddToHistory} />
            </motion.div>
          )}

          {activeTab === 'visuals' && (
            <motion.div
              key="visuals-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <VisualsPanel onAddToHistory={handleAddToHistory} />
            </motion.div>
          )}

          {activeTab === 'video' && (
            <motion.div
              key="video-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <VideoPanel onAddToHistory={handleAddToHistory} />
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div
              key="history-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <HistoryDrawer
                history={history}
                onClearHistory={handleClearHistory}
                onDeleteItem={handleDeleteHistoryItem}
                onPurgeHistory={handlePurgeHistory}
                onSelectForTts={handlePipeSttToTts}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Persistent Bottom Studio Bar */}
      <footer className="border-t border-white/[0.06] bg-[#0A0C10]/95 backdrop-blur-md py-3 text-xs font-mono text-neutral-400 relative z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-neutral-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Public Neural Endpoints</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5 text-neutral-400">
              <Cpu className="w-3.5 h-3.5 text-neutral-400" />
              <span>FFmpeg 16kHz Audio Streamer</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-neutral-500">
            <span>Microsoft Edge Neural TTS</span>
            <span>•</span>
            <span>Google Web Speech</span>
            <span>•</span>
            <span>F5-TTS Public Spaces</span>
          </div>
        </div>
      </footer>

      {/* Architecture Spec Modal */}
      <ArchModal
        isOpen={isArchModalOpen}
        onClose={() => setIsArchModalOpen(false)}
      />
    </div>
  );
}
