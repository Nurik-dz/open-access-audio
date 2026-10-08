export type SuiteTab = 'tts' | 'clone' | 'sfx' | 'visuals' | 'video' | 'stt' | 'history';

export interface VoiceItem {
  id: string;
  name: string;
  gender: 'Male' | 'Female' | string;
  locale: string;
  friendlyName?: string;
}

export interface TtsSettings {
  voice: string;
  rate: number; // -50 to +100 (%)
  pitch: number; // -50 to +50 (Hz)
  volume: number; // -50 to +50 (%)
}

export interface HistoryItem {
  id: string;
  type: 'tts' | 'stt' | 'clone' | 'sfx' | 'ambient' | 'image' | 'video';
  timestamp: number;
  title: string;
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  voiceOrModel?: string;
  language?: string;
  durationSec?: number;
  dimensions?: string;
}
