import React from 'react';
import { Play, RotateCcw, Home } from 'lucide-react';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onHome: () => void;
  score: number;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onHome,
  score,
}) => {
  return (
    <div className="absolute inset-0 bg-[#2d2a26]/40 flex items-center justify-center p-4 z-20 select-none">
      <div className="bg-[#fffef9] border-3 border-[#2d2a26] rounded-2xl shadow-[6px_6px_0px_#2d2a26] p-6 max-w-sm w-full text-center">
        <h2 className="font-title text-4xl font-extrabold text-[#1e293b] mb-1">
          Flight Paused
        </h2>
        <p className="font-sketch text-base font-bold text-[#64748b] mb-6">
          Glider held at waypoint · Score: <span className="text-[#1e293b] font-title text-xl tabular-nums">{score}</span>
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={onResume}
            className="flex items-center justify-center gap-2 py-3 bg-[#fde047] hover:bg-[#facc15] active:translate-x-0.5 active:translate-y-0.5 text-[#1e293b] font-sketch text-xl font-bold border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] cursor-pointer"
          >
            <Play size={20} className="fill-[#1e293b]" />
            Resume Flight
          </button>

          <button
            onClick={onRestart}
            className="flex items-center justify-center gap-2 py-2.5 bg-[#ffffff] hover:bg-[#f8fafc] active:translate-x-0.5 active:translate-y-0.5 text-[#2d2a26] font-sketch text-lg font-bold border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] cursor-pointer"
          >
            <RotateCcw size={18} />
            Restart Run
          </button>

          <button
            onClick={onHome}
            className="flex items-center justify-center gap-2 py-2.5 bg-[#ffffff] hover:bg-[#f8fafc] active:translate-x-0.5 active:translate-y-0.5 text-[#64748b] font-sketch text-lg font-bold border-2 border-[#2d2a26] rounded-xl shadow-[3px_3px_0px_#2d2a26] cursor-pointer"
          >
            <Home size={18} />
            Back to Title
          </button>
        </div>
      </div>
    </div>
  );
};
