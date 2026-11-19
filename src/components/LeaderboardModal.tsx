import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Trophy, Globe, Flame, RefreshCw, Sparkles, ShieldCheck, WifiOff } from 'lucide-react';
import { LeaderboardEntry, ServerLeaderboardEntry, LeaderboardResponse } from '../game/types';
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

function mapServerEntry(entry: ServerLeaderboardEntry): LeaderboardEntry {
  return {
    id: `server-${entry.playerId}`,
    playerId: entry.playerId,
    rank: entry.rank,
    callsign: entry.callsign,
    score: entry.score,
    clips: entry.clips,
    date: entry.achievedAt ? entry.achievedAt.split('T')[0] : new Date().toISOString().slice(0, 10),
    planeSkin: entry.skin || 'classic',
    country: '🌐',
    isPlayer: entry.isPlayer,
    achievedAt: entry.achievedAt,
  };
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
  const [playerEntry, setPlayerEntry] = useState<ServerLeaderboardEntry | null>(null);
  const [totalPlayers, setTotalPlayers] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const loadedTabRef = useRef<'all' | 'today'>('all');
  const requestIdRef = useRef(0);

  const loadGlobalLeaderboard = useCallback(
    async (tab: 'all' | 'today') => {
      // Rapid tab switches can leave multiple requests in flight. Only the most
      // recent one may write state, otherwise a slow "Today" response could
      // replace the "All-Time" board with rows from the wrong day.
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      // Never show yesterday's/all-time rows under the wrong tab while a
      // request is in flight or fails.
      if (loadedTabRef.current !== tab) {
        setEntries([]);
        setPlayerEntry(null);
        setTotalPlayers(0);
      }
      try {
        const response: LeaderboardResponse | null = tab === 'all'
          ? await fetchLeaderboard(100)
          : await fetchDailyLeaderboard(100);

        if (requestId !== requestIdRef.current) return;

        if (response) {
          loadedTabRef.current = tab;
          setEntries(response.entries.map(mapServerEntry));
          setPlayerEntry(response.playerEntry);
          setTotalPlayers(response.totalPlayers);
          setIsOffline(false);
          setLastRefreshed(new Date());
        } else {
          setIsOffline(true);
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        console.warn('Failed to load global leaderboard:', err);
        setIsOffline(true);
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    []
  );

  // Fetch the live global leaderboard whenever the modal opens or tab changes.
  useEffect(() => {
    loadGlobalLeaderboard(activeTab);
  }, [activeTab, loadGlobalLeaderboard]);

  const pinnedEntry = playerEntry && !entries.some((entry) => entry.playerId === playerEntry.playerId)
    ? mapServerEntry(playerEntry)
    : null;

  const renderRow = (entry: LeaderboardEntry, index: number, pinned = false) => {
    const isUser = Boolean(entry.isPlayer);
    const rank = entry.rank ?? index + 1;

    return (
      <div
        key={entry.id || `entry-${rank}-${entry.callsign}`}
        className={`flex items-center justify-between py-2 px-2.5 rounded-xl transition-colors ${
          isUser
            ? 'bg-[#fef9c3] border-2 border-[#2d2a26] shadow-[2px_2px_0px_#2d2a26] my-1'
            : pinned
            ? 'bg-[#e0f2fe] border-2 border-[#0284c7] my-1'
            : 'hover:bg-[#f8fafc]'
        }`}
      >
        <div className="flex items-center gap-2.5">
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
  };

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
                <span className={`w-2 h-2 rounded-full ${isOffline ? 'bg-[#f59e0b]' : 'bg-emerald-500 animate-pulse'}`} />
                <span className="font-sketch text-xs font-bold text-[#0284c7]">
                  {isOffline
                    ? 'Offline · last loaded board'
                    : `Official Global Leaderboard${totalPlayers > 0 ? ` · ${totalPlayers} pilots` : ''}`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => loadGlobalLeaderboard(activeTab)}
              disabled={isLoading}
              title="Refresh Official Global Leaderboard"
              aria-label="Refresh leaderboard"
              className="w-8 h-8 flex items-center justify-center bg-[#f1f5f9] hover:bg-[#e2e8f0] border-2 border-[#2d2a26] rounded-full active:translate-x-0.5 active:translate-y-0.5 cursor-pointer text-[#2d2a26] transition-transform"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin text-[#0284c7]' : ''} />
            </button>

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

        {isLoading && (
          <div className="flex items-center justify-center gap-1.5 py-1 text-xs font-sketch font-bold text-[#0284c7] bg-[#e0f2fe] rounded-lg border border-[#38bdf8] mb-2 animate-pulse">
            <RefreshCw size={12} className="animate-spin" />
            <span>Retrieving official worldwide rankings from Neon DB...</span>
          </div>
        )}

        {isOffline && !isLoading && (
          <div className="flex items-center justify-center gap-1.5 py-1 text-[11px] font-sketch font-bold text-[#92400e] bg-[#fef3c7] rounded-lg border border-[#f59e0b] mb-2">
            <WifiOff size={12} />
            <span>Server unreachable · scores shown may be stale</span>
          </div>
        )}

        {/* Leaderboard Table List */}
        <div className="flex-1 overflow-y-auto pr-1 my-1 divide-y divide-[#f1f5f9]">
          {entries.length === 0 && !pinnedEntry && !isLoading ? (
            <div className="py-12 px-4 text-center font-sketch">
              <div className="w-14 h-14 mx-auto mb-3 bg-[#fef08a] border-2 border-[#2d2a26] rounded-2xl flex items-center justify-center text-2xl shadow-[3px_3px_0px_#2d2a26]">
                ✈️
              </div>
              <p className="text-lg font-bold text-[#1e293b] mb-1">
                The Global Sky is Open!
              </p>
              <p className="text-xs text-[#64748b] max-w-xs mx-auto mb-3">
                No official flight records have been logged {activeTab === 'today' ? 'today ' : 'on the global server '}yet.
              </p>
              {!isGuest && (
                <div className="inline-flex items-center gap-1.5 bg-[#f0fdf4] border border-[#86efac] px-3 py-1 rounded-full text-xs font-bold text-[#166534]">
                  <Sparkles size={12} />
                  <span>Launch a flight to claim #1 Worldwide!</span>
                </div>
              )}
            </div>
          ) : (
            <>
              {entries.map((entry, index) => renderRow(entry, index))}
              {pinnedEntry && (
                <>
                  <div className="flex items-center gap-2 py-2 px-1">
                    <div className="h-px flex-1 bg-[#cbd5e1]" />
                    <span className="font-sketch text-[10px] font-bold uppercase tracking-wider text-[#64748b]">
                      Your position
                    </span>
                    <div className="h-px flex-1 bg-[#cbd5e1]" />
                  </div>
                  {renderRow(pinnedEntry, -1, true)}
                </>
              )}
            </>
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
              Your Record: <span className="text-[#1e293b] font-bold">{userCallsign}</span> ·{' '}
              {activeTab === 'today' ? 'Today' : 'Best'}:{' '}
              <span className="text-[#0284c7] font-title text-base font-bold tabular-nums">
                {playerEntry?.score ?? (activeTab === 'today' ? '—' : userHighScore)}
              </span>
              {playerEntry && (
                <>
                  {' '}· Rank:{' '}
                  <span className="text-[#0284c7] font-title text-base font-bold tabular-nums">
                    #{playerEntry.rank}
                  </span>
                  {totalPlayers > 0 && <span className="text-[#94a3b8]"> of {totalPlayers}</span>}
                </>
              )}
            </p>
          )}
          <div className="flex items-center justify-center gap-1 text-[11px] font-sketch text-[#94a3b8]">
            <ShieldCheck size={12} className="text-emerald-500" />
            <span>Replay-verified · Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
