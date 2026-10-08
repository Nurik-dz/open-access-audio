import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  RotateCcw,
  Sliders,
  SlidersHorizontal,
  Volume2,
  Sparkles,
  ChevronDown,
  X,
  Check,
  Search,
  Download,
  Copy,
  Info,
  Clock,
  Radio,
  Bookmark,
  Share2,
  AudioLines,
  Globe,
  Filter,
  ShieldCheck,
  Zap,
  CornerDownLeft,
  Trash2,
  ClipboardPaste,
} from 'lucide-react';
import { AudioPlayer } from './AudioPlayer';
import { VoiceItem, HistoryItem } from '../types';

interface Props {
  onAddToHistory: (item: Omit<HistoryItem, 'id' | 'timestamp'>) => void;
  initialText?: string;
}

interface EnhancedVoice extends VoiceItem {
  avatarColor: string;
  category: 'Narrative' | 'Conversational' | 'News' | 'Multilingual';
  accentDesc: string;
  sampleText: string;
  isMultilingual?: boolean;
}

export function isMultilingualVoice(voice: { id: string; name?: string; category?: string }): boolean {
  const idLower = (voice.id || '').toLowerCase();
  const nameLower = (voice.name || '').toLowerCase();
  return (
    idLower.includes('multilingual') ||
    nameLower.includes('multilingual') ||
    voice.category === 'Multilingual'
  );
}

