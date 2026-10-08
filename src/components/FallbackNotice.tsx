import React from 'react';
import { Info } from 'lucide-react';

interface Props {
  title: string;
  children: React.ReactNode;
  /** Technical reason the preferred path was skipped (shown muted, truncated). */
  detail?: string;
}

/**
 * Shown when a result came from a local fallback rather than the model the user might
 * expect, so the UI never implies more than what actually ran.
 */
export const FallbackNotice: React.FC<Props> = ({ title, children, detail }) => (
  <div
    role="status"
    className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-100/80"
  >
    <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-300" />
    <div className="min-w-0">
      <div className="font-semibold text-amber-200">{title}</div>
      <div className="mt-0.5 text-neutral-300">{children}</div>
      {detail && (
        <div className="mt-1 truncate font-mono text-[10px] text-neutral-500" title={detail}>
          Reason: {detail}
        </div>
      )}
    </div>
  </div>
);
