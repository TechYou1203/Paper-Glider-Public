import React, { useState, useEffect, useCallback } from 'react';
import { X, Trophy, Globe, Flame, RefreshCw, Sparkles, ShieldCheck } from 'lucide-react';
import { LeaderboardEntry, ServerLeaderboardEntry } from '../game/types';
import { fetchLeaderboard, fetchDailyLeaderboard } from '../api/client';

interface LeaderboardModalProps {
  entries: LeaderboardEntry[];
  userCallsign: string;
  userHighScore: number;
  onClose: () => void;
  isOnline?: boolean;
  isGuest?: boolean;
  onOpenAuth?: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  entries: initialEntries,
  userCallsign,
  userHighScore,
  onClose,
  isOnline = false,
  isGuest = false,
  onOpenAuth,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'today'>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialEntries);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const mapServerEntry = (e: ServerLeaderboardEntry): LeaderboardEntry => ({
    id: `server-${e.rank}-${e.playerId || e.callsign}`,
    callsign: e.callsign,
    score: e.score,
    clips: e.clips,
    date: e.achievedAt ? e.achievedAt.split('T')[0] : new Date().toISOString().split('T')[0],
    planeSkin: e.skin || 'classic',
    country: '🌐',
    isPlayer: e.isPlayer || e.callsign === userCallsign,
  });

  const loadGlobalLeaderboard = useCallback(
    async (tab: 'all' | 'today') => {
      setIsLoading(true);
      try {
        const fetcher = tab === 'all' ? fetchLeaderboard : fetchDailyLeaderboard;
        const remote = await fetcher(100);
        if (remote) {
          const mapped = remote.map(mapServerEntry);
          setEntries(mapped);
          setLastRefreshed(new Date());
        }
      } catch (err) {
        console.warn('Failed to load global leaderboard:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [userCallsign]
  );

  // Fetch live global leaderboard whenever modal opens or tab changes
  useEffect(() => {
    loadGlobalLeaderboard(activeTab);
  }, [activeTab, loadGlobalLeaderboard]);

  return (
    <div className="absolute inset-0 bg-[#2d2a26]/60 backdrop-blur-xs flex items-center justify-center p-4 z-40 select-none animate-in fade-in duration-150">
      <div className="bg-[#fffef9] border-3 border-[#2d2a26] rounded-2xl shadow-[6px_6px_0px_#2d2a26] p-5 max-w-md w-full max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#e2e8f0]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#fef08a] border-2 border-[#2d2a26] flex items-center justify-center text-[#854d0e] shadow-[2px_2px_0px_#2d2a26]">
              <Trophy size={22} className="text-[#eab308]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-title text-2xl sm:text-3xl font-extrabold text-[#1e293b] leading-tight">
                  Global Aviators
                </h2>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-sketch text-xs font-bold text-[#0284c7]">
                  Official Global Leaderboard
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Refresh Button */}
            <button
              onClick={() => loadGlobalLeaderboard(activeTab)}
              disabled={isLoading}
              title="Refresh Official Global Leaderboard"
              aria-label="Refresh leaderboard"
              className="w-8 h-8 flex items-center justify-center bg-[#f1f5f9] hover:bg-[#e2e8f0] border-2 border-[#2d2a26] rounded-full active:translate-x-0.5 active:translate-y-0.5 cursor-pointer text-[#2d2a26] transition-transform"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin text-[#0284c7]' : ''} />
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              aria-label="Close leaderboard"
              className="w-8 h-8 flex items-center justify-center bg-[#f1f5f9] hover:bg-[#e2e8f0] border-2 border-[#2d2a26] rounded-full active:translate-x-0.5 active:translate-y-0.5 cursor-pointer text-[#2d2a26] transition-transform"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tabs: All-Time vs Today */}
        <div className="flex gap-2 my-3">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 font-sketch text-xs sm:text-sm font-bold border-2 border-[#2d2a26] rounded-xl cursor-pointer transition-all ${
              activeTab === 'all'
                ? 'bg-[#fde047] shadow-[2px_2px_0px_#2d2a26] text-[#1e293b]'
                : 'bg-white hover:bg-slate-50 text-[#64748b]'
            }`}
          >
            <Globe size={15} /> All-Time Legends
          </button>
          <button
            onClick={() => setActiveTab('today')}
            className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 font-sketch text-xs sm:text-sm font-bold border-2 border-[#2d2a26] rounded-xl cursor-pointer transition-all ${
              activeTab === 'today'
                ? 'bg-[#fde047] shadow-[2px_2px_0px_#2d2a26] text-[#1e293b]'
                : 'bg-white hover:bg-slate-50 text-[#64748b]'
            }`}
          >
            <Flame size={15} /> Today's Drafts
          </button>
        </div>

        {/* Loading Indicator Pill */}
        {isLoading && (
          <div className="flex items-center justify-center gap-1.5 py-1 text-xs font-sketch font-bold text-[#0284c7] bg-[#e0f2fe] rounded-lg border border-[#38bdf8] mb-2 animate-pulse">
            <RefreshCw size={12} className="animate-spin" />
            <span>Retrieving official worldwide rankings from Neon DB...</span>
          </div>
        )}

        {/* Leaderboard Table List */}
        <div className="flex-1 overflow-y-auto pr-1 my-1 divide-y divide-[#f1f5f9]">
          {entries.length === 0 && !isLoading ? (
            <div className="py-12 px-4 text-center font-sketch">
              <div className="w-14 h-14 mx-auto mb-3 bg-[#fef08a] border-2 border-[#2d2a26] rounded-2xl flex items-center justify-center text-2xl shadow-[3px_3px_0px_#2d2a26]">
                ✈️
              </div>
              <p className="text-lg font-bold text-[#1e293b] mb-1">
                The Global Sky is Open!
              </p>
              <p className="text-xs text-[#64748b] max-w-xs mx-auto mb-3">
                No flight records have been logged {activeTab === 'today' ? 'today ' : 'on the global server '}yet.
              </p>
              <div className="inline-flex items-center gap-1.5 bg-[#f0fdf4] border border-[#86efac] px-3 py-1 rounded-full text-xs font-bold text-[#166534]">
                <Sparkles size={12} />
                <span>Launch a flight to claim #1 Worldwide!</span>
              </div>
            </div>
          ) : (
            entries.map((entry, index) => {
              const isUser = entry.isPlayer || entry.callsign === userCallsign;
              const rank = index + 1;

              return (
                <div
                  key={entry.id || `entry-${rank}`}
                  className={`flex items-center justify-between py-2 px-2.5 rounded-xl transition-colors ${
                    isUser
                      ? 'bg-[#fef9c3] border-2 border-[#2d2a26] shadow-[2px_2px_0px_#2d2a26] my-1'
                      : 'hover:bg-[#f8fafc]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Rank Badge */}
                    <div
                      className={`w-7 h-7 flex items-center justify-center rounded-lg font-sketch text-sm font-black border border-[#2d2a26] ${
                        rank === 1
                          ? 'bg-[#facc15] text-[#1e293b] shadow-[1px_1px_0px_#2d2a26]'
                          : rank === 2
                          ? 'bg-[#cbd5e1] text-[#1e293b]'
                          : rank === 3
                          ? 'bg-[#fed7aa] text-[#1e293b]'
                          : 'bg-[#f1f5f9] text-[#64748b]'
                      }`}
                    >
                      {rank}
                    </div>

                    {/* Callsign & Skin */}
                    <div className="text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{entry.country || '🌐'}</span>
                        <span
                          className={`font-sketch text-base font-bold ${
                            isUser ? 'text-[#1e293b] font-black' : 'text-[#334155]'
                          }`}
                        >
                          {entry.callsign} {isUser && <span className="text-[#0284c7] font-black">(You)</span>}
                        </span>
                      </div>
                      <span className="font-sketch text-[11px] text-[#94a3b8] uppercase tracking-wider">
                        Skin: {entry.planeSkin || 'classic'}
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

        {/* Footer */}
        <div className="pt-3 border-t-2 border-[#e2e8f0] text-center space-y-1.5">
          {isGuest && onOpenAuth ? (
            <div className="bg-[#fef3c7] border border-[#f59e0b] rounded-lg py-1.5 px-2 flex items-center justify-between gap-2">
              <span className="font-sketch text-[11px] font-bold text-[#92400e] text-left">
                Guest Mode · Sign in to save your score & rank on the official leaderboard!
              </span>
              <button
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="shrink-0 text-xs font-sketch font-black text-[#1e293b] bg-[#fde047] hover:bg-[#facc15] px-2.5 py-1 rounded-md border border-[#2d2a26] shadow-[1px_1px_0px_#2d2a26] cursor-pointer"
              >
                Sign In
              </button>
            </div>
          ) : (
            <p className="font-sketch text-xs font-bold text-[#64748b]">
              Your Record: <span className="text-[#1e293b] font-bold">{userCallsign}</span> · Best:{' '}
              <span className="text-[#0284c7] font-title text-base font-bold tabular-nums">
                {userHighScore}
              </span>
            </p>
          )}
          <div className="flex items-center justify-center gap-1 text-[11px] font-sketch text-[#94a3b8]">
            <ShieldCheck size={12} className="text-emerald-500" />
            <span>Anti-cheat verified · Synchronized across all verified pilots</span>
          </div>
        </div>
      </div>
    </div>
  );
};