const CURATED_VOICES: EnhancedVoice[] = [
  {
    id: 'en-US-AndrewMultilingualNeural',
    name: 'Andrew',
    gender: 'Male',
    locale: 'en-US',
    avatarColor: 'from-blue-600 to-indigo-600',
    category: 'Narrative',
    isMultilingual: true,
    accentDesc: 'American • Deep & Authoritative',
    sampleText: "Hi, I'm Andrew. I provide a deep, natural, and authoritative voice for your narrations.",
  },
  {
    id: 'en-US-AvaMultilingualNeural',
    name: 'Ava',
    gender: 'Female',
    locale: 'en-US',
    avatarColor: 'from-violet-600 to-fuchsia-600',
    category: 'Conversational',
    isMultilingual: true,
    accentDesc: 'American • Warm & Expressive',
    sampleText: "Hi there, I'm Ava! I love bringing stories and conversations to life with warmth and emotion.",
  },
  {
    id: 'en-US-BrianMultilingualNeural',
    name: 'Brian',
    gender: 'Male',
    locale: 'en-US',
    avatarColor: 'from-emerald-600 to-teal-600',
    category: 'Conversational',
    isMultilingual: true,
    accentDesc: 'American • Natural & Casual',
    sampleText: "Hey, I'm Brian. My tone is casual, friendly, and easy to listen to.",
  },
  {
    id: 'en-US-EmmaMultilingualNeural',
    name: 'Emma',
    gender: 'Female',
    locale: 'en-US',
    avatarColor: 'from-amber-600 to-orange-600',
    category: 'Narrative',
    isMultilingual: true,
    accentDesc: 'American • Calm & Eloquent',
    sampleText: "Hello, I'm Emma. I offer a calm, articulate voice ideal for audiobooks and learning materials.",
  },
  {
    id: 'en-GB-RyanNeural',
    name: 'Ryan',
    gender: 'Male',
    locale: 'en-GB',
    avatarColor: 'from-sky-600 to-blue-700',
    category: 'News',
    isMultilingual: false,
    accentDesc: 'British • Crisp & Professional',
    sampleText: "Good day, I'm Ryan. I deliver clear, professional British narration for news and reports.",
  },
  {
    id: 'en-GB-SoniaNeural',
    name: 'Sonia',
    gender: 'Female',
    locale: 'en-GB',
    avatarColor: 'from-pink-600 to-rose-600',
    category: 'Narrative',
    isMultilingual: false,
    accentDesc: 'British • Sophisticated & Clear',
    sampleText: "Hello, I'm Sonia. My voice is refined and sophisticated, suitable for storytelling and documentaries.",
  },
  {
    id: 'en-US-JennyNeural',
    name: 'Jenny',
    gender: 'Female',
    locale: 'en-US',
    avatarColor: 'from-cyan-600 to-blue-600',
    category: 'Conversational',
    isMultilingual: false,
    accentDesc: 'American • Friendly & Upbeat',
    sampleText: "Hey there! I'm Jenny, an upbeat and expressive voice ready for any project.",
  },
  {
    id: 'en-US-GuyNeural',
    name: 'Guy',
    gender: 'Male',
    locale: 'en-US',
    avatarColor: 'from-zinc-600 to-neutral-700',
    category: 'News',
    isMultilingual: false,
    accentDesc: 'American • Direct & Confident',
    sampleText: "Hello, I'm Guy. A strong, broadcast-ready voice with clean delivery.",
  },
  {
    id: 'fr-FR-VivienneMultilingualNeural',
    name: 'Vivienne',
    gender: 'Female',
    locale: 'fr-FR',
    avatarColor: 'from-rose-600 to-pink-600',
    category: 'Multilingual',
    isMultilingual: true,
    accentDesc: 'French • Melodic & Smooth',
    sampleText: "Bonjour, je suis Vivienne. Une voix fluide et naturelle pour tous vos projets.",
  },
  {
    id: 'de-DE-SeraphinaMultilingualNeural',
    name: 'Seraphina',
    gender: 'Female',
    locale: 'de-DE',
    avatarColor: 'from-amber-600 to-yellow-600',
    category: 'Multilingual',
    isMultilingual: true,
    accentDesc: 'German • Precise & Articulate',
    sampleText: "Hallo, ich bin Seraphina. Eine präzise und ausdrucksstarke deutsche Stimme.",
  },
  {
    id: 'es-ES-AlvaroNeural',
    name: 'Alvaro',
    gender: 'Male',
    locale: 'es-ES',
    avatarColor: 'from-orange-600 to-amber-600',
    category: 'Multilingual',
    isMultilingual: false,
    accentDesc: 'Spanish • Energetic & Warm',
    sampleText: 'Hola, soy Alvaro. Estoy listo para darle vida a tu texto con una voz clara y natural.',
  },
  {
    id: 'it-IT-GiuseppeNeural',
    name: 'Giuseppe',
    gender: 'Male',
    locale: 'it-IT',
    avatarColor: 'from-emerald-600 to-green-600',
    category: 'Multilingual',
    isMultilingual: false,
    accentDesc: 'Italian • Expressive & Rich',
    sampleText: 'Ciao, sono Giuseppe. Sono pronto a dare voce a i tuoi progetti con un tono naturale.',
  },
  {
    id: 'ja-JP-NanamiNeural',
    name: 'Nanami',
    gender: 'Female',
    locale: 'ja-JP',
    avatarColor: 'from-pink-600 to-rose-500',
    category: 'Multilingual',
    isMultilingual: false,
    accentDesc: 'Japanese • Gentle & Polished',
    sampleText: 'こんにちは、Nanamiです。自然で高品質な日本語音声をお届けします。',
  },
  {
    id: 'zh-CN-XiaoxiaoNeural',
    name: 'Xiaoxiao',
    gender: 'Female',
    locale: 'zh-CN',
    avatarColor: 'from-red-600 to-rose-600',
    category: 'Multilingual',
    isMultilingual: false,
    accentDesc: 'Chinese • Crisp & Clear',
    sampleText: '您好，我是Xiaoxiao。很高兴为您提供自然流畅的中文语音合成。',
  },
  {
    id: 'ar-SA-HamedNeural',
    name: 'Hamed',
    gender: 'Male',
    locale: 'ar-SA',
    avatarColor: 'from-emerald-700 to-teal-700',
    category: 'Multilingual',
    isMultilingual: false,
    accentDesc: 'Arabic (Saudi) • Deep & Eloquent',
    sampleText: 'مرحباً، أنا حامد. أقدم صوتاً عربياً فصيحاً وطبيعياً لمشاريعك الصوتية.',
  },
  {
    id: 'ar-EG-SalmaNeural',
    name: 'Salma',
    gender: 'Female',
    locale: 'ar-EG',
    avatarColor: 'from-amber-600 to-yellow-600',
    category: 'Multilingual',
    isMultilingual: false,
    accentDesc: 'Arabic (Egypt) • Warm & Expressive',
    sampleText: 'أهلاً بك، أنا سلمى. يسعدني تقديم صوت عربي واضح ومميز لكل نصوصك.',
  },
];

