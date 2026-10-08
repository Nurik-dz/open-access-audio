import React from 'react';
import { motion } from 'motion/react';
import { Volume2, Mic, Sparkles, Clock, Zap, Radio, Server, Image as ImageIcon, Film } from 'lucide-react';
import { SuiteTab } from '../types';

interface Props {
  activeTab: SuiteTab;
  onSelectTab: (tab: SuiteTab) => void;
  historyCount: number;
  onOpenArchInfo: () => void;
}

export const Header: React.FC<Props> = ({
  activeTab,
  onSelectTab,
  historyCount,
  onOpenArchInfo,
}) => {
  const navItems: { id: SuiteTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'tts', label: 'Speech Synthesis', icon: Volume2 },
    { id: 'clone', label: 'Voice Lab & Clone', icon: Sparkles },
    { id: 'sfx', label: 'Sound Effects & SFX', icon: Zap },
    { id: 'visuals', label: 'Visuals & Image', icon: ImageIcon },
    { id: 'video', label: 'Video Studio', icon: Film },
    { id: 'stt', label: 'Speech to Text', icon: Mic },
    { id: 'history', label: 'Library', icon: Clock },
  ];

  return (
    <header
      id="main-nav-bar"
      className="border-b border-white/[0.07] bg-[#07080B]/90 backdrop-blur-xl sticky top-0 z-40"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-15 flex items-center justify-between">
        {/* Brand Logo & Studio Mark */}
        <div className="flex items-center gap-6 sm:gap-8">
          <div
            className="flex items-center gap-2.5 cursor-pointer group select-none"
            onClick={() => onSelectTab('tts')}
          >
            {/* Minimalist Studio Waveform Icon */}
            <div className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.12] flex items-center justify-center p-1.5 shadow-sm group-hover:border-white/[0.25] transition-all">
              <div className="w-full h-full flex items-center justify-center gap-[2.5px]">
                <span className="w-[2.5px] h-2.5 bg-white/70 rounded-full" />
                <span className="w-[2.5px] h-4.5 bg-white rounded-full" />
                <span className="w-[2.5px] h-3 bg-white/80 rounded-full" />
                <span className="w-[2.5px] h-5 bg-white rounded-full" />
                <span className="w-[2.5px] h-2 bg-white/60 rounded-full" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold tracking-tight text-white group-hover:text-neutral-200 transition-colors">
                  ElevenOpen
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.08] text-neutral-300 border border-white/[0.1] font-medium">
                  STUDIO
                </span>
              </div>
            </div>
          </div>

          {/* Desktop Studio Nav Tabs with animated pill */}
          <nav className="hidden md:flex items-center gap-1 p-1 bg-white/[0.03] border border-white/[0.06] rounded-xl">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  id={`nav-link-${item.id}`}
                  onClick={() => onSelectTab(item.id)}
                  className={`relative px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
                    isActive ? 'text-white font-semibold' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeNavPill"
                      className="absolute inset-0 bg-white/[0.1] border border-white/[0.14] rounded-lg shadow-sm"
                      transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-neutral-400'}`} />
                    <span>{item.label}</span>
                    {item.id === 'history' && historyCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-neutral-300 font-mono">
                        {historyCount}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right Status & Actions */}
        <div className="flex items-center gap-2.5">
          {/* Active Engine Badge */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[11px] font-medium text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Neural Engine Active</span>
          </div>

          {/* Engine Specs Modal Trigger */}
          <motion.button
            id="arch-spec-btn"
            onClick={onOpenArchInfo}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-lg border border-white/[0.08] transition-colors"
            title="System Specifications & Free Tier Guarantees"
          >
            <Server className="w-3.5 h-3.5 text-neutral-400" />
            <span className="hidden sm:inline">Engine Specs</span>
            <span className="sm:hidden">Specs</span>
          </motion.button>
        </div>
      </div>

      {/* Mobile Navigation bar */}
      <div className="md:hidden flex items-center justify-around border-t border-white/[0.06] bg-[#07080B] py-2 px-2 overflow-x-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isActive ? 'bg-white/15 text-white font-semibold' : 'text-neutral-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
              {item.id === 'history' && historyCount > 0 && (
                <span className="text-[9px] px-1 rounded-full bg-white/15 text-neutral-300 font-mono">
                  {historyCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};
