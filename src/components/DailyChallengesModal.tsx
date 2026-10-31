import React from 'react';
import { X, Calendar, CheckCircle2, Gift } from 'lucide-react';
import { DailyChallenge } from '../game/types';

interface DailyChallengesModalProps {
  challenges: DailyChallenge[];
  onClaim: (challengeId: string) => void;
  onClose: () => void;
  dateStr: string;
}

export const DailyChallengesModal: React.FC<DailyChallengesModalProps> = ({
  challenges,
  onClaim,
  onClose,
  dateStr,
}) => {
  return (
    <div className="absolute inset-0 bg-[#2d2a26]/50 flex items-center justify-center p-4 z-30 select-none">
      <div className="bg-[#fffef9] border-3 border-[#2d2a26] rounded-2xl shadow-[6px_6px_0px_#2d2a26] p-5 max-w-md w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#e2e8f0]">
          <div className="flex items-center gap-2">
            <Calendar className="text-[#0284c7]" size={26} />
            <div>
              <h2 className="font-title text-3xl font-extrabold text-[#1e293b] leading-none">
                Daily Flight Log
              </h2>
              <span className="font-sketch text-xs font-bold text-[#64748b]">
                {dateStr} · Resets midnight
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close daily challenges"
            className="w-8 h-8 flex items-center justify-center bg-[#f1f5f9] hover:bg-[#e2e8f0] border-2 border-[#2d2a26] rounded-full active:translate-x-0.5 active:translate-y-0.5 cursor-pointer text-[#2d2a26]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Challenge Cards */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {challenges.map((c) => {
            const progressPct = Math.min(100, Math.round((c.currentCount / c.targetCount) * 100));
            const isFinished = c.currentCount >= c.targetCount;

            return (
              <div
                key={c.id}
                className="bg-[#faf8f0] border-2 border-[#2d2a26] rounded-xl p-3.5 shadow-[2px_2px_0px_#2d2a26]"
              >
                <div className="flex justify-between items-start mb-1.5">
                  <div>
                    <h3 className="font-sketch text-lg font-bold text-[#1e293b]">
                      {c.title}
                    </h3>
                    <p className="font-sketch text-xs text-[#64748b] leading-tight">
                      {c.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-[#fffef9] border border-[#2d2a26] px-2 py-0.5 rounded-full text-xs font-sketch font-bold text-[#2d2a26]">
                    <span>📎</span> +{c.rewardClips}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-2.5">
                  <div className="flex justify-between text-xs font-sketch font-bold text-[#64748b] mb-1">
                    <span>Progress</span>
                    <span className="tabular-nums">
                      {Math.min(c.currentCount, c.targetCount)} / {c.targetCount}
                    </span>
                  </div>
                  <div className="w-full h-3 bg-[#e2e8f0] border border-[#2d2a26] rounded-full overflow-hidden p-0.5">
                    <div
                      className="h-full bg-[#10b981] rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Claim CTA */}
                <div className="mt-3 flex justify-end">
                  {c.claimed ? (
                    <span className="flex items-center gap-1 font-sketch text-xs font-bold text-[#10b981]">
                      <CheckCircle2 size={16} /> Claimed
                    </span>
                  ) : isFinished ? (
                    <button
                      onClick={() => onClaim(c.id)}
                      className="flex items-center gap-1.5 px-3 py-1 bg-[#fde047] hover:bg-[#facc15] border-2 border-[#2d2a26] rounded-lg font-sketch text-xs font-bold text-[#1e293b] shadow-[2px_2px_0px_#2d2a26] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer animate-pulse"
                    >
                      <Gift size={14} /> Claim +{c.rewardClips} Paperclips
                    </button>
                  ) : (
                    <span className="font-sketch text-xs font-bold text-[#94a3b8]">
                      In Flight...
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t-2 border-[#e2e8f0] text-center">
          <p className="font-sketch text-xs font-bold text-[#64748b]">
            Complete all three daily missions to earn paperclips and unlock custom origami designs!
          </p>
        </div>
      </div>
    </div>
  );
};