const PROMPT_PRESETS = [
  {
    label: 'Story Narration',
    text: 'Beyond the crest of the quiet valley, the observatory telescope slowly rotated toward the Andromeda nebula, capturing light that had traversed millions of light-years.',
  },
  {
    label: 'Tech Announcement',
    text: 'We are thrilled to unveil our new zero-cost speech synthesis engine, engineered for low-latency neural synthesis and pristine acoustic fidelity.',
  },
  {
    label: 'Podcast Intro',
    text: 'Welcome back to Sound & Vision. In today’s episode, we explore the boundary between human perception and computational acoustics.',
  },
  {
    label: 'Audiobook Excerpt',
    text: 'The evening mist began to settle over the cobblestone streets as the distant clock tower struck nine.',
  },
];

function getNativePreviewText(voice: EnhancedVoice): string {
  if (voice.sampleText) {
    return voice.sampleText;
  }

  const langCode = (voice.locale || voice.id.split('-')[0] || 'en').toLowerCase().slice(0, 2);
  const name = voice.name || 'Voice';

  switch (langCode) {
    case 'ar':
      return `مرحباً، أنا ${name}. أقدم صوتاً عربياً طبيعياً وواضحاً لجميع نصوصك.`;
    case 'ja':
      return `こんにちは、${name}です。自然で高品質な音声をお届けします。`;
    case 'zh':
      return `您好，我是${name}。很高兴为您提供清晰自然的语音播报。`;
    case 'ko':
      return `안녕하세요, ${name}입니다. 자연스럽고 선명한 목소리로 전달해 드립니다.`;
    case 'es':
      return `Hola, soy ${name}. Estoy listo para darle vida a tu texto con una voz clara y natural.`;
    case 'fr':
      return `Bonjour, je suis ${name}. Une voix fluide et naturelle pour tous vos projets.`;
    case 'de':
      return `Hallo, ich bin ${name}. Eine präzise und ausdrucksstarke Stimme für Ihre Texte.`;
    case 'it':
      return `Ciao, sono ${name}. Sono pronto a dare voce a i tuoi progetti con un tono naturale.`;
    case 'pt':
      return `Olá, eu sou ${name}. Uma voz expressiva e natural para suas produções de áudio.`;
    case 'ru':
      return `Здравствуйте, я ${name}. Буду рад качественно и выразительно озвучить ваш текст.`;
    case 'hi':
      return `नमस्ते, मैं ${name} हूँ। आपकी आवाज़ और कहानियों को सजीव बनाने के लिए तैयार हूँ।`;
    default:
      return `Hello! I'm ${name}, ready to generate high-fidelity speech for your project.`;
  }
}

