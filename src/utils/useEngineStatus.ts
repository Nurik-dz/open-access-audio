import { useEffect, useState } from 'react';

export type EngineState = 'checking' | 'ok' | 'degraded' | 'offline';

export interface EngineHealth {
  state: EngineState;
  /** Problems the user can act on (missing FFmpeg, Python packages, ...). */
  warnings: string[];
}

const POLL_MS = 60_000;

/** Polls /api/health so the UI reflects whether the audio engine is really usable. */
export function useEngineStatus(): EngineHealth {
  const [health, setHealth] = useState<EngineHealth>({ state: 'checking', warnings: [] });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        if (cancelled) return;
        const warnings: string[] = data?.engine?.warnings ?? [];
        setHealth({ state: data?.status === 'ok' ? 'ok' : 'degraded', warnings });
      } catch {
        if (!cancelled) setHealth({ state: 'offline', warnings: ['Cannot reach the server.'] });
      }
    };

    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return health;
}
