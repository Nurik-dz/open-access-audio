import React from 'react';
import { motion } from 'motion/react';

interface Props {
  isLoading: boolean;
  label?: string;
}

export const IndeterminateLoader: React.FC<Props> = ({ isLoading, label }) => {
  if (!isLoading) return null;

  return (
    <div id="indeterminate-loader-container" className="w-full relative overflow-hidden h-[3px] bg-white/5">
      <motion.div
        id="indeterminate-loader-bar"
        className="absolute top-0 bottom-0 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
        initial={{ left: "-40%", width: "40%" }}
        animate={{
          left: ["-40%", "100%"],
          width: ["30%", "60%", "30%"]
        }}
        transition={{
          repeat: Infinity,
          duration: 1.4,
          ease: [0.65, 0, 0.35, 1],
        }}
      />
      {label && (
        <div className="absolute right-2 top-2 text-[10px] uppercase font-mono tracking-widest text-neutral-400">
          {label}
        </div>
      )}
    </div>
  );
};
