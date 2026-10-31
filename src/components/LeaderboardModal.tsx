import React, { useState } from 'react';
import { X, Trophy, Globe, Flame } from 'lucide-react';
import { LeaderboardEntry } from '../game/types';

interface LeaderboardModalProps {
  entries: LeaderboardEntry[];
  userCallsign: string;
  userHighScore: number;
  onClose: () => void;
  isOnline?: boolean;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  entries,
  userCallsign,
  userHighScore,
  onClose,
  isOnline = false,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'today'>('all');

  const todayStr = new Date().toISOString().split('T')[0];

  const filteredEntries = activeTab === 'all'
    ? entries
    : entries.filter((e) => e.date === todayStr);

  return (
    <div className="absolute inset-0 bg-[#2d2a26]/50 flex items-center justify-center p-4 z-30 select-none">
      <div className="bg-[#fffef9] border-3 border-[#2d2a26] rounded-2xl shadow-[6px_6px_0px_#2d2a26] p-5 max-w-md w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#e2e8f0]">
          <div className="flex items-center gap-2">
            <Trophy className="text-[#eab308]" size={26} />
            <div className="flex items-center gap-2">
              <h2 className="font-title text-3xl font-extrabold text-[#1e293b]">
                Global Aviators
              </h2>
              {isOnline && (
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-sketch font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                  Neon Cloud
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close leaderboard"
            className="w-8 h-8 flex items-center justify-center bg-[#f1f5f9] hover:bg-[#e2e8f0] border-2 border-[#2d2a26] rounded-full active:translate-x-0.5 active:translate-y-0.5 cursor-pointer text-[#2d2a26]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs: All Time vs Today */}
        <div className="flex gap-2 my-3">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 font-sketch text-sm font-bold border-2 border-[#2d2a26] rounded-lg cursor-pointer transition-all ${
              activeTab === 'all'
                ? 'bg-[#fde047] shadow-[2px_2px_0px_#2d2a26]'
                : 'bg-white hover:bg-slate-50 text-[#64748b]'
            }`}
          >
            <Globe size={15} /> All-Time Legends
          </button>
          <button
            onClick={() => setActiveTab('today')}
            className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 font-sketch text-sm font-bold border-2 border-[#2d2a26] rounded-lg cursor-pointer transition-all ${
              activeTab === 'today'
                ? 'bg-[#fde047] shadow-[2px_2px_0px_#2d2a26]'
                : 'bg-white hover:bg-slate-50 text-[#64748b]'
            }`}
          >
            <Flame size={15} /> Today's Drafts
          </button>
        </div>

        {/* Leaderboard Table List */}
        <div className="flex-1 overflow-y-auto pr-1 my-1 divide-y divide-[#f1f5f9]">
          {filteredEntries.length === 0 ? (
            <div className="py-10 px-4 text-center text-[#64748b] font-sketch">
              <p className="text-lg font-bold text-[#1e293b] mb-1">
                No flight records logged {activeTab === 'today' ? 'today ' : ''}yet!
              </p>
              <p className="text-sm">
                Launch a flight to record your score on the leaderboard.
              </p>
            </div>
          ) : (
            filteredEntries.map((entry, index) => {
              const isUser = entry.isPlayer || entry.callsign === userCallsign;
              const rank = index + 1;

              return (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between py-2 px-2.5 rounded-lg transition-colors ${
                    isUser
                      ? 'bg-[#fef9c3] border-2 border-[#2d2a26] shadow-[2px_2px_0px_#2d2a26] my-1'
                      : 'hover:bg-[#f8fafc]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Rank Badge */}
                    <div
                      className={`w-7 h-7 flex items-center justify-center rounded-md font-sketch text-sm font-black border border-[#2d2a26] ${
                        rank === 1
                          ? 'bg-[#facc15] text-[#1e293b]'
                          : rank === 2
                          ? 'bg-[#cbd5e1] text-[#1e293b]'
                          : rank === 3
                          ? 'bg-[#fed7aa] text-[#1e293b]'
                          : 'bg-[#f1f5f9] text-[#64748b]'
                      }`}
                    >
                      {rank}
                    </div>

                    {/* Country & Callsign */}
                    <div className="text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{entry.country || '✈️'}</span>
                        <span className={`font-sketch text-base font-bold ${isUser ? 'text-[#1e293b] font-black' : 'text-[#334155]'}`}>
                          {entry.callsign} {isUser && '(You)'}
                        </span>
                      </div>
                      <span className="font-sketch text-xs text-[#94a3b8] uppercase tracking-wider">
                        Skin: {entry.planeSkin}
                      </span>
                    </div>
                  </div>

                  {/* Score & Paperclips */}
                  <div className="text-right">
                    <span className="block font-title text-2xl font-black text-[#1e293b] tabular-nums leading-tight">
                      {entry.score}
                    </span>
                    <span className="font-sketch text-xs font-bold text-[#64748b] flex items-center justify-end gap-0.5">
                      📎 {entry.clips}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t-2 border-[#e2e8f0] text-center">
          <p className="font-sketch text-xs font-bold text-[#64748b]">
            Your Record: <span className="text-[#1e293b] font-bold">{userCallsign}</span> · Best: <span className="text-[#1e293b] font-title text-base font-bold tabular-nums">{userHighScore}</span>
          </p>
        </div>
      </div>
    </div>
  );
};
