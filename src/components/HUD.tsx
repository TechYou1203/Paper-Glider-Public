import React from 'react';
import { Pause, Volume2, VolumeX } from 'lucide-react';

interface HUDProps {
  score: number;
  highScore: number;
  paperclips: number;
  flightPaperclips: number;
  soundEnabled: boolean;
  onPause: () => void;
  onToggleSound: () => void;
  showTapHint?: boolean;
}

export const HUD: React.FC<HUDProps> = ({
  score,
  highScore,
  paperclips,
  flightPaperclips,
  soundEnabled,
  onPause,
  onToggleSound,
  showTapHint,
}) => {
  return (
    <div className="absolute inset-0 pointer-events-none select-none p-2.5 sm:p-4 flex flex-col justify-between">
      {/* Top Perimeter Cluster */}
      <div className="w-full flex justify-between items-start gap-1 sm:gap-2">
        {/* Left Cluster: Stats */}
        <div className="flex flex-col gap-1 sm:gap-1.5 pointer-events-auto">
          {/* Best Score Pip */}
          <div className="flex items-center gap-1.5 bg-[#fffef9] border-2 border-[#2d2a26] px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full shadow-[2px_2px_0px_#2d2a26]">
            <span className="font-sketch text-[11px] sm:text-xs font-bold text-[#64748b] tracking-wider uppercase">BEST</span>
            <span className="font-title text-base sm:text-xl font-bold text-[#2d2a26] tabular-nums">{highScore}</span>
          </div>

          {/* Paperclip counter */}
          <div className="flex items-center gap-1.5 bg-[#fffef9] border-2 border-[#2d2a26] px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full shadow-[2px_2px_0px_#2d2a26]">
            <span className="text-xs sm:text-sm">📎</span>
            <span className="font-sketch text-xs sm:text-sm font-bold text-[#2d2a26] tabular-nums">
              {paperclips + flightPaperclips}
            </span>
          </div>
        </div>

        {/* Center: Big Hero Score (Sketchbook font with high visibility) */}
        <div className="flex flex-col items-center">
          <div className="bg-[#fffef9] border-2 sm:border-3 border-[#2d2a26] px-4 sm:px-6 py-0.5 sm:py-1.5 rounded-2xl shadow-[3px_3px_0px_#2d2a26] sm:shadow-[4px_4px_0px_#2d2a26]">
            <span className="font-title text-4xl sm:text-6xl font-black text-[#1e293b] tabular-nums tracking-wider">
              {score}
            </span>
          </div>
        </div>

        {/* Right Cluster: Quick Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          <button
            onClick={onToggleSound}
            aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'}
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-[#fffef9] hover:bg-[#f1f5f9] border-2 border-[#2d2a26] rounded-xl shadow-[2px_2px_0px_#2d2a26] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer text-[#2d2a26] transition-transform"
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          <button
            onClick={onPause}
            aria-label="Pause game"
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-[#fffef9] hover:bg-[#f1f5f9] border-2 border-[#2d2a26] rounded-xl shadow-[2px_2px_0px_#2d2a26] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer text-[#2d2a26] transition-transform"
          >
            <Pause size={16} />
          </button>
        </div>
      </div>

      {/* Floating Gentle Initial Tap Hint */}
      {showTapHint && (
        <div className="self-center mb-16 animate-pulse">
          <div className="bg-[#fffef9]/90 border-2 border-[#2d2a26] px-4 sm:px-5 py-1.5 sm:py-2 rounded-full shadow-[3px_3px_0px_#2d2a26] text-center">
            <p className="font-sketch text-base sm:text-lg font-bold text-[#1e293b]">
              TAP SCREEN OR SPACE TO FLAP
            </p>
          </div>
        </div>
      )}

      {/* Empty bottom space to guarantee >=85% clear viewport */}
      <div className="h-4" />
    </div>
  );
};