export const TtsPanel: React.FC<Props> = ({ onAddToHistory, initialText }) => {
  const [text, setText] = useState<string>(
    initialText ||
      'In the realm of generative audio, acoustic fidelity meets algorithmic precision. Text transforms seamlessly into expressive neural speech with zero latency.'
  );

  const [selectedVoice, setSelectedVoice] = useState<string>('en-US-AndrewMultilingualNeural');
  const [rate, setRate] = useState<number>(0); // -100 to +100%
  const [pitch, setPitch] = useState<number>(0); // -100 to +100%
  const [volume, setVolume] = useState<number>(0); // -100 to +100%

  // ElevenLabs advanced settings sliders
  const [stability, setStability] = useState<number>(75);
  const [clarity, setClarity] = useState<number>(85);
  const [styleExaggeration, setStyleExaggeration] = useState<number>(0);
  const [speakerBoost, setSpeakerBoost] = useState<boolean>(true);

  const [allVoices, setAllVoices] = useState<EnhancedVoice[]>(CURATED_VOICES);
  const [voiceSearch, setVoiceSearch] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('All');
  const [onlyMultilingual, setOnlyMultilingual] = useState<boolean>(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('Synthesizing audio...');
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Fast In-Memory Audition Cache & Audio Player
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewCacheRef = useRef<Map<string, string>>(new Map());
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Setup preview audio listener
  useEffect(() => {
    const audio = new Audio();
    previewAudioRef.current = audio;

    const handleEnded = () => {
      setPreviewingVoiceId(null);
    };
    const handlePause = () => {
      setPreviewingVoiceId(null);
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.pause();
    };
  }, []);

  const handlePreviewVoice = async (voice: EnhancedVoice, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    if (previewingVoiceId === voice.id) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setPreviewingVoiceId(null);
      return;
    }

    try {
      setLoadingPreviewId(voice.id);
      let audioUrl = previewCacheRef.current.get(voice.id);

      if (!audioUrl) {
        const sampleText = getNativePreviewText(voice);

        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: sampleText,
            voice: voice.id,
            rate: '+0%',
            pitch: '+0Hz',
            volume: '+0%',
          }),
        });

        const data = await response.json();
        const auditionAudioUrl = data.audioBase64 || data.audioUrl;
        if (!data.success || !auditionAudioUrl) {
          throw new Error(data.error || 'Failed to generate voice audition');
        }

        audioUrl = auditionAudioUrl;
        previewCacheRef.current.set(voice.id, audioUrl);
      }

      if (previewAudioRef.current && audioUrl) {
        previewAudioRef.current.src = audioUrl;
        previewAudioRef.current.playbackRate = 1.0;
        try {
          await previewAudioRef.current.play();
          setPreviewingVoiceId(voice.id);
        } catch (playErr: any) {
          if (playErr.name !== 'AbortError' && !playErr.message?.includes('interrupted')) {
            console.warn('Audition playback notice:', playErr);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && !err.message?.includes('interrupted')) {
        console.warn('Audition error:', err);
      }
    } finally {
      setLoadingPreviewId(null);
    }
  };

  useEffect(() => {
    if (initialText) {
      setText(initialText);
    }
  }, [initialText]);

  useEffect(() => {
    fetch('/api/voices')
      .then((res) => res.json())
      .then((data) => {
        if (data.voices && Array.isArray(data.voices)) {
          const existingIds = new Set(CURATED_VOICES.map((v) => v.id));
          const colors = [
            'from-blue-600 to-indigo-600',
            'from-violet-600 to-fuchsia-600',
            'from-emerald-600 to-teal-600',
            'from-amber-600 to-orange-600',
            'from-rose-600 to-pink-600',
            'from-cyan-600 to-blue-600',
          ];
          const additional: EnhancedVoice[] = data.voices
            .filter((v: VoiceItem) => !existingIds.has(v.id))
            .map((v: VoiceItem, idx: number) => {
              const isMulti = isMultilingualVoice(v);
              return {
                ...v,
                avatarColor: colors[idx % colors.length],
                isMultilingual: isMulti,
                category: isMulti
                  ? 'Multilingual'
                  : v.locale.startsWith('en')
                  ? 'Conversational'
                  : 'Multilingual',
                accentDesc: isMulti
                  ? `${v.locale} • Multilingual Neural`
                  : `${v.locale} • ${v.gender}`,
              };
            });
          setAllVoices([...CURATED_VOICES, ...additional]);
        }
      })
      .catch((e) => console.warn('Could not fetch external voices:', e));
  }, []);

  const handleGenerate = async () => {
    if (!text.trim()) {
      setErrorMsg('Please enter some text to synthesize.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setLoadingStep('Dispatching to neural synthesizer...');
    const startTime = performance.now();

    try {
      const rateStr = rate >= 0 ? `+${rate}%` : `${rate}%`;
      const pitchStr = pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`;
      const volumeStr = volume >= 0 ? `+${volume}%` : `${volume}%`;

      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voice: selectedVoice,
          rate: rateStr,
          pitch: pitchStr,
          volume: volumeStr,
        }),
      });

      const data = await response.json();
      const finalAudioUrl = data.audioBase64 || data.audioUrl;

      if (!response.ok || !data.success || !finalAudioUrl) {
        throw new Error(data.error || 'Speech synthesis failed. Please try another voice or phrase.');
      }

      const elapsed = Math.round(performance.now() - startTime);
      setLatencyMs(elapsed);
      setGeneratedAudio(finalAudioUrl);

      const voiceObj = allVoices.find((v) => v.id === selectedVoice) || CURATED_VOICES[0];
      onAddToHistory({
        type: 'tts',
        title: text.slice(0, 48) + (text.length > 48 ? '...' : ''),
        text: text,
        audioUrl: finalAudioUrl,
        voiceOrModel: `${voiceObj.name} (${voiceObj.locale})`,
        durationSeconds: Math.max(1, Math.round(text.split(' ').length / 2.5)),
        parameters: { rate: rateStr, pitch: pitchStr, volume: volumeStr },
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to synthesize speech.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleResetSettings = () => {
    setRate(0);
    setPitch(0);
    setVolume(0);
    setStability(75);
    setClarity(85);
    setStyleExaggeration(0);
    setSpeakerBoost(true);
  };

  const multilingualVoicesCount = allVoices.filter((v) => v.isMultilingual ?? isMultilingualVoice(v)).length;

  const filteredVoices = allVoices.filter((v) => {
    const isMulti = v.isMultilingual ?? isMultilingualVoice(v);

    if (onlyMultilingual && !isMulti) {
      return false;
    }

    const matchesSearch =
      v.id.toLowerCase().includes(voiceSearch.toLowerCase()) ||
      v.name.toLowerCase().includes(voiceSearch.toLowerCase()) ||
      v.locale.toLowerCase().includes(voiceSearch.toLowerCase()) ||
      v.accentDesc.toLowerCase().includes(voiceSearch.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedCategoryFilter === 'All') return true;
    if (selectedCategoryFilter === 'Multilingual') return isMulti;
    return v.category === selectedCategoryFilter;
  });

  const selectedVoiceObj = allVoices.find((v) => v.id === selectedVoice) || CURATED_VOICES[0];
  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.max(1, Math.round(wordCount / 2.6));

  return (
    <div id="eleven-tts-studio" className="w-full flex flex-col gap-6">
      {/* Studio Card Canvas */}
      <div className="relative bg-[#0C0E14] border border-white/[0.08] rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden">
        {/* Top Voice & Settings Control Bar */}
        <div className="p-4 sm:p-5 border-b border-white/[0.07] bg-[#0E1118]/80 flex flex-wrap items-center justify-between gap-3">
          {/* Voice Selector Pill */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.09] rounded-xl p-1.5 transition-all">
              <button
                id="voice-select-trigger"
                type="button"
                onClick={() => setIsVoiceModalOpen(true)}
                className="flex items-center gap-2.5 px-1.5 py-0.5 group text-left cursor-pointer"
              >
                {/* Voice Avatar Icon */}
                <div
                  className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${selectedVoiceObj.avatarColor} flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm`}
                >
                  {selectedVoiceObj.name.slice(0, 2).toUpperCase()}
                </div>

                <div className="flex flex-col min-w-0 pr-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white group-hover:text-neutral-200 transition-colors truncate">
                      {selectedVoiceObj.name}
                    </span>
                    {(selectedVoiceObj.isMultilingual ?? isMultilingualVoice(selectedVoiceObj)) ? (
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-0.5">
                        <Globe className="w-2.5 h-2.5" />
                        <span>Multilingual</span>
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-neutral-400">
                        {selectedVoiceObj.locale}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-neutral-400 truncate">
                    {selectedVoiceObj.accentDesc}
                  </span>
                </div>

                <ChevronDown className="w-3.5 h-3.5 text-neutral-400 group-hover:text-white transition-transform" />
              </button>

              {/* Inline Voice Preview Button */}
              <button
                type="button"
                onClick={(e) => handlePreviewVoice(selectedVoiceObj, e)}
                title={previewingVoiceId === selectedVoiceObj.id ? 'Stop preview' : 'Audition voice sample'}
                className={`p-1.5 rounded-lg border transition-all flex items-center justify-center ${
                  previewingVoiceId === selectedVoiceObj.id
                    ? 'bg-white text-black border-white shadow-sm'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white border-white/[0.08]'
                }`}
              >
                {loadingPreviewId === selectedVoiceObj.id ? (
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : previewingVoiceId === selectedVoiceObj.id ? (
                  <Pause className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5 text-neutral-200" />
                )}
              </button>
            </div>

            {/* Multilingual Safe Filter Toggle Pill */}
            <button
              id="multilingual-quick-toggle"
              type="button"
              onClick={() => {
                const nextVal = !onlyMultilingual;
                setOnlyMultilingual(nextVal);
                if (nextVal && !(selectedVoiceObj.isMultilingual ?? isMultilingualVoice(selectedVoiceObj))) {
                  setSelectedVoice('en-US-AndrewMultilingualNeural');
                }
              }}
              className={`px-3 py-2 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all ${
                onlyMultilingual
                  ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-200 shadow-sm'
                  : 'bg-white/[0.03] border-white/[0.08] text-neutral-400 hover:text-white hover:bg-white/[0.06]'
              }`}
              title="Show only cross-language Multilingual models to prevent gibberish"
            >
              <Globe className={`w-3.5 h-3.5 ${onlyMultilingual ? 'text-indigo-400' : 'text-neutral-400'}`} />
              <span className="text-xs">Multilingual Only</span>
              {onlyMultilingual && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              )}
            </button>

            {/* Voice Settings Drawer Toggle Pill */}
            <button
              type="button"
              onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
              className={`px-3 py-2 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all ${
                showSettingsDrawer
                  ? 'bg-white text-black font-semibold border-white shadow-sm'
                  : 'bg-white/[0.03] border-white/[0.08] text-neutral-300 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Voice Settings</span>
              {(rate !== 0 || pitch !== 0 || stability !== 75 || clarity !== 85) && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              )}
            </button>
          </div>

          {/* Quick Preset Prompts Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-neutral-500 hidden sm:inline">Presets:</span>
            <div className="flex items-center gap-1 overflow-x-auto">
              {PROMPT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setText(p.text)}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-neutral-400 hover:text-neutral-200 border border-white/[0.06] transition-colors whitespace-nowrap"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Expandable Voice Settings Drawer (ElevenLabs Style) */}
        <AnimatePresence>
          {showSettingsDrawer && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden border-b border-white/[0.07] bg-[#0A0C12]"
            >
              <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 text-xs">
                {/* Stability */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-neutral-300">
                    <span className="font-medium">Stability</span>
                    <span className="font-mono text-neutral-400">{stability}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={stability}
                    onChange={(e) => setStability(Number(e.target.value))}
                    className="w-full h-1 bg-white/[0.1] rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-500">
                    <span>Variable / Dynamic</span>
                    <span>Consistent</span>
                  </div>
                </div>

                {/* Clarity + Similarity */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-neutral-300">
                    <span className="font-medium">Clarity + Similarity</span>
                    <span className="font-mono text-neutral-400">{clarity}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={clarity}
                    onChange={(e) => setClarity(Number(e.target.value))}
                    className="w-full h-1 bg-white/[0.1] rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-500">
                    <span>Low</span>
                    <span>High Fidelity</span>
                  </div>
                </div>

                {/* Speed Modulation */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-neutral-300">
                    <span className="font-medium">Speech Rate</span>
                    <span className="font-mono text-neutral-400">
                      {rate >= 0 ? `+${rate}%` : `${rate}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    step="5"
                    value={rate}
                    onChange={(e) => setRate(Number(e.target.value))}
                    className="w-full h-1 bg-white/[0.1] rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-500">
                    <span>Slower (-50%)</span>
                    <span>Faster (+50%)</span>
                  </div>
                </div>

                {/* Pitch Modulation */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-neutral-300">
                    <span className="font-medium">Pitch Offset</span>
                    <span className="font-mono text-neutral-400">
                      {pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-40"
                    max="40"
                    step="2"
                    value={pitch}
                    onChange={(e) => setPitch(Number(e.target.value))}
                    className="w-full h-1 bg-white/[0.1] rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-500">
                    <span>Deeper (-40Hz)</span>
                    <span>Higher (+40Hz)</span>
                  </div>
                </div>

                {/* Drawer Footer Actions */}
                <div className="col-span-full pt-2 flex items-center justify-between border-t border-white/[0.05]">
                  <span className="text-[11px] text-neutral-500">
                    Engine: <strong className="text-neutral-300">Microsoft Edge 48kHz Neural Architecture</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleResetSettings}
                    className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Defaults</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Text Prompt Editor Area */}
        <div className="p-5 sm:p-6 flex flex-col gap-3">
          <div className="relative">
            <textarea
              ref={textareaRef}
              id="tts-text-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type or paste your script here..."
              rows={6}
              maxLength={5000}
              className="w-full bg-transparent border-none text-white text-base leading-relaxed placeholder-neutral-600 focus:outline-none resize-none font-sans font-normal"
            />
          </div>

          {/* Quick Utility Actions Row */}
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.05] text-xs text-neutral-400">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const clip = await navigator.clipboard.readText();
                    if (clip) setText(clip);
                  } catch (e) {
                    console.warn(e);
                  }
                }}
                className="hover:text-white transition-colors flex items-center gap-1"
                title="Paste from clipboard"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Paste</span>
              </button>

              <button
                type="button"
                onClick={() => setText('')}
                className="hover:text-white transition-colors flex items-center gap-1"
                title="Clear text"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            </div>

            <div className="flex items-center gap-3 font-mono text-[11px] text-neutral-500">
              <span>{wordCount} words</span>
              <span>•</span>
              <span>~{estimatedSeconds}s</span>
              <span>•</span>
              <span className={charCount > 4500 ? 'text-amber-400' : 'text-neutral-400'}>
                {charCount.toLocaleString()} / 5,000
              </span>
            </div>
          </div>
        </div>

        {/* Studio Bottom Bar with Primary Generation Trigger */}
        <div className="p-4 sm:p-5 border-t border-white/[0.07] bg-[#0A0C12] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          {/* Model Specification Indicator */}
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-medium text-neutral-300">Eleven Multilingual v2</span>
            <span className="text-neutral-600">•</span>
            <span className="text-neutral-500 font-mono">48kHz MP3 Stream</span>
          </div>

          {/* Primary Action Button */}
          <div className="flex items-center gap-2.5">
            <motion.button
              id="tts-generate-btn"
              type="button"
              onClick={handleGenerate}
              disabled={isLoading || !text.trim()}
              whileHover={{ scale: isLoading ? 1 : 1.01 }}
              whileTap={{ scale: isLoading ? 1 : 0.99 }}
              className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg ${
                isLoading || !text.trim()
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
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <span>Generate Speech</span>
                  <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-black/10 text-black/70 rounded">
                    ⌘ ↵
                  </kbd>
                </>
              )}
            </motion.button>
          </div>
        </div>
      </div>

      {/* Error Message Toast */}
      {errorMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center justify-between gap-3"
        >
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* Generated Audio Player Output */}
      {generatedAudio && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <AudioPlayer
            src={generatedAudio}
            title={text.slice(0, 42) + (text.length > 42 ? '...' : '')}
            subtitle={`${selectedVoiceObj.name} (${selectedVoiceObj.locale}) • ${latencyMs ? `${latencyMs}ms latency` : 'Synthesized Output'}`}
            onDownloadFilename={`eleven_open_${selectedVoiceObj.name.toLowerCase()}_${Date.now()}.mp3`}
            autoPlay={true}
          />
        </motion.div>
      )}

      {/* ElevenLabs Voice Library Modal */}
      <AnimatePresence>
        {isVoiceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-[#0D0F15] border border-white/[0.1] rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-white/[0.07] flex items-center justify-between bg-[#0F121A]">
                <div>
                  <h3 className="text-base font-semibold text-white tracking-tight">Voice Library</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Select an acoustic persona or preview native speech samples.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsVoiceModalOpen(false)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search & Filter Bar */}
              <div className="p-4 border-b border-white/[0.07] flex flex-col gap-3 bg-[#0A0C12]">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="flex-1 flex items-center gap-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 py-2">
                    <Search className="w-4 h-4 text-neutral-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Search by voice name, locale (e.g. en-US, ar-SA), or style..."
                      value={voiceSearch}
                      onChange={(e) => setVoiceSearch(e.target.value)}
                      className="bg-transparent border-none text-sm text-white placeholder-neutral-500 focus:outline-none w-full font-sans"
                    />
                    {voiceSearch && (
                      <button onClick={() => setVoiceSearch('')} className="text-neutral-500 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Multilingual Filter Toggle */}
                  <button
                    type="button"
                    onClick={() => setOnlyMultilingual(!onlyMultilingual)}
                    className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono border transition-all whitespace-nowrap ${
                      onlyMultilingual
                        ? 'bg-indigo-600/25 border-indigo-400/60 text-indigo-200 shadow-sm'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-neutral-300 hover:text-white'
                    }`}
                  >
                    <Globe className={`w-3.5 h-3.5 ${onlyMultilingual ? 'text-indigo-400' : 'text-neutral-400'}`} />
                    <span>Multilingual Only</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-neutral-300 font-mono">
                      {multilingualVoicesCount}
                    </span>
                  </button>
                </div>

                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-medium scrollbar-none">
                  {[
                    { id: 'All', label: 'All Voices', count: allVoices.length },
                    { id: 'Multilingual', label: 'Multilingual Only', count: multilingualVoicesCount },
                    { id: 'Narrative', label: 'Narrative' },
                    { id: 'Conversational', label: 'Conversational' },
                    { id: 'News', label: 'News / Broadcast' },
                  ].map((cat) => {
                    const isCatActive = selectedCategoryFilter === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setSelectedCategoryFilter(cat.id);
                          if (cat.id === 'Multilingual') {
                            setOnlyMultilingual(true);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                          isCatActive
                            ? 'bg-white text-black font-semibold'
                            : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                        }`}
                      >
                        <span>{cat.label}</span>
                        {cat.count !== undefined && (
                          <span className={`text-[10px] px-1 rounded ${
                            isCatActive ? 'bg-black/15 text-black' : 'bg-white/10 text-neutral-400'
                          }`}>
                            {cat.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Voices Grid */}
              <div className="p-4 overflow-y-auto max-h-[50vh] grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredVoices.length === 0 ? (
                  <div className="col-span-full py-12 flex flex-col items-center justify-center text-center gap-3">
                    <Filter className="w-8 h-8 text-neutral-600" />
                    <div>
                      <p className="text-sm font-semibold text-neutral-300">No matching voices found</p>
                      <p className="text-xs text-neutral-500 mt-1">Try clearing your search query or filters.</p>
                    </div>
                    <button
                      onClick={() => {
                        setVoiceSearch('');
                        setSelectedCategoryFilter('All');
                        setOnlyMultilingual(false);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-mono text-white transition-colors"
                    >
                      Reset All Filters
                    </button>
                  </div>
                ) : (
                  filteredVoices.map((v) => {
                    const isSelected = selectedVoice === v.id;
                    const isPreviewing = previewingVoiceId === v.id;
                    const isLoadingPreview = loadingPreviewId === v.id;
                    const isMulti = v.isMultilingual ?? isMultilingualVoice(v);

                    return (
                      <div
                        key={v.id}
                        onClick={() => {
                          setSelectedVoice(v.id);
                          setIsVoiceModalOpen(false);
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                          isSelected
                            ? 'bg-white/[0.08] border-white/[0.3] text-white shadow-sm'
                            : 'bg-[#12151D] border-white/[0.06] hover:border-white/[0.18] hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${v.avatarColor} flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm relative`}
                          >
                            {v.name.slice(0, 2).toUpperCase()}
                            {isPreviewing && (
                              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-semibold text-white truncate group-hover:text-neutral-200 transition-colors">
                                {v.name}
                              </span>
                              {isMulti ? (
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-0.5">
                                  <Globe className="w-2.5 h-2.5" />
                                  <span>Multilingual</span>
                                </span>
                              ) : (
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-neutral-400">
                                  {v.gender}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                              {v.accentDesc}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {/* Audition Button */}
                          <button
                            type="button"
                            onClick={(e) => handlePreviewVoice(v, e)}
                            title={isPreviewing ? 'Stop preview' : 'Audition voice'}
                            className={`p-2 rounded-lg border transition-all flex items-center justify-center ${
                              isPreviewing
                                ? 'bg-white text-black border-white shadow-sm'
                                : 'bg-white/[0.04] hover:bg-white/[0.1] text-neutral-300 hover:text-white border-white/[0.08]'
                            }`}
                          >
                            {isLoadingPreview ? (
                              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : isPreviewing ? (
                              <Pause className="w-3.5 h-3.5 fill-current" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current text-neutral-300" />
                            )}
                          </button>

                          {isSelected ? (
                            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-black">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          ) : (
                            <span className="text-[11px] font-mono text-neutral-500 group-hover:text-neutral-300 hidden sm:inline">
                              Select
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-white/[0.07] bg-[#0A0C12] flex items-center justify-between text-xs text-neutral-400">
                <span>Showing {filteredVoices.length} voices</span>
                <button
                  type="button"
                  onClick={() => setIsVoiceModalOpen(false)}
                  className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold hover:bg-neutral-200 transition-colors"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
