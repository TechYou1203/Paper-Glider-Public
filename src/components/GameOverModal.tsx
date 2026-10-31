import React, { useState } from 'react';
import { RotateCcw, Trophy, Calendar, Home, Check } from 'lucide-react';

interface GameOverModalProps {
  score: number;
  highScore: number;
  isNewBest: boolean;
  flightPaperclips: number;
  callsign: string;
  onRestart: () => void;
  onHome: () => void;
  onOpenLeaderboard: () => void;
  onOpenChallenges: () => void;
  onUpdateCallsign: (newCallsign: string) => void;
  verifiedRank?: number | null;
  isOnline?: boolean;
  isGuest?: boolean;
  onOpenAuth?: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  score,
  highScore,
  isNewBest,
  flightPaperclips,
  callsign,
  onRestart,
  onHome,
  onOpenLeaderboard,
  onOpenChallenges,
  onUpdateCallsign,
  verifiedRank = null,
  isOnline = false,
  isGuest = false,
  onOpenAuth,
}) => {
  const [editingCallsign, setEditingCallsign] = useState(callsign);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveCallsign = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCallsign.trim()) {
      onUpdateCallsign(editingCallsign.trim());
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    }
  };

  return (
    <div className="absolute inset-0 bg-[#2d2a26]/50 flex items-center justify-center p-4 z-20 select-none overflow-y-auto">
      <div className="bg-[#fffef9] border-3 border-[#2d2a26] rounded-2xl shadow-[6px_6px_0px_#2d2a26] p-6 max-w-sm w-full text-center my-auto">
        {/* Header */}
        <h2 className="font-title text-4xl sm:text-5xl font-extrabold text-[#1e293b] leading-tight">
          Sketchbook Crash!
        </h2>
        <p className="font-sketch text-sm font-bold text-[#64748b] -mt-1 mb-5">
          Your glider clipped a graphite barrier
        </p>

        {/* Score Card Tile */}
        <div className="bg-[#faf8f0] border-2 border-[#2d2a26] rounded-xl p-4 mb-4 relative shadow-[2px_2px_0px_#2d2a26]">
          {isNewBest && (
            <div className="absolute -top-3.5 right-4 bg-[#ef4444] text-white font-sketch text-xs font-black tracking-wider px-2.5 py-0.5 rounded-full border border-[#2d2a26] shadow-[2px_2px_0px_#2d2a26] animate-bounce">
              ★ NEW BEST! ★
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="border-r border-[#e2e8f0] pr-2">
              <span className="block font-sketch text-xs font-bold text-[#64748b] uppercase tracking-wider">
                Score
              </span>
              <span className="font-title text-5xl font-black text-[#1e293b] tabular-nums">
                {score}
              </span>
            </div>

            <div className="pl-2">
              <span className="block font-sketch text-xs font-bold text-[#64748b] uppercase tracking-wider">
                All-Time Best
              </span>
              <span className="font-title text-5xl font-black text-[#eab308] tabular-nums">
                {highScore}
              </span>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[#e2e8f0] flex items-center justify-between text-sm">
            <span className="font-sketch font-bold text-[#64748b]">Paperclips Collected:</span>
            <span className="font-sketch font-bold text-[#2d2a26] flex items-center gap-1 tabular-nums">
              <span>📎</span> +{flightPaperclips}
            </span>
          </div>

          {verifiedRank != null && (
            <div className="mt-2.5 pt-2 border-t border-[#e2e8f0] text-center">
              <span className="inline-block bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full px-2.5 py-0.5 text-xs font-sketch font-bold">
                ✓ Verified by Neon Cloud: Global Rank #{verifiedRank}!
              </span>
            </div>
          )}
        </div>

        {/* Pilot Callsign Form */}
        <form onSubmit={handleSaveCallsign} className="mb-3">
          <label htmlFor="callsign-input" className="block text-left font-sketch text-xs font-bold text-[#64748b] mb-1 uppercase tracking-wider">
            Pilot Callsign (Leaderboard):
          </label>
          <div className="flex gap-2">
            <input
              id="callsign-input"
              type="text"
              maxLength={14}
              value={editingCallsign}
              onChange={(e) => setEditingCallsign(e.target.value)}
              placeholder="Enter Callsign"
              className="flex-1 bg-white border-2 border-[#2d2a26] rounded-lg px-3 py-1.5 font-sketch text-base font-bold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#fde047]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-[#fde047] hover:bg-[#facc15] border-2 border-[#2d2a26] rounded-lg font-sketch text-sm font-bold text-[#1e293b] shadow-[2px_2px_0px_#2d2a26] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer flex items-center gap-1"
            >
              {savedSuccess ? <Check size={16} /> : 'Save'}
            </button>
          </div>
        </form>

        {/* Guest Progress Warning & Login Option */}
        {isGuest && onOpenAuth && (
          <div className="bg-[#fef3c7] border-2 border-[#d97706] rounded-xl p-2.5 mb-3 text-center shadow-[2px_2px_0px_#d97706]">
            <p className="font-sketch text-xs font-bold text-[#92400e] mb-1.5">
              ⚠️ Playing as Guest · Scores won't sync across devices
            </p>
            <button
              onClick={onOpenAuth}
              className="text-xs font-sketch font-black text-[#1e293b] bg-[#fde047] hover:bg-[#facc15] px-3 py-1 rounded-lg border border-[#2d2a26] shadow-[1px_1px_0px_#2d2a26] cursor-pointer"
            >
              Log In to Save Progress
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            data-start="true"
            onClick={onRestart}
            className="flex items-center justify-center gap-2 py-3 bg-[#fde047] hover:bg-[#facc15] active:translate-x-0.5 active:translate-y-0.5 text-[#1e293b] font-sketch text-2xl font-black border-2 border-[#2d2a26] rounded-xl shadow-[4px_4px_0px_#2d2a26] cursor-pointer transition-all"
          >
            <RotateCcw size={22} />
            FLY AGAIN
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onOpenLeaderboard}
              className="flex items-center justify-center gap-1.5 py-2 bg-[#ffffff] hover:bg-[#f8fafc] active:translate-x-0.5 active:translate-y-0.5 text-[#2d2a26] font-sketch text-sm font-bold border-2 border-[#2d2a26] rounded-lg shadow-[2px_2px_0px_#2d2a26] cursor-pointer"
            >
              <Trophy size={16} className="text-[#eab308]" />
              Leaderboard
            </button>

            <button
              onClick={onOpenChallenges}
              className="flex items-center justify-center gap-1.5 py-2 bg-[#ffffff] hover:bg-[#f8fafc] active:translate-x-0.5 active:translate-y-0.5 text-[#2d2a26] font-sketch text-sm font-bold border-2 border-[#2d2a26] rounded-lg shadow-[2px_2px_0px_#2d2a26] cursor-pointer"
            >
              <Calendar size={16} className="text-[#0284c7]" />
              Daily Tasks
            </button>
          </div>

          <button
            onClick={onHome}
            className="flex items-center justify-center gap-1.5 py-2 text-[#64748b] hover:text-[#1e293b] font-sketch text-base font-bold cursor-pointer"
          >
            <Home size={16} />
            Back to Title
          </button>
        </div>
      </div>
    </div>
  );
};
